import { readFileSync } from "node:fs";
import { collectProtocolRuleFindings } from "../lib/scan/stages";

const cases = [
  {
    file: "contracts/fixtures/MantleSequencerSensitive.sol",
    expected: "mantle-timestamp-assumption",
  },
  {
    file: "contracts/fixtures/OriginAdmin.sol",
    expected: "mantle-origin-auth",
  },
];

for (const item of cases) {
  const source = readFileSync(item.file, "utf8");
  const findings = collectProtocolRuleFindings(source, item.file);
  if (!findings.some((finding) => finding.category === item.expected)) {
    console.error(`missing ${item.expected} for ${item.file}`, findings.map((finding) => finding.category));
    process.exit(1);
  }
  console.log(`mantle rule ok: ${item.expected}`);
}

process.exit(0);
