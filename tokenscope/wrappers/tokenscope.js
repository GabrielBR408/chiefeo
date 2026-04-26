// tokenscope.js — Node logging wrapper for the Anthropic SDK.
//
// Drop into any Node project, set the env vars below, and replace your
// `anthropic.messages.create(...)` calls with `claudeCall({ tag, ... })`.
//
// Required env:
//   ANTHROPIC_API_KEY        sk-ant-…
//   SUPABASE_URL             https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY     service-role key (server-side only — never ship to browser)
//   TOKENSCOPE_USER_ID       UUID of the Supabase auth user that should own these logs
//
// The Supabase insert is fire-and-forget: a logging failure never blocks or
// throws into the caller. Errors print to stderr with a [TokenScope] prefix.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

// ─── Pricing (USD per 1M tokens) ─────────────────────────────────────────────
// Verify at https://docs.anthropic.com/en/docs/about-claude/pricing before
// shipping — these change. Unknown models fall back to Sonnet pricing so cost
// is never silently zero.
export const PRICING = {
  "claude-opus-4-7":            { input: 15.00, output: 75.00, cache_read: 1.50,  cache_write: 18.75 },
  "claude-opus-4-6":            { input: 15.00, output: 75.00, cache_read: 1.50,  cache_write: 18.75 },
  "claude-sonnet-4-6":          { input:  3.00, output: 15.00, cache_read: 0.30,  cache_write:  3.75 },
  "claude-haiku-4-5-20251001":  { input:  0.80, output:  4.00, cache_read: 0.08,  cache_write:  1.00 },
};

const FALLBACK_MODEL = "claude-sonnet-4-6";

export function calculateCost(model, usage) {
  const p = PRICING[model] || PRICING[FALLBACK_MODEL];
  return (
    (usage.input_tokens        / 1_000_000) * p.input +
    (usage.output_tokens       / 1_000_000) * p.output +
    (usage.cache_read_tokens   / 1_000_000) * p.cache_read +
    (usage.cache_write_tokens  / 1_000_000) * p.cache_write
  );
}

// ─── Lazy singletons ─────────────────────────────────────────────────────────
// Built lazily so importing this module doesn't crash a process whose env
// isn't fully populated yet (e.g. during tests).

let _anthropic;
function anthropic() {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

let _supabase;
function supabase() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      throw new Error("[TokenScope] SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
    }
    _supabase = createClient(url, key, { auth: { persistSession: false } });
  }
  return _supabase;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function claudeCall({
  tag,
  messages,
  model = FALLBACK_MODEL,
  system,
  max_tokens = 1024,
  metadata = {},
  ...rest
} = {}) {
  if (!tag) throw new Error("[TokenScope] claudeCall requires a `tag`");
  if (!messages) throw new Error("[TokenScope] claudeCall requires `messages`");

  const start = Date.now();
  const response = await anthropic().messages.create({
    model, max_tokens, system, messages, ...rest,
  });
  const duration_ms = Date.now() - start;

  const usage = response.usage || {};
  const tokens = {
    input_tokens:        usage.input_tokens                ?? 0,
    output_tokens:       usage.output_tokens               ?? 0,
    cache_read_tokens:   usage.cache_read_input_tokens     ?? 0,
    cache_write_tokens:  usage.cache_creation_input_tokens ?? 0,
  };
  const cost_usd = calculateCost(model, tokens);

  const row = {
    user_id:     process.env.TOKENSCOPE_USER_ID,
    tag,
    model,
    stop_reason: response.stop_reason ?? null,
    ...tokens,
    cost_usd,
    duration_ms,
    metadata,
  };

  // Fire-and-forget. Never throw out of here.
  Promise.resolve()
    .then(() => supabase().from("usage_logs").insert(row))
    .then(({ error } = {}) => {
      if (error) console.error("[TokenScope] log failed:", error.message);
    })
    .catch((e) => console.error("[TokenScope] log failed:", e?.message || e));

  return response;
}
