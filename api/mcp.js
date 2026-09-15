import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { createRemoteJWKSet, jwtVerify } from "jose";
async function verifyAccessToken(req) {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);

  const domain = process.env.AUTH0_DOMAIN;
  const audience = process.env.AUTH0_AUDIENCE;

  if (!domain || !audience) {
    throw new Error("Auth0 environment variables are not configured.");
  }

  const issuer = `https://${domain}/`;

  const JWKS = createRemoteJWKSet(
    new URL(`${issuer}.well-known/jwks.json`)
  );

  const { payload } = await jwtVerify(token, JWKS, {
    issuer,
    audience
  });

  return payload;
}

function createServer() {
  const server = new McpServer({
    name: "gematria-ai",
    version: "2.0.0"
  });

  // -----------------------------------
  // TOOL 1: STATUS
  // -----------------------------------

  server.registerTool(
    "gematria_status",
    {
      title: "Gematria Status",
      description:
        "Checks whether the Gematria AI connector and database are online.",
      inputSchema: {}
    },
    async () => {
      try {
        const sql = neon(process.env.DATABASE_URL);

        const entries = await sql`
          SELECT COUNT(*)::int AS count
          FROM gematria_entries
        `;

        const ciphers = await sql`
          SELECT COUNT(*)::int AS count
          FROM gematria_ciphers
        `;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "online",
                  savedEntries: entries[0]?.count || 0,
                  customCiphers: ciphers[0]?.count || 0
                },
                null,
                2
              )
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "database error",
                  message:
                    error instanceof Error
                      ? error.message
                      : String(error)
                },
                null,
                2
              )
            }
          ]
        };
      }
    }
  );

  // -----------------------------------
  // TOOL 2: SEARCH TERMINOLOGY
  // -----------------------------------

  server.registerTool(
    "search_gematria",
    {
      title: "Search Gematria",
      description:
        "Searches saved Gematria terminology, phrases, notes, cipher names, cipher values, and mean values.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "Word, phrase, note text, cipher name, or number to search for."
          )
      }
    },
    async ({ query }) => {
      const sql = neon(process.env.DATABASE_URL);

      const search = `%${query}%`;

      const rows = await sql`
        SELECT
          id,
          text,
          notes,
          results,
          mean,
          created_at,
          updated_at
        FROM gematria_entries
        WHERE
          text ILIKE ${search}
          OR notes ILIKE ${search}
          OR results::text ILIKE ${search}
          OR mean::text ILIKE ${search}
        ORDER BY updated_at DESC
        LIMIT 100
      `;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                query,
                count: rows.length,
                results: rows
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  // -----------------------------------
  // TOOL 3: LOOK UP NUMBER
  // -----------------------------------

  server.registerTool(
    "lookup_gematria_number",
    {
      title: "Lookup Gematria Number",
      description:
        "Finds saved terminology associated with a number through either a direct cipher value or an arithmetic mean.",
      inputSchema: {
        number: z
          .number()
          .describe(
            "The Gematria number or mean value to look up."
          )
      }
    },
    async ({ number }) => {
      const sql = neon(process.env.DATABASE_URL);

      const rows = await sql`
        SELECT
          id,
          text,
          notes,
          results,
          mean,
          created_at,
          updated_at
        FROM gematria_entries
        WHERE
          mean = ${number}
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(results) AS result
            WHERE
              CASE
                WHEN (result->>'value') ~ '^-?[0-9]+([.][0-9]+)?$'
                THEN (result->>'value')::numeric = ${number}
                ELSE FALSE
              END
          )
        ORDER BY text ASC
        LIMIT 250
      `;

      const matches = rows.map(row => {
        const cipherMatches = Array.isArray(row.results)
          ? row.results.filter(
              result => Number(result.value) === Number(number)
            )
          : [];

        return {
          id: row.id,
          text: row.text,
          notes: row.notes,
          mean: row.mean,
          meanMatch: Number(row.mean) === Number(number),
          cipherMatches,
          allResults: row.results
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                number,
                count: matches.length,
                matches
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  // -----------------------------------
  // TOOL 4: LIST CUSTOM CIPHERS
  // -----------------------------------

  server.registerTool(
    "list_gematria_ciphers",
    {
      title: "List Gematria Ciphers",
      description:
        "Lists all custom Gematria ciphers and their A-Z letter values.",
      inputSchema: {}
    },
    async () => {
      const sql = neon(process.env.DATABASE_URL);

      const rows = await sql`
        SELECT
          id,
          name,
          values,
          updated_at
        FROM gematria_ciphers
        ORDER BY name ASC
      `;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                count: rows.length,
                ciphers: rows
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  // -----------------------------------
  // TOOL 5: GET SAVED ENTRY
  // -----------------------------------

  server.registerTool(
    "get_gematria_entry",
    {
      title: "Get Gematria Entry",
      description:
        "Gets the complete saved Gematria record for an exact word or phrase.",
      inputSchema: {
        text: z
          .string()
          .min(1)
          .describe(
            "The exact saved word or phrase to retrieve."
          )
      }
    },
    async ({ text }) => {
      const sql = neon(process.env.DATABASE_URL);

      const rows = await sql`
        SELECT
          id,
          text,
          notes,
          results,
          mean,
          created_at,
          updated_at
        FROM gematria_entries
        WHERE LOWER(text) = LOWER(${text})
        ORDER BY updated_at DESC
        LIMIT 100
      `;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                text,
                count: rows.length,
                entries: rows
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  // -----------------------------------
  // TOOL 6: DATABASE OVERVIEW
  // -----------------------------------

  server.registerTool(
    "gematria_database_overview",
    {
      title: "Gematria Database Overview",
      description:
        "Returns a read-only overview of the Gematria database, including counts and available cipher names.",
      inputSchema: {}
    },
    async () => {
      const sql = neon(process.env.DATABASE_URL);

      const entryCount = await sql`
        SELECT COUNT(*)::int AS count
        FROM gematria_entries
      `;

      const cipherRows = await sql`
        SELECT name
        FROM gematria_ciphers
        ORDER BY name ASC
      `;

      const numberStats = await sql`
        SELECT
          MIN(mean) AS lowest_mean,
          MAX(mean) AS highest_mean,
          COUNT(DISTINCT mean)::int AS distinct_means
        FROM gematria_entries
        WHERE mean IS NOT NULL
      `;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                savedEntries:
                  entryCount[0]?.count || 0,

                customCiphers:
                  cipherRows.map(row => row.name),

                statistics:
                  numberStats[0] || {}
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  return server;
}

export default async function handler(req, res) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

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


  let user;

try {
  user = await verifyAccessToken(req);
} catch (error) {
  console.error("AUTH ERROR:", error);

  res.setHeader(
    "WWW-Authenticate",
    `Bearer resource_metadata="https://gematria-ai-gray.vercel.app/.well-known/oauth-protected-resource"`
  );

  return res.status(401).json({
    jsonrpc: "2.0",
    error: {
      code: -32001,
      message: "Invalid or expired access token."
    },
    id: null
  });
}

if (!user) {
  res.setHeader(
    "WWW-Authenticate",
    `Bearer resource_metadata="https://gematria-ai-gray.vercel.app/.well-known/oauth-protected-resource"`
  );

  return res.status(401).json({
    jsonrpc: "2.0",
    error: {
      code: -32001,
      message: "Authentication required."
    },
    id: null
  });
}
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "DATABASE_URL is not configured."
      },
      id: null
    });
  }

  const server = createServer();

  const transport =
    new StreamableHTTPServerTransport({
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
