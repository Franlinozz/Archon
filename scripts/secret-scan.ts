import { execFileSync } from "node:child_process";
const output = execFileSync("git", ["ls-files"], { encoding: "utf8" });
const files = output
  .split("\n")
  .filter(Boolean)
  .filter((file) => !["pnpm-lock.yaml", ".env.example", "scripts/secret-scan.ts"].includes(file));
const patterns = [
  /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
  /0x[a-fA-F0-9]{64}/,
  /service_role/i,
  /postgres(?:ql)?:\/\/[^\s]+:[^\s]+@/i,
  /eyJhbGciOiJ[\w.-]+/,
];
const offenders: string[] = [];
for (const file of files) {
  const content = execFileSync("git", ["show", `:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (patterns.some((pattern) => pattern.test(content))) offenders.push(file);
}
if (offenders.length) {
  console.error(`Potential secret patterns found in tracked files:\n${offenders.join("\n")}`);
  process.exit(1);
}
console.log("secret scan passed");
