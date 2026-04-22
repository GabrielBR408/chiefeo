// ChiefEO Intake API — Vercel Serverless Function
// POST /api/intake — accepts tasks array, inserts into Supabase
//
// Multi-user via key→UUID mapping (Option B):
//   CHIEFEO_API_KEY_PERSONAL  → CHIEFEO_USER_ID_PERSONAL
//   CHIEFEO_API_KEY_LPC       → CHIEFEO_USER_ID_LPC
//   (add more pairs with the same CHIEFEO_API_KEY_<LABEL> / CHIEFEO_USER_ID_<LABEL> convention)
//
// Environment variables required:
//   SUPABASE_URL         — Supabase project URL
//   SUPABASE_SERVICE_KEY — Supabase SERVICE ROLE key (bypasses RLS)
//   CHIEFEO_API_KEY_<LABEL> — shared secret per user
//   CHIEFEO_USER_ID_<LABEL> — target Supabase auth UUID for that key
//
// Legacy single-user vars (CHIEFEO_API_KEY, CHIEFEO_USER_ID) still supported as a fallback.

function resolveUserFromApiKey(apiKey) {
  if (!apiKey) return null;

  // Scan env for CHIEFEO_API_KEY_<LABEL> matches
  for (const envName of Object.keys(process.env)) {
    if (!envName.startsWith('CHIEFEO_API_KEY_')) continue;
    if (process.env[envName] !== apiKey) continue;
    const label = envName.slice('CHIEFEO_API_KEY_'.length);
    const userId = process.env[`CHIEFEO_USER_ID_${label}`];
    if (userId) return { label, userId };
  }

  // Legacy single-user fallback
  if (process.env.CHIEFEO_API_KEY && apiKey === process.env.CHIEFEO_API_KEY) {
    const userId = process.env.CHIEFEO_USER_ID;
    if (userId) return { label: 'LEGACY', userId };
  }

  return null;
}

export default async function handler(req, res) {
  // ── CORS ────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth → resolve user ─────────────────────────
  const apiKey = req.headers['x-api-key'];
  const resolved = resolveUserFromApiKey(apiKey);
  if (!resolved) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  const USER_ID = resolved.userId;
  const USER_LABEL = resolved.label;

  // ── Parse body ──────────────────────────────────
  const { tasks, processedThreadIds, seedConfig } = req.body || {};

  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return res.status(400).json({ error: 'Request must include a non-empty "tasks" array' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY || !USER_ID) {
    return res.status(500).json({ error: 'Server misconfigured — missing environment variables' });
  }

  const inserted = [];
  const errors = [];

  // ── Insert tasks one by one ─────────────────────
  // (one-by-one so partial failures don't block the rest)
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];

    // Validate required fields
    if (!t.name || !t.start_date || !t.due_date) {
      errors.push({ index: i, name: t.name || '(unnamed)', error: 'Missing required fields: name, start_date, due_date' });
      continue;
    }

    const row = {
      user_id: USER_ID,
      name: t.name,
      start_date: t.start_date,
      due_date: t.due_date,
      start_priority: t.start_priority ?? 3.0,
      peak_priority: t.peak_priority ?? 5.5,
      postpone_until: t.postpone_until || null,
      complete: false,
      trashed: false,
    };

    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(row),
      });

      if (!resp.ok) {
        const errBody = await resp.text();
        errors.push({ index: i, name: t.name, error: `Supabase ${resp.status}: ${errBody}` });
      } else {
        const [insertedRow] = await resp.json();
        inserted.push({ id: insertedRow.id, name: insertedRow.name });
      }
    } catch (err) {
      errors.push({ index: i, name: t.name, error: err.message });
    }
  }

  // ── Update processedGmailThreadIds + first-run seeding ──
  // Runs when either processedThreadIds is provided OR seedConfig is provided
  // (first-run seed with no thread IDs is still a valid "initialize priorities" call)
  const shouldTouchPriorities =
    (processedThreadIds && Array.isArray(processedThreadIds) && processedThreadIds.length > 0) ||
    (seedConfig && typeof seedConfig === 'object');

  if (shouldTouchPriorities) {
    try {
      // Fetch current priorities config
      const getResp = await fetch(
        `${SUPABASE_URL}/rest/v1/priorities?user_id=eq.${USER_ID}&select=config`,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
          },
        }
      );

      let currentConfig = null;
      let rowExists = false;
      if (getResp.ok) {
        const rows = await getResp.json();
        if (rows.length > 0) {
          currentConfig = rows[0].config || {};
          rowExists = true;
        }
      }

      // First-run: seed from provided seedConfig (usually from handoff priorities.json)
      if (!rowExists) {
        currentConfig = seedConfig && typeof seedConfig === 'object' ? { ...seedConfig } : {};
      }

      // Merge new thread IDs (deduplicated, cap at 500 — keep most recent)
      if (processedThreadIds && Array.isArray(processedThreadIds) && processedThreadIds.length > 0) {
        const existing = currentConfig.processedGmailThreadIds || [];
        const merged = [...new Set([...existing, ...processedThreadIds])];
        const capped = merged.length > 500 ? merged.slice(merged.length - 500) : merged;
        currentConfig.processedGmailThreadIds = capped;
      } else if (!currentConfig.processedGmailThreadIds) {
        currentConfig.processedGmailThreadIds = [];
      }

      // Upsert priorities row
      const upsertResp = await fetch(`${SUPABASE_URL}/rest/v1/priorities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify({
          user_id: USER_ID,
          config: currentConfig,
        }),
      });

      if (!upsertResp.ok) {
        const errBody = await upsertResp.text();
        errors.push({ threadIds: true, error: `Failed to update priorities: ${errBody}` });
      }
    } catch (err) {
      errors.push({ threadIds: true, error: `Failed to update priorities: ${err.message}` });
    }
  }

  // ── Response ────────────────────────────────────
  return res.status(errors.length > 0 && inserted.length === 0 ? 207 : 200).json({
    success: inserted.length > 0,
    user: USER_LABEL,
    inserted,
    errors,
  });
}
