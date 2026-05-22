import { readFile } from "node:fs/promises";
import path from "node:path";
import { AuditStudioClient } from "./studio-client";

export default async function Page() {
  const vaultSource = await readFile(path.join(process.cwd(), "contracts", "VaultV2.sol"), "utf8");
  return <AuditStudioClient initialSource={vaultSource} />;
}
