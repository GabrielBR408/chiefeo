// ChiefEO Referral API — Vercel Serverless Function
//
// GET /api/referral                       → the caller's own referral status
//     Auth: Authorization: Bearer <supabase access token>  (browser flow)
//        or x-api-key: <CHIEFEO_API_KEY_LABEL>              (skill / server flow)
//     Returns: { referralCode, referralLink, referralCount, referredBy,
//                freeUntil, unlocked, threshold }
//
// GET /api/referral?validate=CODE         → is this a real, active referral code?
//     No auth required — used by a signup page to check a ?ref= before submit.
//     Returns: { valid: boolean, code: "CODE" }   (never reveals whose code it is)
//
// This endpoint only READS. The referral graph is written exclusively by the
// live database triggers (handle_new_user on signup, handle_referral_verified
// on email confirmation), so there is no write path here to abuse.
//
// Environment variables required:
//   SUPABASE_URL          — Supabase project URL
//   SUPABASE_SERVICE_KEY  — Supabase SERVICE ROLE key (bypasses RLS)
//   CHIEFEO_API_KEY_<LABEL> / CHIEFEO_USER_ID_<LABEL> — optional, x-api-key path
// Optional:
//   REFERRAL_BASE_URL     — base for referral links (default https://chiefeotool.com)

// Mirrors the live DB's referral_reward_threshold() (currently 3). The reward
// itself (free_until, +6 months every Nth referral) is granted by the
// handle_referral_verified() trigger — this endpoint only reports state.
const REFERRAL_THRESHOLD = 3;

// ── Resolve a user from x-api-key (mirrors api/intake.js) ─────────
function resolveUserFromApiKey(apiKey) {
  if (!apiKey) return null;
  for (const envName of Object.keys(process.env)) {
    if (!envName.startsWith('CHIEFEO_API_KEY_')) continue;
    if (process.env[envName] !== apiKey) continue;
    const label = envName.slice('CHIEFEO_API_KEY_'.length);
    const userId = process.env[`CHIEFEO_USER_ID_${label}`];
    if (userId) return { label, userId };
  }
  if (process.env.CHIEFEO_API_KEY && apiKey === process.env.CHIEFEO_API_KEY) {
    const userId = process.env.CHIEFEO_USER_ID;
    if (userId) return { label: 'LEGACY', userId };
  }
  return null;
}

// ── Resolve a user from a Supabase access token (mirrors api/score-task.js) ──
async function resolveUserFromBearer(authHeader, SUPABASE_URL, SUPABASE_KEY) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    const user = await resp.json();
    return user?.id ? { userId: user.id, label: user.email || 'BROWSER' } : null;
  } catch {
    return null;
  }
}

function referralLinkFor(code) {
  const base = (process.env.REFERRAL_BASE_URL || 'https://chiefeotool.com').replace(/\/+$/, '');
  return `${base}/?ref=${encodeURIComponent(code)}`;
}

async function sbGet(SUPABASE_URL, SUPABASE_KEY, path) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Supabase ${resp.status}: ${body}`);
  }
  return resp.json();
}

export default async function handler(req, res) {
  // CORS — the tools live on different origins under chiefeotool.com.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured — missing SUPABASE_URL / SUPABASE_SERVICE_KEY' });
  }

  // ── Public code-validation path ───────────────────────────────
  const validate = req.query?.validate;
  if (validate) {
    const code = String(validate).trim().toUpperCase();
    if (!/^[A-Z0-9]{4,16}$/.test(code)) {
      return res.status(200).json({ valid: false, code });
    }
    try {
      const rows = await sbGet(
        SUPABASE_URL, SUPABASE_KEY,
        `profiles?referral_code=eq.${encodeURIComponent(code)}&deleted_at=is.null&select=user_id`
      );
      return res.status(200).json({ valid: rows.length > 0, code });
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
  }

  // ── Authenticated "my referral status" path ───────────────────
  const resolved =
    (await resolveUserFromBearer(req.headers['authorization'], SUPABASE_URL, SUPABASE_KEY)) ||
    resolveUserFromApiKey(req.headers['x-api-key']);
  if (!resolved) {
    return res.status(401).json({ error: 'Invalid or missing credentials' });
  }

  try {
    const rows = await sbGet(
      SUPABASE_URL, SUPABASE_KEY,
      `profiles?user_id=eq.${resolved.userId}&select=referral_code,referral_count,referred_by,free_until,deleted_at`
    );
    if (rows.length === 0) {
      // Profile row is created by the signup trigger; a missing row means the
      // migration hasn't run for this account yet.
      return res.status(404).json({ error: 'No profile row for this user' });
    }
    const p = rows[0];
    const count = p.referral_count ?? 0;
    // `unlocked` = a free window is currently active (the reward the referral
    // system actually grants). `reachedThreshold` = has hit the count milestone.
    const unlocked = !!p.free_until && new Date(p.free_until).getTime() > Date.now();
    return res.status(200).json({
      referralCode: p.referral_code,
      referralLink: referralLinkFor(p.referral_code),
      referralCount: count,
      referredBy: p.referred_by,
      freeUntil: p.free_until,
      unlocked,
      reachedThreshold: count >= REFERRAL_THRESHOLD,
      threshold: REFERRAL_THRESHOLD,
    });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
