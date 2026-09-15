import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  // Only allow GET for our initial setup.
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({
        error: "DATABASE_URL is not configured."
      });
    }

    const sql = neon(process.env.DATABASE_URL);

    // Main table containing the terminology/calculations
    // synchronized from the Gematria website.
    await sql`
      CREATE TABLE IF NOT EXISTS gematria_entries (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        notes TEXT DEFAULT '',
        results JSONB NOT NULL DEFAULT '[]'::jsonb,
        mean NUMERIC,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Store the custom cipher definitions as well.
    await sql`
      CREATE TABLE IF NOT EXISTS gematria_ciphers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        values JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Helpful indexes for searching terminology and means.
    await sql`
      CREATE INDEX IF NOT EXISTS idx_gematria_entries_text
      ON gematria_entries (LOWER(text))
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_gematria_entries_mean
      ON gematria_entries (mean)
    `;

    return res.status(200).json({
      success: true,
      message: "Gematria database is ready.",
      tables: [
        "gematria_entries",
        "gematria_ciphers"
      ]
    });
  } catch (error) {
    console.error("Database setup error:", error);

    return res.status(500).json({
      success: false,
      error: "Database setup failed.",
      message:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
}
