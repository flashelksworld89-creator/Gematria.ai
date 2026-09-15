import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }
const syncSecret = req.headers["x-gematria-sync-secret"];

if (
  !process.env.GEMATRIA_SYNC_SECRET ||
  syncSecret !== process.env.GEMATRIA_SYNC_SECRET
) {
  return res.status(401).json({
    success: false,
    error: "Unauthorized"
  });
}
  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({
        success: false,
        error: "DATABASE_URL is not configured."
      });
    }

    const sql = neon(process.env.DATABASE_URL);

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const entries = Array.isArray(body.entries)
      ? body.entries
      : [];

    const ciphers = Array.isArray(body.ciphers)
      ? body.ciphers
      : [];

    let entriesSynced = 0;
    let ciphersSynced = 0;

    // ----------------------------
    // SYNC CUSTOM CIPHERS
    // ----------------------------

    for (const cipher of ciphers) {
      if (!cipher || !cipher.id || !cipher.name) {
        continue;
      }

      const values =
        cipher.values && typeof cipher.values === "object"
          ? cipher.values
          : {};

      await sql`
        INSERT INTO gematria_ciphers (
          id,
          name,
          values,
          updated_at
        )
        VALUES (
          ${String(cipher.id)},
          ${String(cipher.name)},
          ${JSON.stringify(values)}::jsonb,
          NOW()
        )

        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          values = EXCLUDED.values,
          updated_at = NOW()
      `;

      ciphersSynced++;
    }

    // ----------------------------
    // SYNC SAVED CALCULATIONS
    // ----------------------------

    for (const entry of entries) {
      if (!entry || !entry.id || !entry.text) {
        continue;
      }

      const notes =
        typeof entry.notes === "string"
          ? entry.notes
          : "";

      const results =
        Array.isArray(entry.results)
          ? entry.results
          : [];

      const mean =
        entry.mean === null ||
        entry.mean === undefined ||
        entry.mean === ""
          ? null
          : Number(entry.mean);

      let createdAt = new Date();

      if (entry.created) {
        const parsedDate = new Date(entry.created);

        if (!Number.isNaN(parsedDate.getTime())) {
          createdAt = parsedDate;
        }
      }

      await sql`
        INSERT INTO gematria_entries (
          id,
          text,
          notes,
          results,
          mean,
          created_at,
          updated_at
        )
        VALUES (
          ${String(entry.id)},
          ${String(entry.text)},
          ${notes},
          ${JSON.stringify(results)}::jsonb,
          ${
            Number.isFinite(mean)
              ? mean
              : null
          },
          ${createdAt.toISOString()},
          NOW()
        )

        ON CONFLICT (id)
        DO UPDATE SET
          text = EXCLUDED.text,
          notes = EXCLUDED.notes,
          results = EXCLUDED.results,
          mean = EXCLUDED.mean,
          updated_at = NOW()
      `;

      entriesSynced++;
    }

    return res.status(200).json({
      success: true,
      message: "Gematria data synchronized successfully.",
      entriesSynced,
      ciphersSynced
    });

  } catch (error) {
    console.error("Gematria sync error:", error);

    return res.status(500).json({
      success: false,
      error: "Synchronization failed.",
      message:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
}
