import { createRequire } from "node:module";
import { createPublicClient, http, isAddress, keccak256, type Address, type Hex } from "viem";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { mantleMainnet } from "@/lib/chain/mantle";
import { canonicalize, deterministicReportHash } from "@/lib/proof/canonical";

// Verified build attestations (F2): prove that the runtime bytecode deployed at
// a Mantle address matches claimed Solidity source compiled with declared
// settings. 100% deterministic — no AI anywhere in this path. Comparison is on
// RUNTIME bytecode only (constructor args never enter the comparison, which is
// exactly why runtime — not creation — bytecode is compared). Match types:
//   exact            — byte-for-byte (after immutable-reference masking)
//   partial-metadata — equal once each side's CBOR metadata trailer is removed
//                      (same executable code, different metadata hash)
//   mismatch         — the code genuinely differs
// Compile/config failures are a distinct "error" status, never a mismatch.

const require = createRequire(import.meta.url);

type SolcModule = { version: () => string; compile: (input: string, callbacks?: { import?: (path: string) => { contents?: string; error?: string } }) => string };

function loadSolc(version: string): SolcModule {
  // Exact-pin support mirrors lib/solidity/compiler.ts: 0.8.24 ships pinned.
  if (/0\.8\.24/.test(version)) return require("solc-0-8-24") as SolcModule;
  return require("solc") as SolcModule;
}

export type AttestationInput = {
  address: string;
  sourceFiles: Array<{ path: string; source: string }>;
  contractName: string;
  compilerVersion: string; // e.g. "0.8.24"
  settings: { optimizerEnabled: boolean; optimizerRuns: number; evmVersion?: string };
  sourceRef?: string | null; // e.g. repo@commit, for the record only
};

type ImmutableRef = Array<{ start: number; length: number }>;

export function createAttestation(input: AttestationInput) {
  if (!isAddress(input.address)) throw new Error("Enter a valid Mantle contract address.");
  if (!input.sourceFiles.length || input.sourceFiles.length > 40) throw new Error("Provide 1–40 Solidity source files.");
  const totalBytes = input.sourceFiles.reduce((sum, f) => sum + Buffer.byteLength(f.source, "utf8"), 0);
  if (totalBytes > 700_000) throw new Error("Source bundle too large (700 KB cap).");
  const sourceHash = keccak256(Buffer.from(canonicalize(input.sourceFiles.map((f) => ({ path: f.path, source: f.source })))));
  return db.query<{ id: string }>(
    `insert into attestations (address, source_ref, contract_name, compiler_version, settings, source_hash, source_bundle, status)
     values ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,'queued') returning id`,
    [input.address.toLowerCase(), input.sourceRef ?? null, input.contractName, input.compilerVersion, JSON.stringify(input.settings), sourceHash, JSON.stringify(input.sourceFiles)],
  ).then((r) => ({ id: r.rows[0]!.id, sourceHash }));
}

const strip0x = (hex: string) => hex.replace(/^0x/, "").toLowerCase();

/** Zero the immutable-reference ranges (byte offsets into runtime code) in a hex string. */
function maskImmutables(hex: string, refs: ImmutableRef): string {
  let out = hex;
  for (const ref of refs) {
    const start = ref.start * 2;
    const end = start + ref.length * 2;
    if (end <= out.length) out = out.slice(0, start) + "0".repeat(end - start) + out.slice(end);
  }
  return out;
}

/** Strip the CBOR metadata trailer (last two bytes encode its length). */
function stripMetadata(hex: string): { code: string; metadataBytes: number } | null {
  if (hex.length < 4) return null;
  const len = parseInt(hex.slice(-4), 16);
  const total = (len + 2) * 2;
  if (!Number.isFinite(len) || len <= 0 || total >= hex.length) return null;
  return { code: hex.slice(0, hex.length - total), metadataBytes: len + 2 };
}

