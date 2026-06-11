import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { formatEther, parseAbiItem, createPublicClient, createWalletClient, encodeFunctionData, http, isAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantle } from "viem/chains";
import archonProofRegistryAbi from "@/lib/chain/abis/ArchonProofRegistry.json";
import { getMantlePublicClient } from "@/lib/chain/mantle";
import { db } from "@/lib/db/client";
import { analyzeGasOptimizations } from "@/lib/gas/optimizer";
import { measureGasOptimizations, type GasMeasurementProfile } from "@/lib/gas/measurement";
import type { GasOptimizerProfile } from "@/lib/gas/optimizer";
import { proofRegistryAddress } from "@/lib/proof/archonRegistry";
import { deterministicReportHash } from "@/lib/proof/canonical";
import { compileSoliditySource } from "@/lib/solidity/compiler";
import { deriveContractName } from "@/lib/source/names";

const execFileAsync = promisify(execFile);
const FORGE_BIN = process.env.FORGE_BIN ?? "forge";
const MAX_GAS_SOURCE_BYTES = Number(process.env.ARCHON_GAS_MAX_SOURCE_BYTES ?? 350_000);
const DEFAULT_CALLS_PER_YEAR = Number(process.env.ARCHON_GAS_CALLS_PER_YEAR ?? 100_000);
const DEFAULT_MNT_USD = Number(process.env.ARCHON_GAS_MNT_USD ?? 1);
const GAS_TIMEOUT_MS = Number(process.env.ARCHON_GAS_WORKER_TIMEOUT_MS ?? 120_000);
const chain = { ...mantle, id: 5000 } as const;

export type GasSourceKind = "paste" | "sample" | "address";
export type SourceFileBundle = Array<{ path: string; source: string }>;
export type GasScanInput = { sourceKind: GasSourceKind; sourceCode?: string; sourceFiles?: SourceFileBundle; sourceRef?: string; contractLabel?: string; callsPerYear?: number; mntUsd?: number };

type GasReportRow = {
  id: string;
  source_code: string;
  contract_name: string | null;
  source_hash: string | null;
  assumptions: Record<string, unknown> | null;
  source_bundle: SourceFileBundle | null;
};

