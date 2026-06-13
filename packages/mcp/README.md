# archon-mcp

Give any AI agent a **Mantle security sense**. The Archon MCP server exposes four read-only tools over the [Model Context Protocol](https://modelcontextprotocol.io); each is a thin client of the Archon public API.

| Tool | What it does |
| --- | --- |
| `archon_scan_source(source)` | Audit Solidity → severity-ranked findings + report URL |
| `archon_verdict(address)` | Signed trust verdict for a deployed Mantle contract (recovers to ERC-8004 Agent #97) |
| `archon_gas_report(source, callsPerYear?)` | Receipt-calibrated L2/DA gas report |
| `archon_verify_proof(reportHash)` | Verify an anchored on-chain proof by report hash |

## Run

```bash
npx --yes github:Franlinozz/archon-mcp        # stdio (Claude Desktop/Code)
npx --yes github:Franlinozz/archon-mcp --http 8848   # Streamable HTTP/SSE
```

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "archon": { "command": "npx", "args": ["--yes", "github:Franlinozz/archon-mcp"] }
  }
}
```

Set `ARCHON_API` to point at a self-hosted Archon (default `https://archonaudit.xyz`).

Verdicts are **risk intelligence with provenance, not safety guarantees**. Read-only: nothing here signs transactions or moves funds. Full docs: <https://archonaudit.xyz/docs/platform-api/for-agents>
