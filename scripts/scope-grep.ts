import { execFileSync } from "node:child_process";
const files = execFileSync("git", ["ls-files", "app/(marketing)"], { encoding: "utf8" }).split("\n").filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));
const deny = /\b(yield|portfolio|rwa|autonomous trading|trading|allocation)\b/i;
const offenders: string[] = [];
for (const file of files) {
  const content = execFileSync("git", ["show", `:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (deny.test(content)) offenders.push(file);
}
if (offenders.length) {
  console.error(`Forbidden marketing scope language found:\n${offenders.join("\n")}`);
  process.exit(1);
}
console.log("marketing scope grep passed");
