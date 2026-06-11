import { readFile } from "node:fs/promises";
import path from "node:path";
import { compileSoliditySource } from "../lib/solidity/compiler";
import { cleanupContext, createInitialContext } from "../lib/scan/stages";
import type { ScanRecord } from "../lib/scan/types";

const root = process.cwd();

type Fixture = {
  name: string;
  mainPath: string;
  extraPaths?: string[];
  contractName: string;
};

const fixtures: Fixture[] = [
  { name: "OZ v5 ERC721", mainPath: "fixtures/import-resolution/oz-v5-erc721/NiftyDrop.sol", contractName: "NiftyDrop" },
  { name: "OZ v4 ERC20", mainPath: "fixtures/import-resolution/oz-v4-erc20/LaunchToken.sol", contractName: "LaunchToken" },
  { name: "Solmate vault", mainPath: "fixtures/import-resolution/solmate-vault/SolmateVault.sol", contractName: "SolmateVault" },
  {
    name: "Repo remappings",
    mainPath: "fixtures/import-resolution/remappings-repo/src/MappedToken.sol",
    extraPaths: ["fixtures/import-resolution/remappings-repo/remappings.txt", "fixtures/import-resolution/remappings-repo/foundry.toml"],
    contractName: "MappedToken",
  },
];

async function bundleFor(fixture: Fixture) {
  const paths = [fixture.mainPath, ...(fixture.extraPaths ?? [])];
  return Promise.all(paths.map(async (filePath) => ({
    path: filePath.replace(/^fixtures\/import-resolution\/[^/]+\//, ""),
    source: await readFile(path.join(root, filePath), "utf8"),
  })));
}

async function runFixture(fixture: Fixture) {
  const source = await readFile(path.join(root, fixture.mainPath), "utf8");
  const scan: ScanRecord = {
    id: `00000000-0000-4000-8000-${fixture.name.toLowerCase().replace(/[^a-z0-9]/g, "").padEnd(12, "0").slice(0, 12)}`,
    source_kind: "paste",
    source_ref: fixture.contractName,
    source_code: source,
    source_bundle: await bundleFor(fixture),
    network: "mantle-mainnet",
    scan_depth: "deep",
    protocols: ["mETH"],
    status: "queued",
  };
  const ctx = await createInitialContext(scan);
  try {
    if (ctx.reducedMode) throw new Error(`${fixture.name} unexpectedly entered reduced mode: ${ctx.reducedMode.unresolvedImports.join(", ")}`);
    const result = await compileSoliditySource({ workdir: ctx.workdir, sourceFile: ctx.sourceFile, pragma: ctx.pragma });
    if (!result.contractNames.includes(fixture.contractName)) throw new Error(`${fixture.name} compiled without ${fixture.contractName}; got ${result.contractNames.join(", ")}`);
    console.log(`import fixture ok: ${fixture.name} (${result.compilerVersion.split("+")[0]})`);
  } finally {
    await cleanupContext(ctx);
  }
}

for (const fixture of fixtures) await runFixture(fixture);
process.exit(0);
