// ChiefEO Score Task API — Vercel Serverless Function
// POST /api/score-task — auto-tiers and dates a single task name + sender.
//
// This file holds the proprietary scoring logic that was previously bundled
// into index.html. Keeping it server-side prevents a casual view-source from
// harvesting the keyword library or the tier-to-priority bands.
//
// Request body:
//   {
//     name:             string  (the task title / email subject)
//     senderEmail?:     string  (the sender's address; null/undefined for manual Quick Add)
//     receivedDateISO?: string  ("YYYY-MM-DD" — the email's received date; falls back to todayISO)
//     explicitDueDate?: string  ("YYYY-MM-DD" — short-circuits the dueDate calculation)
//     todayISO:         string  ("YYYY-MM-DD" — the client's notion of "today")
//     tierOverride?:    string  ("High"|"Medium"|"Low"|"Suppress" — bypass keyword matching)
//   }
//
// Response:
//   { tier, startPriority, peakPriority, dueDate, matchedKeywords }
//
// The keyword library and the tier→priority bands are NEVER returned — only the
// derived score for this single task. matchedKeywords is the small subset of
// the user's actual task name (it's already in their possession), not the
// library at large.
//
// Authentication (either path works):
//   1. Authorization: Bearer <supabase_access_token>  — the browser flow.
//      Token is verified against ${SUPABASE_URL}/auth/v1/user and the
//      resolved user id is used to fetch their priorities config.
//   2. x-api-key: <CHIEFEO_API_KEY_LABEL>             — the Claude skill / intake flow.
//      Same key→userId mapping convention as api/intake.js.
//
// Environment variables required:
//   SUPABASE_URL         — Supabase project URL
//   SUPABASE_SERVICE_KEY — Supabase SERVICE ROLE key (bypasses RLS, validates JWTs)
//   CHIEFEO_API_KEY_<LABEL> / CHIEFEO_USER_ID_<LABEL> — optional, only for the x-api-key path

// ── Default keyword library ────────────────────────────────────────
// Tier values: High = strongly elevate, Medium = neutral nudge,
// Low = de-emphasize, Suppress = bury. Keys with `default: true` are
// the seeded library; user-added keywords pass through with default: false.
const DEFAULT_KEYWORDS = [
  { id: "k1",  word: "urgent",                    tier: "High",     default: true, enabled: true },
  { id: "k2",  word: "ASAP",                      tier: "High",     default: true, enabled: true },
  { id: "k3",  word: "immediately",               tier: "High",     default: true, enabled: true },
  { id: "k4",  word: "emergency",                 tier: "High",     default: true, enabled: true },
  { id: "k5",  word: "critical",                  tier: "High",     default: true, enabled: true },
  { id: "k6",  word: "time-sensitive",            tier: "High",     default: true, enabled: true },
  { id: "k10", word: "deadline",                  tier: "Medium",   default: true, enabled: true },
  { id: "k11", word: "EOD",                       tier: "Medium",   default: true, enabled: true },
  { id: "k12", word: "end of day",                tier: "Medium",   default: true, enabled: true },
  { id: "k13", word: "end of week",               tier: "Medium",   default: true, enabled: true },
  { id: "k14", word: "COB",                       tier: "Medium",   default: true, enabled: true },
  { id: "k15", word: "action required",           tier: "Medium",   default: true, enabled: true },
  { id: "k16", word: "action needed",             tier: "Medium",   default: true, enabled: true },
  { id: "k19", word: "high priority",             tier: "Medium",   default: true, enabled: true },
  { id: "k30", word: "FYI",                       tier: "Suppress", default: true, enabled: true },
  { id: "k31", word: "no rush",                   tier: "Suppress", default: true, enabled: true },
  { id: "k32", word: "whenever you get a chance", tier: "Suppress", default: true, enabled: true },
  { id: "k34", word: "unsubscribe",               tier: "Suppress", default: true, enabled: true },
  { id: "k35", word: "newsletter",                tier: "Suppress", default: true, enabled: true },
];

// ── Default tier→priority bands ────────────────────────────────────
// Score thresholds match bandFromScore() on the client (>=5.5 High,
// >=3.0 Medium, >=1.0 Low, else Suppress).
const DEFAULT_TIER_MAPPINGS = {
  High:     { start: 5.5, peak: 8.5 },
  Medium:   { start: 3.0, peak: 5.5 },
  Low:      { start: 1.0, peak: 3.0 },
  Suppress: { start: 0.0, peak: 1.0 },
};

const DEFAULT_DUE_DATE_DAYS = { High: 1, Medium: 3, Low: 7, Suppress: 14 };

const TIER_VALUE = { High: 3, Medium: 2, Low: 1, Suppress: 0 };

function valueToTier(v) {
  if (v < 0.5) return "Suppress";
  if (v < 1.5) return "Low";
  if (v < 2.5) return "Medium";
  return "High";
}

function combineTiers(senderTier, keywordTiers) {
  const senderVal = senderTier != null ? TIER_VALUE[senderTier] : TIER_VALUE.Medium;
  if (!keywordTiers || keywordTiers.length === 0) return senderTier || "Medium";
  let strongest = keywordTiers[0];
  let maxDev = Math.abs(TIER_VALUE[strongest] - senderVal);
  for (const kt of keywordTiers) {
    const dev = Math.abs(TIER_VALUE[kt] - senderVal);
    if (dev > maxDev) { strongest = kt; maxDev = dev; }
  }
  const kwVal = TIER_VALUE[strongest];
  const final = senderVal + (kwVal - senderVal) * 0.5;
  return valueToTier(final);
}

