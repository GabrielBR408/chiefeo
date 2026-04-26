// Smoke test: makes a single tiny Claude call through the wrapper.
//
// Run with: node smoke.js
//
// File mode (recommended for the HTML dashboard):
//   ANTHROPIC_API_KEY=sk-ant-... \
//   TOKENSCOPE_LOG_FILE=~/Dropbox/tokenscope/usage.jsonl \
//   node smoke.js
//
// Supabase mode:
//   ANTHROPIC_API_KEY=sk-ant-... \
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_KEY=eyJ... \
//   TOKENSCOPE_USER_ID=00000000-0000-0000-0000-000000000000 \
//   node smoke.js
//
// On success: a row appears in your log file (file mode) and/or
// usage_logs table (supabase mode).

import { claudeCall } from "./tokenscope.js";

const r = await claudeCall({
  tag: "smoke-test",
  model: "claude-haiku-4-5-20251001",
  max_tokens: 32,
  messages: [{ role: "user", content: "Say 'ok'." }],
  metadata: { from: "tokenscope/wrappers/smoke.js" },
});

console.log("response:", r.content?.[0]?.text);
console.log("usage:   ", r.usage);
// Give the fire-and-forget log a moment to flush before the process exits.
await new Promise((res) => setTimeout(res, 1500));
