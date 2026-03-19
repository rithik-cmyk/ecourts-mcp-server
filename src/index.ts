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
