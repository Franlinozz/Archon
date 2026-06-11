import "dotenv/config";
import { createHash } from "node:crypto";
import { db, closeDb } from "@/lib/db/client";

type Showcase = { name: string; ref: string; source: string; title: string; category: string; l2: number; annual: number };

const showcases: Showcase[] = [
  {
    name: "VaultV2",
    ref: "showcase:flawed-vault-v2",
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract VaultV2 { mapping(address=>uint256) public balances; function deposit() external payable { balances[msg.sender]+=msg.value; } function withdraw(uint256 amount) external { require(balances[msg.sender]>=amount,"BAL"); (bool ok,)=msg.sender.call{value:amount}(""); require(ok,"SEND"); balances[msg.sender]-=amount; } }`,
    title: "Move state update before external transfer",
    category: "checks-effects-interactions",
    l2: 18200,
    annual: 86,
  },
  {
    name: "CalldataHeavyRouter",
    ref: "showcase:calldata-heavy-router",
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract CalldataHeavyRouter { event Routed(address indexed user, bytes route); function route(bytes memory routeData, address[] memory path) external { require(path.length > 1, "PATH"); emit Routed(msg.sender, routeData); } }`,
    title: "Use calldata for external route payloads",
    category: "calldata-optimization",
    l2: 9400,
    annual: 44,
  },
  {
    name: "LaunchToken",
    ref: "showcase:oz-import-token",
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract LaunchToken is ERC20 { constructor() ERC20("Launch Token", "LAUNCH") { _mint(msg.sender, 1_000_000 ether); } }`,
    title: "OpenZeppelin import resolution smoke",
    category: "dependency-resolution",
    l2: 5100,
    annual: 25,
  },
  {
    name: "StorageHeavyRegistry",
    ref: "showcase:storage-heavy-registry",
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract StorageHeavyRegistry { struct Entry { address owner; uint96 weight; string uri; } Entry[] public entries; function add(address owner, uint96 weight, string memory uri) external { entries.push(Entry(owner, weight, uri)); } function countOwners(address owner) external view returns (uint256 count) { for (uint256 i; i < entries.length; i++) if (entries[i].owner == owner) count++; } }`,
    title: "Cache array length in registry scans",
    category: "storage-loop-optimization",
    l2: 12100,
    annual: 58,
  },
];

function sha256(value: string) { return `0x${createHash("sha256").update(value).digest("hex")}`; }
function reportHash(item: Showcase) { return createHash("sha256").update(`archon.showcase:${item.name}:${sha256(item.source)}`).digest("hex"); }

let inserted = 0;
for (const item of showcases) {
  const sourceHash = sha256(item.source);
  const exists = await db.query("select id from gas_reports where source_hash=$1 and source_kind='sample' limit 1", [sourceHash]);
  if (exists.rowCount) continue;
  const totals = { annualSavingsUsd: item.annual, l2GasSavedPerCall: item.l2, l1DaWeiSavedPerCall: "0", assumptions: { callsPerYear: 100000, mntUsd: 1, sample: true } };
  const assumptions = { callsPerYear: 100000, mntUsd: 1, note: "Sample-labeled showcase row for public curation; not a third-party production deployment." };
  const report = await db.query<{ id: string }>(
    `insert into gas_reports (source_kind, source_ref, source_code, source_hash, contract_name, network, status, progress, current_stage, totals, assumptions, report_hash, created_at, started_at, finished_at)
     values ('sample',$1,$2,$3,$4,'mantle-mainnet','done',100,'Done',$5::jsonb,$6::jsonb,$7,now(),now(),now()) returning id`,
    [item.ref, item.source, sourceHash, item.name, JSON.stringify(totals), JSON.stringify(assumptions), reportHash(item)],
  );
  await db.query(
    `insert into gas_optimizations (gas_report_id, rule_id, title, category, file, line_start, location, before, after, safety, confidence, status, measurement_label, est_l2_delta, est_l1_delta_wei, annual_savings_usd, rank_score, notes)
     values ($1,$2,$3,$4,$5,1,$6,$7,$8,'safe',0.82,'open','estimated',$9,0,$10,$11,'Sample-labeled public showcase optimization.')`,
    [report.rows[0]!.id, `showcase-${item.name.toLowerCase()}`, item.title, item.category, `${item.name}.sol`, `${item.name}.sol:1`, "showcase baseline", "optimized pattern", item.l2, item.annual, item.l2 + item.annual * 100],
  );
  inserted += 1;
}
console.log(JSON.stringify({ ok: true, inserted, totalShowcases: showcases.length }, null, 2));
await closeDb();