function extractKeywords(text, keywordList) {
  const lower = String(text || "").toLowerCase();
  const hits = []; const words = [];
  for (const kw of keywordList) {
    if (!kw.enabled) continue;
    if (lower.includes(String(kw.word || "").toLowerCase())) {
      hits.push(kw.tier);
      words.push(kw.word);
    }
  }
  return { tiers: hits, words };
}

function lookupSenderTier(email, peopleList) {
  if (!email) return null;
  const lower = String(email).toLowerCase();
  for (const p of peopleList || []) {
    const pEmail = String(p.email || "").toLowerCase();
    if (!pEmail) continue;
    if (pEmail.startsWith("*@")) {
      const domain = pEmail.substring(2);
      if (lower.endsWith("@" + domain)) return p.tier;
    } else if (pEmail === lower) {
      return p.tier;
    }
  }
  return null;
}

// ── Date helpers (local-date arithmetic, no UTC drift) ─────────────
function parseLocalDate(s) {
  if (!s) return null;
  const parts = String(s).split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return new Date(s);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function toISO(d) {
  if (!(d instanceof Date)) return "";
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

// ── Auth: resolve user from Bearer token OR x-api-key ──────────────
function resolveUserFromApiKey(apiKey) {
  if (!apiKey) return null;
  for (const envName of Object.keys(process.env)) {
    if (!envName.startsWith("CHIEFEO_API_KEY_")) continue;
    if (process.env[envName] !== apiKey) continue;
    const label = envName.slice("CHIEFEO_API_KEY_".length);
    const userId = process.env[`CHIEFEO_USER_ID_${label}`];
    if (userId) return { label, userId };
  }
  if (process.env.CHIEFEO_API_KEY && apiKey === process.env.CHIEFEO_API_KEY) {
    const userId = process.env.CHIEFEO_USER_ID;
    if (userId) return { label: "LEGACY", userId };
  }
  return null;
}

async function resolveUserFromBearer(token, supabaseUrl, serviceKey) {
  if (!token) return null;
  try {
    const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!resp.ok) return null;
    const u = await resp.json();
    if (!u || !u.id) return null;
    return { label: "BEARER", userId: u.id };
  } catch {
    return null;
  }
}

// ── Fetch the user's priorities config (people, custom keywords, tier mappings) ──
async function loadPriorities(userId, supabaseUrl, serviceKey) {
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/priorities?user_id=eq.${userId}&select=config`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    );
    if (!resp.ok) return null;
    const rows = await resp.json();
    if (rows.length === 0) return null;
    return rows[0].config || {};
  } catch {
    return null;
  }
}

// ── Main scoring entry point ───────────────────────────────────────
function scoreTask({ name, senderEmail, receivedDateISO, explicitDueDate, todayISO, tierOverride }, config) {
  const userKeywords     = (config && Array.isArray(config.keywords) && config.keywords.length > 0) ? config.keywords     : DEFAULT_KEYWORDS;
  const userPeople       = (config && Array.isArray(config.people))                                 ? config.people       : [];
  const userTierMappings = (config && config.tierMappings && typeof config.tierMappings === "object") ? config.tierMappings : DEFAULT_TIER_MAPPINGS;
  const userDueDays      = (config && config.dueDateDefaults && typeof config.dueDateDefaults === "object") ? config.dueDateDefaults : DEFAULT_DUE_DATE_DAYS;

  let tier;
  let matchedWords = [];

  if (tierOverride && (tierOverride === "High" || tierOverride === "Medium" || tierOverride === "Low" || tierOverride === "Suppress")) {
    tier = tierOverride;
  } else {
    const senderTier = lookupSenderTier(senderEmail, userPeople);
    const kw = extractKeywords(name, userKeywords);
    matchedWords = kw.words;
    tier = combineTiers(senderTier, kw.tiers);
  }

  const band = userTierMappings[tier] || DEFAULT_TIER_MAPPINGS[tier] || DEFAULT_TIER_MAPPINGS.Medium;

  let dueDate = explicitDueDate || null;
  if (!dueDate) {
    const daysOut = userDueDays[tier] ?? 7;
    const base = parseLocalDate(receivedDateISO || todayISO);
    if (base) {
      base.setDate(base.getDate() + daysOut);
      dueDate = toISO(base);
    } else {
      dueDate = todayISO || "";
    }
  }

  return {
    tier,
    startPriority: band.start,
    peakPriority:  band.peak,
    dueDate,
    matchedKeywords: matchedWords,
  };
}

// ── HTTP handler ───────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Server misconfigured — missing environment variables" });
  }

  // Auth: Bearer (browser) takes precedence over x-api-key (skill).
  let resolved = null;
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    resolved = await resolveUserFromBearer(token, SUPABASE_URL, SUPABASE_KEY);
  }
  if (!resolved) {
    const apiKey = req.headers["x-api-key"];
    resolved = resolveUserFromApiKey(apiKey);
  }
  if (!resolved) {
    return res.status(401).json({ error: "Invalid or missing credentials" });
  }

  const body = req.body || {};
  const { name, senderEmail, receivedDateISO, explicitDueDate, todayISO, tierOverride } = body;

  if (typeof name !== "string") {
    return res.status(400).json({ error: "Request must include a string 'name'" });
  }
  if (!todayISO || typeof todayISO !== "string") {
    return res.status(400).json({ error: "Request must include 'todayISO' (YYYY-MM-DD)" });
  }

  const config = await loadPriorities(resolved.userId, SUPABASE_URL, SUPABASE_KEY);
  const result = scoreTask({ name, senderEmail, receivedDateISO, explicitDueDate, todayISO, tierOverride }, config);

  return res.status(200).json(result);
}
