// ChiefEO trash auto-expire cron — Vercel Serverless Function
// Scheduled by vercel.json crons → "0 3 * * *" (03:00 UTC daily).
//
// Feature-flagged: only runs when env var AUTO_DELETE_TRASH_ENABLED === "true".
// Until that flag is flipped in Vercel project settings, every invocation is
// a no-op that returns { skipped: true, reason: "feature_flag_off" }. This
// stays off through Phase 6 of the production handoff.
//
// When enabled, deletes every row in `tasks` with trashed=true and
// trashed_at older than 30 days. Uses the Supabase SERVICE ROLE key so the
// query bypasses RLS and operates across all users.
//
// Environment variables required:
//   SUPABASE_URL                 — Supabase project URL
//   SUPABASE_SERVICE_KEY         — Supabase SERVICE ROLE key (bypasses RLS)
//   AUTO_DELETE_TRASH_ENABLED    — must be the literal string "true" to run

const RETENTION_DAYS = 30;

export default async function handler(req, res) {
  if (process.env.AUTO_DELETE_TRASH_ENABLED !== "true") {
    return res.status(200).json({ skipped: true, reason: "feature_flag_off" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Server misconfigured — missing SUPABASE_URL or SUPABASE_SERVICE_KEY" });
  }

  const cutoffISO = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
  const url = `${SUPABASE_URL}/rest/v1/tasks?trashed=eq.true&trashed_at=lt.${encodeURIComponent(cutoffISO)}`;

  try {
    // Prefer count=exact + return=minimal: the body is empty, but the
    // Content-Range response header carries "*/N" with the row count we hit.
    const resp = await fetch(url, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "count=exact,return=minimal",
      },
    });

    if (!resp.ok) {
      const body = await resp.text();
      return res.status(502).json({ error: `Supabase ${resp.status}: ${body}` });
    }

    const range = resp.headers.get("content-range") || "";
    const match = range.match(/\/(\d+)$/);
    const deleted = match ? parseInt(match[1], 10) : null;

    return res.status(200).json({
      skipped: false,
      deleted,
      cutoff: cutoffISO,
      retentionDays: RETENTION_DAYS,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
