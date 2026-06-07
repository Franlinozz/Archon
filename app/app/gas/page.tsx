import { readFile } from "node:fs/promises";
import path from "node:path";
import { GasOptimizerStudio } from "./studio-client";

export default async function Page() {
  const initialSource = await readFile(path.join(process.cwd(), "contracts/VaultV2.sol"), "utf8").catch(() => "// Paste Solidity source here\npragma solidity ^0.8.24;\ncontract VaultV2 {}\n");
  return <GasOptimizerStudio initialSource={initialSource} />;
}
