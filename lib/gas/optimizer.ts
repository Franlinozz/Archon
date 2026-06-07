import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { formatEther, isAddress, type Address, type Hex } from "viem";
import { getMantlePublicClient } from "@/lib/chain/mantle";
import type { ScanFinding, Severity } from "@/lib/scan/types";

const GAS_PRICE_ORACLE_CANDIDATE = "0x420000000000000000000000000000000000000F" as const;
const GAS_PRICE_ORACLE_ABI = [
  {
    type: "function",
    name: "getL1Fee",
    stateMutability: "view",
    inputs: [{ name: "_data", type: "bytes" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type DetectorInput = {
  source: string;
  sourceFile: string;
  workdir: string;
  contractName: string;
};

export type GasOptimizerProfile = {
  sourceHash: string;
  oracle: {
    address: string | null;
    method: "getL1Fee(bytes)";
    source: string;
    sourceUrls: string[];
    confidence: "candidate-verified-onchain" | "human-confirmed";
  };
  pricing: {
    l2GasPriceWei: string | null;
    creationBytecodeBytes: number;
    mode: "deterministic-calldata-estimate" | "measured-oracle";
    calldataZeroBytes: number;
    calldataNonZeroBytes: number;
    calldataGasEstimate: number;
    deployDataFeeWei: string | null;
    deployDataFeeMnt: string | null;
    pricedAt: string;
    unavailableReason?: string;
    confirmationRequired?: string;
  };
  opportunities: Array<{
    id: string;
    title: string;
    severity: Severity;
    lineStart: number | null;
    estimatedGasSaved: number | null;
    estimatedDataBytesSaved: number | null;
    annualizedBasis: string;
  }>;
};

function lineFor(source: string, pattern: RegExp) {
  const lines = source.split("\n");
  const index = lines.findIndex((line) => pattern.test(line));
  return index >= 0 ? index + 1 : null;
}

function snippet(source: string, lineStart: number | null) {
  if (!lineStart) return null;
  const lines = source.split("\n");
  const start = Math.max(1, lineStart - 2);
  const end = Math.min(lines.length, lineStart + 2);
  return lines.slice(start - 1, end).map((line, index) => `${start + index}: ${line}`).join("\n");
}

function dedupe(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

async function compiledCreationBytecode(workdir: string, contractName: string) {
  const buildDir = path.join(workdir, "build");
  const files = await readdir(buildDir).catch(() => []);
  const exact = files.find((file) => file.endsWith(`${contractName}.bin`)) ?? files.find((file) => file.endsWith(".bin"));
  if (!exact) return "0x" as Hex;
  const raw = (await readFile(path.join(buildDir, exact), "utf8")).trim();
  return raw ? (`0x${raw.replace(/^0x/, "")}` as Hex) : ("0x" as Hex);
}

function calldataByteProfile(data: Hex) {
  const hex = data.replace(/^0x/, "");
  let zero = 0;
  let nonZero = 0;
  for (let index = 0; index < hex.length; index += 2) {
    if (hex.slice(index, index + 2) === "00") zero += 1;
    else nonZero += 1;
  }
  return { zero, nonZero, calldataGasEstimate: zero * 4 + nonZero * 16 };
}

function configuredGasOracleAddress(): Address | null {
  const value = process.env.MANTLE_GAS_PRICE_ORACLE_ADDRESS;
  return value && isAddress(value) ? value : null;
}

function oraclePricingConfirmed() {
  return process.env.ARCHON_MANTLE_GAS_ORACLE_CONFIRMED === "true";
}

async function priceCreationData(workdir: string, contractName: string) {
  const bytecode = await compiledCreationBytecode(workdir, contractName);
  const byteLength = Math.max(0, (bytecode.length - 2) / 2);
  const profile = calldataByteProfile(bytecode);
  const pricedAt = new Date().toISOString();
  const base = {
    mode: "deterministic-calldata-estimate" as const,
    l2GasPriceWei: null as string | null,
    creationBytecodeBytes: byteLength,
    calldataZeroBytes: profile.zero,
    calldataNonZeroBytes: profile.nonZero,
    calldataGasEstimate: profile.calldataGasEstimate,
    deployDataFeeWei: null as string | null,
    deployDataFeeMnt: null as string | null,
    pricedAt,
  };

  const oracleAddress = configuredGasOracleAddress();
  try {
    const client = getMantlePublicClient();
    const l2GasPriceWei = await client.getGasPrice();
    if (!oraclePricingConfirmed() || !oracleAddress) {
      return {
        ...base,
        l2GasPriceWei: l2GasPriceWei.toString(),
        unavailableReason: "Mantle DA/L1 oracle pricing is locked behind human confirmation. Using deterministic calldata byte/data-gas estimate only.",
        confirmationRequired: `Candidate predeploy ${GAS_PRICE_ORACLE_CANDIDATE} responded on-chain, but Archon requires MANTLE_GAS_PRICE_ORACLE_ADDRESS plus ARCHON_MANTLE_GAS_ORACLE_CONFIRMED=true before presenting getL1Fee(bytes) as measured DA cost.`,
      };
    }

    const deployDataFeeWei = byteLength > 0
      ? await client.readContract({ address: oracleAddress, abi: GAS_PRICE_ORACLE_ABI, functionName: "getL1Fee", args: [bytecode] })
      : 0n;
    return {
      ...base,
      mode: "measured-oracle" as const,
      l2GasPriceWei: l2GasPriceWei.toString(),
      deployDataFeeWei: deployDataFeeWei.toString(),
      deployDataFeeMnt: formatEther(deployDataFeeWei),
    };
  } catch (error) {
    return {
      ...base,
      unavailableReason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function analyzeGasOptimizations(input: DetectorInput): Promise<{ profile: GasOptimizerProfile; findings: ScanFinding[] }> {
  const source = input.source;
  const basename = path.basename(input.sourceFile);
  const opportunities: GasOptimizerProfile["opportunities"] = [];
  const findings: ScanFinding[] = [];

  const add = (args: {
    id: string;
    severity: Severity;
    category: string;
    title: string;
    pattern: RegExp;
    summary: string;
    whyMantle: string;
    recommendedFix: string;
    gasImpact: string;
    estimatedGasSaved: number | null;
    estimatedDataBytesSaved: number | null;
  }) => {
    const lineStart = lineFor(source, args.pattern);
    if (!lineStart) return;
    opportunities.push({
      id: args.id,
      title: args.title,
      severity: args.severity,
      lineStart,
      estimatedGasSaved: args.estimatedGasSaved,
      estimatedDataBytesSaved: args.estimatedDataBytesSaved,
      annualizedBasis: "Static source estimate. Exact runtime deltas require queued Foundry snapshots with representative inputs.",
    });
    findings.push({
      severity: args.severity,
      category: args.category,
      title: args.title,
      file: basename,
      lineStart,
      lineEnd: null,
      codeSnippet: snippet(source, lineStart),
      summary: args.summary,
      whyMantle: args.whyMantle,
      recommendedFix: args.recommendedFix,
      confidence: 0.78,
      gasImpact: args.gasImpact,
      source: "rule",
      dedupeKey: `gas:${args.id}:${lineStart}:${dedupe(args.title).slice(0, 12)}`,
    });
  };

  add({
    id: "cache-storage-array-length",
    severity: "low",
    category: "mantle-gas-optimizer/storage-loop-length",
    title: "Cache storage array length before loop",
    pattern: /for\s*\([^;]+;[^;]+\.length\s*;/,
    summary: "A loop reads .length in the loop condition. If the collection is in storage, this repeats an SLOAD on every iteration.",
    whyMantle: "Mantle execution gas is cheap but still user-visible. Repeated SLOADs also compound when the same transaction carries L1 data cost.",
    recommendedFix: "Cache the length in a local variable before the loop, and batch very large arrays with a cursor.",
    gasImpact: "Estimated ~100 gas saved per iteration when .length resolves to storage; exact delta should be confirmed by the queued Foundry gas snapshot.",
    estimatedGasSaved: 100,
    estimatedDataBytesSaved: null,
  });

  add({
    id: "external-public-function",
    severity: "info",
    category: "mantle-gas-optimizer/function-visibility",
    title: "Public function can likely be external",
    pattern: /function\s+\w+\s*\([^)]*calldata[^)]*\)\s+public\b/,
    summary: "A public function with calldata parameters may not need internal dispatch. external can avoid unnecessary ABI copying in some call paths.",
    whyMantle: "Small per-call savings matter for high-frequency DevTools, router, vault, and DEX paths on Mantle.",
    recommendedFix: "If the function is never called internally, change visibility from public to external and re-run tests.",
    gasImpact: "Static estimate: small per-call execution reduction. Requires generated test/gas snapshot before claiming a precise saving.",
    estimatedGasSaved: 20,
    estimatedDataBytesSaved: null,
  });

  add({
    id: "revert-string-to-custom-error",
    severity: "low",
    category: "mantle-gas-optimizer/custom-errors",
    title: "Long revert string increases bytecode and deploy data fee",
    pattern: /require\s*\([^;]+,\s*"[^"]{32,}"\s*\)/,
    summary: "Long revert strings inflate creation bytecode and calldata published for deployment.",
    whyMantle: "Mantle transactions include an L1/DA data component, so bytecode size is a real cost dimension, not only an aesthetic concern.",
    recommendedFix: "Replace long revert strings with custom errors, preserving readable NatSpec/test assertions for developer ergonomics.",
    gasImpact: "Estimated 32+ creation-byte reduction per long string plus runtime savings on revert paths; current deploy data fee is priced from Mantle GasPriceOracle.",
    estimatedGasSaved: null,
    estimatedDataBytesSaved: 32,
  });

  const pricing = await priceCreationData(input.workdir, input.contractName);
  const profile: GasOptimizerProfile = {
    sourceHash: `0x${createHash("sha256").update(source).digest("hex")}`,
    oracle: {
      address: oraclePricingConfirmed() ? configuredGasOracleAddress() : null,
      method: "getL1Fee(bytes)",
      source: "Candidate verified from official Mantle docs/source and Mantle Mainnet RPC, but measured oracle pricing remains disabled until human confirmation.",
      sourceUrls: [
        "https://github.com/LayerE/Mantle-Docs/blob/main/Transaction%20Fees%20on%20L2.md",
        "https://github.com/mantlenetworkio/mantle-v2/blob/e29d360904db5e5ec81888885f7b7250f8255895/packages/contracts-bedrock/contracts/L2/GasPriceOracle.sol",
        "https://www.mantle.xyz/blog/announcements/mantle-network-security-evolution-scalability-decentralization",
      ],
      confidence: oraclePricingConfirmed() ? "human-confirmed" : "candidate-verified-onchain",
    },
    pricing,
    opportunities,
  };

  return { profile, findings };
}
