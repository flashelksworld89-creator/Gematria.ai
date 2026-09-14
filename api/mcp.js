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
      description:
        "Checks whether the Gematria AI connector is online and reachable.",
      inputSchema: {}
    },
    async () => {
      return {
        content: [
          {
            type: "text",
            text:
              "Gematria AI is online. The ChatGPT connector is working and ready for Gematria tools."
          }
        ]
      };
    }
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

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Keep a normal browser test available.
  if (req.method === "GET") {
    return res.status(200).json({
      name: "Gematria AI MCP",
      status: "online",
      mcp: true,
      message: "Gematria MCP endpoint is running."
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const server = createServer();

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    res.on("close", () => {
      transport.close();
    });

    await server.connect(transport);

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        error: "MCP server error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
