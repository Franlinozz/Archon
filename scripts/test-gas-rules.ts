import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runGasOptimizationRules } from "../lib/gas/rules";

const fixturePath = join(process.cwd(), "lib/gas/__fixtures__/GasRulesFixture.sol");
const source = readFileSync(fixturePath, "utf8");
const results = runGasOptimizationRules({ source, sourceFile: fixturePath });
const ids = new Set(results.map((item) => item.id));
const required = [
  "storage-packing",
  "calldata-over-memory",
  "calldata-smaller-types",
  "custom-errors",
  "immutable-constant",
  "cache-repeated-sload",
  "unchecked-loop-increment",
  "loop-hygiene",
  "nonzero-comparison",
  "external-vs-public",
  "bitmap-bools",
  "remove-zero-init",
  "indexed-events-vs-storage",
];

const missing = required.filter((id) => !ids.has(id));
if (missing.length) {
  console.error("Missing gas rules:", missing.join(", "));
  console.error("Observed:", [...ids].sort().join(", "));
  process.exit(1);
}

for (const result of results) {
  if (!result.where.includes(":")) throw new Error(`${result.id} missing where`);
  if (!result.before.trim()) throw new Error(`${result.id} missing before`);
  if (!result.after.trim()) throw new Error(`${result.id} missing after`);
  if (!result.patch.oldText) throw new Error(`${result.id} missing patch.oldText`);
  if (!result.patch.newText) throw new Error(`${result.id} missing patch.newText`);
  if (!source.includes(result.patch.oldText)) throw new Error(`${result.id} oldText is not an exact fixture excerpt`);
  if (result.confidence <= 0 || result.confidence > 1) throw new Error(`${result.id} confidence out of range`);
  if (!['storage', 'calldata', 'computation', 'deployment'].includes(result.category)) throw new Error(`${result.id} bad category`);
  if (!['safe', 'review'].includes(result.safety)) throw new Error(`${result.id} bad safety`);
}

console.log(`gas rules ok: ${results.length} findings across ${required.length} locked detectors`);
