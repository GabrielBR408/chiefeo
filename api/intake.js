// ChiefEO Intake API — Vercel Serverless Function
// POST /api/intake — accepts tasks array, inserts into Supabase
// GET  /api/intake — returns dedup data for the caller's user (existingTasks + processedThreadIds)
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

// ── GET handler: returns dedup data for the resolved user ─────────
async function handleGet(req, res, USER_ID, USER_LABEL) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY || !USER_ID) {
    return res.status(500).json({ error: 'Server misconfigured — missing environment variables' });
  }

  try {
    // Fetch all non-trashed tasks (for dedup + xlsx archive)
    const tasksResp = await fetch(
      `${SUPABASE_URL}/rest/v1/tasks?user_id=eq.${USER_ID}&trashed=eq.false&order=id.desc`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    if (!tasksResp.ok) {
      const errBody = await tasksResp.text();
      return res.status(502).json({ error: `Failed to fetch tasks: ${tasksResp.status} ${errBody}` });
    }
    const existingTasks = await tasksResp.json();

    // Fetch priorities config (for processedGmailThreadIds + people list for scoring)
    const prioResp = await fetch(
      `${SUPABASE_URL}/rest/v1/priorities?user_id=eq.${USER_ID}&select=config`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    let config = null;
    let prioritiesRowExists = false;
    if (prioResp.ok) {
      const rows = await prioResp.json();
      if (rows.length > 0) {
        config = rows[0].config || {};
        prioritiesRowExists = true;
      }
    }

    return res.status(200).json({
      user: USER_LABEL,
      existingTasks,
      processedThreadIds: config?.processedGmailThreadIds || [],
      prioritiesRowExists,
      config, // full config so skill can use people list for scoring without a second call
    });
  } catch (err) {
    return res.status(500).json({ error: `Failed to load dedup data: ${err.message}` });
  }
}

// ── POST handler: inserts tasks + upserts priorities ──────────────
async function handlePost(req, res, USER_ID, USER_LABEL) {
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

  // Insert tasks one by one (so partial failures don't block the rest)
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];

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

  // Update processedGmailThreadIds + first-run seeding
  const shouldTouchPriorities =
    (processedThreadIds && Array.isArray(processedThreadIds) && processedThreadIds.length > 0) ||
    (seedConfig && typeof seedConfig === 'object');

  if (shouldTouchPriorities) {
    try {
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

      if (!rowExists) {
        currentConfig = seedConfig && typeof seedConfig === 'object' ? { ...seedConfig } : {};
      }

      if (processedThreadIds && Array.isArray(processedThreadIds) && processedThreadIds.length > 0) {
        const existing = currentConfig.processedGmailThreadIds || [];
        const merged = [...new Set([...existing, ...processedThreadIds])];
        const capped = merged.length > 500 ? merged.slice(merged.length - 500) : merged;
        currentConfig.processedGmailThreadIds = capped;
      } else if (!currentConfig.processedGmailThreadIds) {
        currentConfig.processedGmailThreadIds = [];
      }

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

  return res.status(errors.length > 0 && inserted.length === 0 ? 207 : 200).json({
    success: inserted.length > 0,
    user: USER_LABEL,
    inserted,
    errors,
  });
}

// ── Main handler: CORS + auth + route to GET or POST ──────────────
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth → resolve user
  const apiKey = req.headers['x-api-key'];
  const resolved = resolveUserFromApiKey(apiKey);
  if (!resolved) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, resolved.userId, resolved.label);
  }
  return handlePost(req, res, resolved.userId, resolved.label);
}
