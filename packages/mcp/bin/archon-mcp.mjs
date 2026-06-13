#!/usr/bin/env node
// Archon MCP server. Default transport is stdio (Claude Desktop/Code, generic
// MCP clients). Pass --http <port> for a Streamable HTTP/SSE endpoint behind a
// reverse proxy. Read-only: every tool is a thin client of the Archon public API.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { tools, apiBase } from "../src/tools.mjs";

function toInputSchema(schema) {
  const properties = {}; const required = [];
  for (const [k, v] of Object.entries(schema)) {
    properties[k] = { type: v.type, description: v.description };
    if (!/optional|default/i.test(v.description)) required.push(k);
  }
  return { type: "object", properties, required };
}

const server = new Server({ name: "archon-mcp", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description, inputSchema: toInputSchema(t.schema) })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = tools[request.params.name];
  if (!tool) throw new Error(`Unknown tool: ${request.params.name}`);
  try {
    return await tool.handler(request.params.arguments ?? {});
  } catch (error) {
    return { content: [{ type: "text", text: `Archon error: ${error?.message ?? error}` }], isError: true };
  }
});

const httpFlag = process.argv.indexOf("--http");
if (httpFlag !== -1) {
  // Streamable HTTP transport for remote agents (configure proxy keepalive/timeouts).
  const port = Number(process.argv[httpFlag + 1] || 8848);
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
  const { createServer } = await import("node:http");
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  createServer((req, res) => {
    if (req.url === "/health") { res.writeHead(200).end("ok"); return; }
    transport.handleRequest(req, res);
  }).listen(port, () => console.error(`archon-mcp HTTP on :${port} · API ${apiBase()}`));
} else {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`archon-mcp (stdio) ready · API ${apiBase()}`);
}
