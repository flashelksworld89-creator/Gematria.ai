import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

function createServer() {
  const server = new McpServer({
    name: "gematria-ai",
    version: "1.0.0"
  });

  server.registerTool(
    "gematria_status",
    {
      title: "Gematria Status",
      description: "Checks whether the Gematria AI connector is online.",
      inputSchema: {}
    },
    async () => ({
      content: [
        {
          type: "text",
          text: "Gematria AI connector is online and working."
        }
      ]
    })
  );

  return server;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Mcp-Session-Id"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const server = createServer();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  try {
    await server.connect(transport);

    await transport.handleRequest(
      req,
      res,
      req.body
    );
  } catch (error) {
    console.error("MCP ERROR:", error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal MCP server error"
        },
        id: null
      });
    }
  }
}
