#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { registerTools } from "./tools/index.js";

// ─── Server Initialisation ──────────────────────────────────────────

const server = new McpServer({
  name: "ecourts-mcp-server",
  version: "1.2.0",
});

// Register all EcourtsIndia tools on the server
registerTools(server);

// ─── Transport: stdio (default) ─────────────────────────────────────

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ecourts-mcp-server running on stdio");
}

// ─── Transport: Streamable HTTP ─────────────────────────────────────

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Landing page
  app.get("/", (_req, res) => {
    res.type("html").send(`<!DOCTYPE html>
<html><head><title>ecourts-mcp-server</title>
<style>body{font-family:system-ui;max-width:680px;margin:40px auto;padding:0 20px;color:#e0e0e0;background:#1a1a2e}
a{color:#6c9fff}code{background:#2a2a4a;padding:2px 6px;border-radius:4px}
h1{color:#fff}h2{color:#ccc;margin-top:2em}</style></head>
<body>
<h1>ecourts-mcp-server v1.2.0</h1>
<p>MCP server for the <a href="https://ecourtsindia.com">EcourtsIndia</a> Partner API &mdash; search Indian court cases, download orders, and access AI summaries.</p>
<h2>Endpoints</h2>
<ul>
<li><code>GET /health</code> &mdash; Health check</li>
<li><code>POST /mcp</code> &mdash; MCP protocol endpoint (JSON-RPC 2.0)</li>
</ul>
<h2>9 Tools</h2>
<ul>
<li><code>ecourts_search_cases</code> &mdash; Search with 30+ filters</li>
<li><code>ecourts_get_case</code> &mdash; Full case details by CNR</li>
<li><code>ecourts_lookup_case</code> &mdash; Find case by human-readable number</li>
<li><code>ecourts_get_order</code> &mdash; Download order PDF</li>
<li><code>ecourts_get_order_ai</code> &mdash; Order text + AI analysis</li>
<li><code>ecourts_get_court_structure</code> &mdash; Browse court hierarchy (free)</li>
<li><code>ecourts_search_causelist</code> &mdash; Search cause lists</li>
<li><code>ecourts_get_causelist_dates</code> &mdash; Available dates (free)</li>
<li><code>ecourts_refresh_case</code> &mdash; Queue fresh data scrape</li>
</ul>
<h2>Connect</h2>
<pre><code>claude mcp add ecourts-mcp -- npx ecourts-mcp-server</code></pre>
<p><a href="https://github.com/rithik-cmyk/ecourts-mcp-server">GitHub</a></p>
</body></html>`);
  });

  // Health check for load balancers and container orchestrators
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "ecourts-mcp-server", version: "1.2.0" });
  });

  // Each request gets its own stateless transport (no session, JSON response)
  app.post("/mcp", async (req, res) => {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => transport.close());
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("MCP request error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  app.listen(port, () => {
    console.error(`ecourts-mcp-server running on http://localhost:${port}/mcp`);
    console.error(`Health check: http://localhost:${port}/health`);
  });
}

// ─── Start ──────────────────────────────────────────────────────────

const transport = process.env.TRANSPORT || "stdio";
if (transport === "http") {
  runHTTP().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
} else {
  runStdio().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
