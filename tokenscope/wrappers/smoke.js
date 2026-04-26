// Smoke test: makes a single tiny Claude call through the wrapper.
// Run with: node smoke.js
//
// On success: a row appears in the `usage_logs` table for your TOKENSCOPE_USER_ID.

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
// Give the fire-and-forget insert a moment to land before the process exits.
await new Promise((res) => setTimeout(res, 1500));
