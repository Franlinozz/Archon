import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);

type SolcModule = {
  version: () => string;
  compile: (input: string) => string;
};

type CompilerOutput = {
  errors?: Array<{ severity?: string; formattedMessage?: string; message?: string }>;
  contracts?: Record<string, Record<string, { abi?: unknown; evm?: { bytecode?: { object?: string } } }>>;
};

function loadSolc(pragma: string): SolcModule {
  // Exact pragmas such as `pragma solidity 0.8.24;` reject solc 0.8.30.
  // Keep 0.8.24 available because many Mantle/Foundry contracts pin it exactly.
  if (/^=?\s*0\.8\.24\s*$/.test(pragma.trim())) return require("solc-0-8-24") as SolcModule;
  return require("solc") as SolcModule;
}

function formatErrors(output: CompilerOutput) {
  return (output.errors ?? []).map((error) => error.formattedMessage ?? error.message ?? "Unknown solc error").join("\n").trim();
}

function shortVersion(solc: SolcModule) {
  return solc.version().split("+")[0] ?? solc.version();
}

export async function compileSoliditySource(args: { workdir: string; sourceFile: string; outDir?: string; pragma?: string }) {
  const outDir = args.outDir ?? path.join(args.workdir, "build");
  await mkdir(outDir, { recursive: true });
  const source = await readFile(args.sourceFile, "utf8");
  const sourceName = path.relative(args.workdir, args.sourceFile).replace(/\\/g, "/");
  const pragma = args.pragma ?? source.match(/pragma\s+solidity\s+([^;]+);/)?.[1]?.trim() ?? "^0.8.24";
  const solc = loadSolc(pragma);
  const input = {
    language: "Solidity",
    sources: { [sourceName]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input))) as CompilerOutput;
  const fatal = (output.errors ?? []).filter((error) => error.severity === "error");
  if (fatal.length) {
    const details = formatErrors({ errors: fatal });
    throw new Error(`solc ${shortVersion(solc)} failed for pragma ${pragma}:\n${details}`);
  }

  const contracts = output.contracts?.[sourceName] ?? {};
  const entries = Object.entries(contracts);
  if (!entries.length) throw new Error(`solc ${shortVersion(solc)} produced no contracts for ${path.basename(args.sourceFile)}.`);
  const sourceStem = path.basename(args.sourceFile, path.extname(args.sourceFile));
  for (const [contractName, artifact] of entries) {
    const bytecode = artifact.evm?.bytecode?.object ?? "";
    await writeFile(path.join(outDir, `${sourceStem}_${contractName}.bin`), bytecode);
    await writeFile(path.join(outDir, `${sourceStem}_${contractName}.abi`), JSON.stringify(artifact.abi ?? [], null, 2));
  }
  return { compilerVersion: solc.version(), contractNames: entries.map(([name]) => name), warnings: (output.errors ?? []).filter((error) => error.severity !== "error").map((error) => error.formattedMessage ?? error.message ?? "Unknown solc warning") };
}