function sha256(value: string) {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

function contractName(source: string) {
  return deriveContractName(source);
}

function displayContractName(input: GasScanInput, source: string) {
  return deriveContractName(source, { label: input.contractLabel });
}

async function sourceFromAddress(address: string) {
  if (!isAddress(address)) throw new Error("Enter a valid Mantle contract address.");
  const explorerUrl = process.env.MANTLE_EXPLORER_API_URL ?? "https://explorer.mantle.xyz/api";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${explorerUrl}?module=contract&action=getsourcecode&address=${address}`, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Mantle explorer returned HTTP ${response.status}`);
    const payload = await response.json() as { result?: Array<{ SourceCode?: string; ContractName?: string }> };
    const raw = payload.result?.[0]?.SourceCode?.trim() ?? "";
    const source = raw.startsWith("{{") && raw.endsWith("}}") ? JSON.parse(raw.slice(1, -1)).sources : raw;
    if (typeof source === "string" && source.includes("pragma solidity")) return source;
    if (typeof source === "object" && source) {
      const first = Object.values(source).find((entry): entry is { content: string } => typeof (entry as { content?: unknown }).content === "string");
      if (first?.content) return first.content;
    }
    throw new Error("Mantle explorer did not return verified Solidity source for this address.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveGasSource(input: GasScanInput) {
  const source = input.sourceKind === "sample"
    ? await readFile(path.join(process.cwd(), "contracts/VaultV2.sol"), "utf8")
    : input.sourceKind === "address"
      ? await sourceFromAddress(input.sourceRef?.trim() ?? "")
      : input.sourceCode?.trim() ?? "";
  if (!source || !/pragma\s+solidity/.test(source) || !/\bcontract\s+[A-Za-z_][A-Za-z0-9_]*/.test(source)) throw new Error("Gas scan source must include a Solidity pragma and at least one contract.");
  if (Buffer.byteLength(source, "utf8") > MAX_GAS_SOURCE_BYTES) throw new Error(`Gas scan source exceeds ${MAX_GAS_SOURCE_BYTES} bytes.`);
  return { source, contractName: displayContractName(input, source), sourceHash: sha256(source) };
}

export async function createGasReport(input: GasScanInput) {
  const resolved = await resolveGasSource(input);
  const assumptions = {
    callsPerYear: Math.max(1, Math.round(input.callsPerYear ?? DEFAULT_CALLS_PER_YEAR)),
    mntUsd: Number.isFinite(input.mntUsd) && input.mntUsd! > 0 ? input.mntUsd : DEFAULT_MNT_USD,
    note: "$/yr uses callsPerYear × L2 gas delta × live/cached L2 gas price plus L1/DA delta. User should tune call volume for production traffic.",
  };
  const result = await db.query<{ id: string }>(
    `insert into gas_reports (source_kind, source_ref, source_code, source_bundle, source_hash, contract_name, network, status, progress, current_stage, assumptions, created_at)
     values ($1,$2,$3,$4::jsonb,$5,$6,'mantle-mainnet','queued',0,'Queued',$7::jsonb,now()) returning id`,
    [input.sourceKind, input.sourceRef ?? input.contractLabel ?? null, resolved.source, input.sourceFiles ? JSON.stringify(input.sourceFiles) : null, resolved.sourceHash, resolved.contractName, JSON.stringify(assumptions)],
  );
  return { id: result.rows[0]!.id, ...resolved, assumptions };
}

function safeBundlePath(rawPath: string) {
  const normalized = rawPath.replaceAll("\\", "/").split("/").filter(Boolean).join("/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("../") || normalized === ".." || !normalized.endsWith(".sol")) throw new Error(`Unsafe Solidity bundle path: ${rawPath}`);
  return normalized;
}

async function writeSourceWorkspace(workdir: string, source: string, bundle: SourceFileBundle | null | undefined, fallbackName: string) {
  if (bundle?.length) {
    let selected: string | null = null;
    for (const file of bundle) {
      const safePath = safeBundlePath(file.path);
      const target = path.join(workdir, safePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.source);
      if (!selected && file.source.trim() === source.trim()) selected = target;
    }
    if (selected) return selected;
  }
  const sourceFile = path.join(workdir, `${fallbackName}.sol`);
  await writeFile(sourceFile, source);
  return sourceFile;
}

async function compileSource(workdir: string, sourceFile: string, pragma?: string) {
  await compileSoliditySource({ workdir, sourceFile, pragma });
}

function applyHarness(contract: string) {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {${contract}} from "../src/${contract}.sol";

contract ${contract}ArchonGasApplyTest {
    ${contract} internal target;

    function setUp() public {
        target = new ${contract}();
    }

    function test_archon_apply_patch_compiles_and_deploys() public {
        if (address(target) == address(0)) revert("ARCHON_ZERO_TARGET");
    }
}
`;
}

function measuredFor(ruleId: string, measurement: GasMeasurementProfile | null | undefined) {
  return measurement?.patches.find((patch) => patch.ruleId === ruleId) ?? null;
}

function annualUsd(args: { l2Delta: number | null; l1Wei: bigint; l2GasPriceWei: bigint; callsPerYear: number; mntUsd: number }) {
  const l2 = BigInt(Math.max(0, args.l2Delta ?? 0)) * args.l2GasPriceWei;
  const totalWeiPerCall = l2 + args.l1Wei;
  return Number(formatEther(totalWeiPerCall)) * args.callsPerYear * args.mntUsd;
}

function totals(profile: GasOptimizerProfile, assumptions: Record<string, unknown>) {
  const measurement = profile.measurement;
  const l2GasPriceWei = BigInt(profile.pricing.l2GasPriceWei ?? "0");
  const callsPerYear = Number(assumptions.callsPerYear ?? DEFAULT_CALLS_PER_YEAR);
  const mntUsd = Number(assumptions.mntUsd ?? DEFAULT_MNT_USD);
  let l2Gas = 0;
  let l1Wei = 0n;
  let usd = 0;
  for (const opt of profile.opportunities) {
    const m = measuredFor(opt.id, measurement);
    const l2 = m?.status === "measured" ? m.l2GasDelta : opt.estL2Delta;
    const l1 = m?.l1DaDeltaWei ? BigInt(m.l1DaDeltaWei) : BigInt(Math.max(0, opt.estL1Delta ?? 0));
    l2Gas += Math.max(0, l2 ?? 0);
    l1Wei += l1;
    usd += annualUsd({ l2Delta: l2, l1Wei: l1, l2GasPriceWei, callsPerYear, mntUsd });
  }
  return {
    l2GasSavedPerCall: l2Gas,
    l1DaWeiSavedPerCall: l1Wei.toString(),
    annualSavingsUsd: Number(usd.toFixed(2)),
    split: { l2WeiPerCall: (BigInt(l2Gas) * l2GasPriceWei).toString(), l1DaWeiPerCall: l1Wei.toString() },
    assumptions: { callsPerYear, mntUsd, l2GasPriceWei: l2GasPriceWei.toString(), priceSource: "env/default cached assumption; user-adjustable" },
  };
}

async function updateStage(id: string, stage: string, progress: number, status = "running") {
  await db.query("update gas_reports set status=$2,current_stage=$3,progress=$4,started_at=coalesce(started_at,now()) where id=$1", [id, status, stage, progress]);
}

export async function runGasReport(gasReportId: string) {
  const row = (await db.query<GasReportRow>("select id, source_code, source_bundle, contract_name, source_hash, assumptions from gas_reports where id=$1", [gasReportId])).rows[0];
  if (!row) throw new Error("Gas report not found");
  const workdir = await mkdtemp(path.join(tmpdir(), `archon-gas-${gasReportId}-`));
  try {
    await updateStage(gasReportId, "Compiling", 10);
    const sourceFile = await writeSourceWorkspace(workdir, row.source_code, row.source_bundle, row.contract_name ?? contractName(row.source_code));
    await compileSource(workdir, sourceFile);

    await updateStage(gasReportId, "Detecting optimizations", 35);
    const analysis = await analyzeGasOptimizations({ source: row.source_code, sourceFile, workdir, contractName: row.contract_name ?? contractName(row.source_code) });
    await updateStage(gasReportId, "Measuring gas deltas", 65);
    const measurement = await measureGasOptimizations({ source: row.source_code, sourceFile, contractName: row.contract_name ?? contractName(row.source_code), opportunities: analysis.profile.opportunities });
    const profile = { ...analysis.profile, measurement };
    const total = totals(profile, row.assumptions ?? {});
    const reportHash = deterministicReportHash({ schema: "archon.gas.report.v1", gasReportId, sourceHash: row.source_hash, contractName: row.contract_name, totals: total, opportunities: profile.opportunities.map((o) => ({ id: o.id, where: o.where, before: o.before, after: o.after })) });

    await db.query("delete from gas_optimizations where gas_report_id=$1", [gasReportId]);
    for (const [index, opt] of profile.opportunities.entries()) {
      const m = measuredFor(opt.id, measurement);
      const label = m?.status === "measured" ? "measured" : (opt.estL2Delta != null || opt.estL1Delta != null ? "estimate" : "unpriced");
      const l1Wei = m?.l1DaDeltaWei ? BigInt(m.l1DaDeltaWei) : BigInt(Math.max(0, opt.estL1Delta ?? 0));
      const l2Delta = m?.status === "measured" ? m.l2GasDelta : opt.estL2Delta;
      const usd = annualUsd({ l2Delta, l1Wei, l2GasPriceWei: BigInt(profile.pricing.l2GasPriceWei ?? "0"), callsPerYear: Number(total.assumptions.callsPerYear), mntUsd: Number(total.assumptions.mntUsd) });
      await db.query(
        `insert into gas_optimizations (gas_report_id, rule_id, title, category, file, line_start, location, before, after, safety, confidence, status, measurement_label, est_l2_delta, measured_l2_delta, est_l1_delta_wei, measured_l1_delta_wei, annual_savings_usd, rank_score, patch, gas_diff, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'open',$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20::jsonb,$21)
         on conflict (gas_report_id, rule_id, location, before) do update set measurement_label=excluded.measurement_label, measured_l2_delta=excluded.measured_l2_delta, measured_l1_delta_wei=excluded.measured_l1_delta_wei, annual_savings_usd=excluded.annual_savings_usd, rank_score=excluded.rank_score, patch=excluded.patch, gas_diff=excluded.gas_diff, notes=excluded.notes`,
        [gasReportId, opt.id, opt.title, opt.category, opt.file, opt.lineStart, opt.where, opt.before, opt.after, opt.safety, opt.confidence, label, opt.estL2Delta, m?.status === "measured" ? m.l2GasDelta : null, opt.estL1Delta, m?.l1DaDeltaWei ?? null, usd, (usd * 1000) + Math.max(0, l2Delta ?? 0) - index, JSON.stringify(opt.patch), JSON.stringify(m ?? null), m?.note ?? opt.rationale],
      );
    }

    await db.query("update gas_reports set status='done', progress=100, current_stage='Done', pricing=$2::jsonb, measurement=$3::jsonb, totals=$4::jsonb, report_hash=$5, finished_at=now(), error=null where id=$1", [gasReportId, JSON.stringify(profile.pricing), JSON.stringify(measurement), JSON.stringify(total), reportHash]);
  } catch (error) {
    await db.query("update gas_reports set status='failed', current_stage='Failed', error=$2, finished_at=now() where id=$1", [gasReportId, error instanceof Error ? error.message : String(error)]);
    throw error;
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

async function loadGasReport(id: string) {
  const row = (await db.query<GasReportRow>("select id, source_code, source_bundle, contract_name, source_hash, assumptions from gas_reports where id=$1", [id])).rows[0];
  if (!row) throw new Error("Gas report not found");
  return row;
}

export async function runApplyPatch(gasReportId: string, optimizationId: string) {
  const report = await loadGasReport(gasReportId);
  const opt = (await db.query<{ id: string; patch: { oldText: string; newText: string } | null }>("select id, patch from gas_optimizations where gas_report_id=$1 and id=$2", [gasReportId, optimizationId])).rows[0];
  if (!opt?.patch) throw new Error("Optimization patch not found");
  const oldText = opt.patch.oldText;
  if ((report.source_code.split(oldText).length - 1) !== 1) throw new Error("Patch oldText no longer matches exactly once.");
  const patchedSource = report.source_code.replace(oldText, opt.patch.newText);
  const workdir = await mkdtemp(path.join(tmpdir(), `archon-apply-${gasReportId}-`));
  try {
    const name = report.contract_name ?? contractName(report.source_code);
    const srcDir = path.join(workdir, "src");
    const testDir = path.join(workdir, "test");
    await mkdir(srcDir, { recursive: true });
    await mkdir(testDir, { recursive: true });
    await writeFile(path.join(workdir, "foundry.toml"), "[profile.default]\nsrc = 'src'\ntest = 'test'\nout = 'out'\noptimizer = true\noptimizer_runs = 200\n");
    const sourceFile = path.join(srcDir, `${name}.sol`);
    await writeFile(sourceFile, patchedSource);
    await writeFile(path.join(testDir, `${name}.t.sol`), applyHarness(name));
    try {
      await compileSource(workdir, sourceFile);
    } catch (error) {
      const gasDiff = {
        status: "compile-failed",
        label: "dropped",
        gasReport: null,
        error: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000),
        generatedAt: new Date().toISOString(),
        note: "Patch was dropped because the patched source did not compile. Archon will not present this as a valid saving.",
      };
      await db.query("update gas_optimizations set status='patch-failed', gas_diff=$3::jsonb, notes=$4 where gas_report_id=$1 and id=$2", [gasReportId, optimizationId, JSON.stringify(gasDiff), gasDiff.note]);
      return { patchedSource: null, gasDiff };
    }
    const command = `${FORGE_BIN} test --gas-report --root ${workdir}`;
    let gasReport = "Compiled patched source with solcjs. Foundry harness not available for this contract shape yet.";
    try {
      const result = await execFileAsync(FORGE_BIN, ["test", "--gas-report", "--root", workdir], { timeout: GAS_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, env: process.env });
      gasReport = `${result.stdout}\n${result.stderr}`.trim();
    } catch (error) {
      gasReport = `solcjs compile passed; Foundry gas report degraded: ${error instanceof Error ? error.message : String(error)}`;
    }
    const gasDiff = { status: "compiled", command, gasReport, generatedAt: new Date().toISOString(), label: gasReport.includes("degraded") ? "estimate" : "foundry-gas-report" };
    await db.query("update gas_optimizations set status='patch-ready', gas_diff=$3::jsonb where gas_report_id=$1 and id=$2", [gasReportId, optimizationId, JSON.stringify({ ...gasDiff, patchedSource })]);
    return { patchedSource, gasDiff };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

export async function anchorGasReport(gasReportId: string) {
  const registry = proofRegistryAddress();
  if (!registry) throw new Error("ARCHON_PROOF_REGISTRY not configured.");
  const ownerKey = process.env.ARCHON_WALLET_PRIVATE_KEY as `0x${string}` | undefined;
  if (!ownerKey) throw new Error("ARCHON_WALLET_PRIVATE_KEY must be configured.");
  const report = (await db.query("select id, report_hash, totals, contract_name from gas_reports where id=$1", [gasReportId])).rows[0] as { id: string; report_hash: string | null; totals: unknown; contract_name: string | null } | undefined;
  if (!report?.report_hash) throw new Error("Gas report is not ready to anchor.");
  const metadataUri = `${(process.env.ARCHON_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://archonaudit.xyz").replace(/\/$/, "")}/api/gas/reports/${gasReportId}`;
  const account = privateKeyToAccount(ownerKey);
  const pc = createPublicClient({ chain, transport: http(process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz") });
  const wc = createWalletClient({ account, chain, transport: http(process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz") });
  const riskScore = 1;
  const agentId = BigInt((process.env.ARCHON_AGENT_IDENTITY_REF ?? "0").split(":").at(-1) ?? "0");
  const args = [report.report_hash as `0x${string}`, metadataUri, riskScore, agentId] as const;
  const anchored = await pc.readContract({ address: registry, abi: archonProofRegistryAbi, functionName: "isAnchored", args: [report.report_hash as `0x${string}`] }).catch(() => false);
  if (!anchored) {
    await pc.simulateContract({ account: account.address, address: registry, abi: archonProofRegistryAbi, functionName: "logAuditProof", args });
    const gas = await pc.estimateContractGas({ account: account.address, address: registry, abi: archonProofRegistryAbi, functionName: "logAuditProof", args });
    const gasPrice = await getMantlePublicClient().getGasPrice();
    const data = encodeFunctionData({ abi: archonProofRegistryAbi, functionName: "logAuditProof", args });
    const nonce = await pc.getTransactionCount({ address: account.address, blockTag: "pending" });
    const serialized = await wc.signTransaction({ account, chain, to: registry, data, gas, gasPrice, nonce });
    const hash = await pc.sendRawTransaction({ serializedTransaction: serialized });
    const receipt = await pc.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 90_000 });
    if (receipt.status !== "success") throw new Error("Gas proof transaction reverted on-chain.");
    await db.query("update gas_reports set anchor_tx_hash=$2 where id=$1", [gasReportId, hash]);
    return { gasReportId, reportHash: report.report_hash, txHash: hash, metadataUri, explorer: `https://mantlescan.xyz/tx/${hash}` };
  }
  return { gasReportId, reportHash: report.report_hash, alreadyAnchored: true, txHash: null, metadataUri };
}

export const GAS_PROOF_EVENT = parseAbiItem("event AuditProofLogged(bytes32 indexed reportHash, address indexed loggedBy, uint256 indexed agentId, uint8 riskScore, string metadataURI, uint64 timestamp)");
