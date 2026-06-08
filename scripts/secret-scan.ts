import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";

const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
const ignoredFiles = new Set(["pnpm-lock.yaml", ".env.example", "scripts/secret-scan.ts"]);
const binaryExtensions = new Set([
  ".avif",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".webp",
  ".woff",
  ".woff2",
]);
const files = output
  .split("\n")
  .filter(Boolean)
  .filter((file) => !ignoredFiles.has(file))
  .filter((file) => existsSync(file))
  .filter((file) => !binaryExtensions.has(extname(file).toLowerCase()));
const patterns = [
  /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
  /(?:private[_\s-]?key|secret[_\s-]?key|wallet[_\s-]?key|DEPLOYER_PRIVATE_KEY|MANTLE_PRIVATE_KEY)\s*[:=]\s*0x[a-fA-F0-9]{64}/i,
  /service_role/i,
  /postgres(?:ql)?:\/\/[^\s]+:[^\s]+@/i,
  /eyJhbGciOiJ[\w.-]+/,
];
const offenders: string[] = [];
for (const file of files) {
  const buffer = readFileSync(file);
  if (buffer.includes(0)) continue;
  const content = buffer.toString("utf8");
  if (patterns.some((pattern) => pattern.test(content))) offenders.push(file);
}
if (offenders.length) {
  console.error(`Potential secret patterns found in tracked/untracked files:\n${offenders.join("\n")}`);
  process.exit(1);
}
console.log("secret scan passed");