export async function runAttestation(id: string) {
  const row = (await db.query<{ address: string; contract_name: string; compiler_version: string; settings: { optimizerEnabled: boolean; optimizerRuns: number; evmVersion?: string }; source_bundle: Array<{ path: string; source: string }>; source_ref: string | null; source_hash: string }>(
    `select address, contract_name, compiler_version, settings, source_bundle, source_ref, source_hash from attestations where id=$1`, [id],
  )).rows[0];
  if (!row) throw new Error("Attestation not found");

  try {
    // 1) On-chain runtime bytecode (RPC ground truth).
    const pc = createPublicClient({ chain: mantleMainnet, transport: http(process.env.MANTLE_RPC_URL ?? "https://rpc.mantle.xyz") });
    const onchain = await pc.getCode({ address: row.address as Address });
    if (!onchain || onchain === "0x") throw new Error("No contract bytecode at this address on Mantle Mainnet.");

    // 2) Compile the claimed source with the declared settings.
    const solc = loadSolc(row.compiler_version);
    const actualVersion = solc.version();
    if (!actualVersion.includes(row.compiler_version)) {
      // Declared compiler isn't available locally: that is a CONFIG error, not a bytecode mismatch.
      await db.query(`update attestations set status='failed', error=$2, finished_at=now() where id=$1`, [id, `Declared compiler ${row.compiler_version} is not available (have ${actualVersion}). This is a configuration limitation, not a bytecode mismatch.`]);
      return;
    }
    const sources = Object.fromEntries(row.source_bundle.map((f) => [f.path, { content: f.source }]));
    const input = {
      language: "Solidity",
      sources,
      settings: {
        optimizer: { enabled: row.settings.optimizerEnabled, runs: row.settings.optimizerRuns },
        ...(row.settings.evmVersion ? { evmVersion: row.settings.evmVersion } : {}),
        outputSelection: { "*": { "*": ["evm.deployedBytecode.object", "evm.deployedBytecode.immutableReferences"] } },
      },
    };
    const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
      errors?: Array<{ severity?: string; formattedMessage?: string; message?: string }>;
      contracts?: Record<string, Record<string, { evm?: { deployedBytecode?: { object?: string; immutableReferences?: Record<string, ImmutableRef> } } }>>;
    };
    const fatal = (output.errors ?? []).filter((e) => e.severity === "error");
    if (fatal.length) {
      await db.query(`update attestations set status='failed', error=$2, finished_at=now() where id=$1`, [id, `solc failed: ${fatal.map((e) => e.formattedMessage ?? e.message).join("\n").slice(0, 1200)}`]);
      return;
    }
    let artifact: { object?: string; immutableReferences?: Record<string, ImmutableRef> } | undefined;
    for (const file of Object.values(output.contracts ?? {})) {
      if (file[row.contract_name]?.evm?.deployedBytecode) { artifact = file[row.contract_name]!.evm!.deployedBytecode; break; }
    }
    if (!artifact?.object) throw new Error(`Contract "${row.contract_name}" not found in the compiled output.`);

    // 3) Compare runtime bytecode, immutables masked via compiler-emitted ranges.
    const refs: ImmutableRef = Object.values(artifact.immutableReferences ?? {}).flat();
    const onchainHex = maskImmutables(strip0x(onchain), refs);
    const compiledHex = maskImmutables(strip0x(artifact.object), refs);
    let matchType: "exact" | "partial-metadata" | "mismatch" = "mismatch";
    if (onchainHex === compiledHex) matchType = "exact";
    else {
      const a = stripMetadata(onchainHex);
      const b = stripMetadata(compiledHex);
      if (a && b && a.code === b.code) matchType = "partial-metadata";
    }

    const onchainHash = keccak256(`0x${strip0x(onchain)}` as Hex);
    const compiledHash = keccak256(`0x${strip0x(artifact.object)}` as Hex);
    const attestationHash = deterministicReportHash({
      schema: "archon.attestation.v1",
      address: row.address,
      chainId: 5000,
      sourceRef: row.source_ref,
      sourceHash: row.source_hash,
      contractName: row.contract_name,
      compiler: actualVersion,
      settings: row.settings,
      matchType,
      onchainBytecodeHash: onchainHash,
      compiledBytecodeHash: compiledHash,
    });
    await db.query(
      `update attestations set status='done', match_type=$2, onchain_bytecode_hash=$3, compiled_bytecode_hash=$4, attestation_hash=$5, compiler_version=$6, detail=$7::jsonb, finished_at=now() where id=$1`,
      [id, matchType, onchainHash, compiledHash, attestationHash, actualVersion, JSON.stringify({ immutableRefsMasked: refs.length, onchainBytes: strip0x(onchain).length / 2, compiledBytes: strip0x(artifact.object).length / 2 })],
    );
    logger.info({ id, matchType }, "attestation complete");
  } catch (error) {
    await db.query(`update attestations set status='failed', error=$2, finished_at=now() where id=$1`, [id, error instanceof Error ? error.message : String(error)]);
  }
}
