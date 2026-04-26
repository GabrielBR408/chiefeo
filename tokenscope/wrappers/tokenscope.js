// tokenscope.js — Node logging wrapper for the Anthropic SDK.
//
// Drop-in replacement for `anthropic.messages.create(...)`. Every call is
// mirrored into a log destination so the TokenScope dashboard can read it.
//
// Two log destinations, configured by env vars (use either, or both):
//
//   FILE MODE (recommended for the single-file HTML dashboard on Dropbox):
//     TOKENSCOPE_LOG_FILE   path to a .jsonl file the wrapper appends to.
//                           e.g. ~/Dropbox/tokenscope/usage.jsonl
//                           Parent directory is created if missing.
//
//   SUPABASE MODE (for the future hosted React dashboard):
//     SUPABASE_URL          https://xxxx.supabase.co
//     SUPABASE_SERVICE_KEY  service-role key (server-side only)
//     TOKENSCOPE_USER_ID    UUID of the Supabase auth user owning the logs
//
// If neither destination is configured, the wrapper logs a one-time warning
// and returns the API response normally — your code keeps working.
//
// Logging is fire-and-forget: a destination failure never blocks or throws
// into the caller. Errors print to stderr with a [TokenScope] prefix.

import Anthropic from "@anthropic-ai/sdk";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

// ─── Pricing (USD per 1M tokens) ─────────────────────────────────────────────
// Verify at https://docs.anthropic.com/en/docs/about-claude/pricing before
// shipping — these change. Unknown models fall back to Sonnet pricing so
// cost is never silently zero.
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

// ─── Destination wiring ──────────────────────────────────────────────────────

function expandHome(p) {
  if (!p) return p;
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  return resolve(p);
}

function fileTarget() {
  const raw = process.env.TOKENSCOPE_LOG_FILE;
  return raw ? expandHome(raw) : null;
}

function supabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const uid = process.env.TOKENSCOPE_USER_ID;
  return url && key && uid ? { url, key, uid } : null;
}

let _anthropic;
function anthropic() {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

// Supabase client is loaded lazily and only if needed, so users on the
// file-only path don't pay for the @supabase/supabase-js dep being resolved.
let _supabase;
async function supabase(env) {
  if (!_supabase) {
    const { createClient } = await import("@supabase/supabase-js");
    _supabase = createClient(env.url, env.key, { auth: { persistSession: false } });
  }
  return _supabase;
}

let _warned = false;
function warnNoSink() {
  if (_warned) return;
  _warned = true;
  console.warn(
    "[TokenScope] No log destination configured. Set TOKENSCOPE_LOG_FILE " +
    "(file mode) or SUPABASE_URL + SUPABASE_SERVICE_KEY + TOKENSCOPE_USER_ID " +
    "(Supabase mode). API calls still work, but nothing is being recorded."
  );
}

async function appendJsonl(file, row) {
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(row) + "\n", "utf8");
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

  // Row shape is identical for both destinations — Supabase fills `id` and
  // `created_at` on its side; the file-mode dashboard relies on the wrapper
  // populating them. We populate both unconditionally, and Supabase happily
  // accepts/ignores the explicit values when they're provided.
  const row = {
    id:                  randomUUID(),
    created_at:          new Date().toISOString(),
    tag,
    model,
    stop_reason:         response.stop_reason ?? null,
    ...tokens,
    cost_usd,
    duration_ms,
    metadata,
  };

  const file = fileTarget();
  const sb   = supabaseEnv();

  if (!file && !sb) {
    warnNoSink();
    return response;
  }

  if (file) {
    appendJsonl(file, row).catch((e) =>
      console.error("[TokenScope] file log failed:", e?.message || e)
    );
  }

  if (sb) {
    // Supabase row needs the user_id; the file row doesn't (single-user file).
    const sbRow = { ...row, user_id: sb.uid };
    Promise.resolve()
      .then(() => supabase(sb))
      .then((client) => client.from("usage_logs").insert(sbRow))
      .then(({ error } = {}) => {
        if (error) console.error("[TokenScope] supabase log failed:", error.message);
      })
      .catch((e) =>
        console.error("[TokenScope] supabase log failed:", e?.message || e)
      );
  }

  return response;
}
