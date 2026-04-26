# TokenScope wrappers

Drop-in replacements for `anthropic.messages.create(...)` that mirror every
call into a log destination. The wrappers are **fire-and-forget**: a logging
failure never blocks or throws into the caller.

Two destinations are supported. Pick whichever matches your dashboard:

| Destination | Configure with | Use with |
|---|---|---|
| **Local JSONL file** | `TOKENSCOPE_LOG_FILE` | The single-file [`tokenscope.html`](../tokenscope.html) dashboard |
| **Supabase table** | `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` + `TOKENSCOPE_USER_ID` | The hosted React dashboard under [`src/`](../src/) |

Set both if you want both. Set neither and the wrapper logs a one-time
warning — your API calls still work, nothing gets recorded.

## File mode + Dropbox (the simple path)

This is what we recommend day-1.

1. Create a folder inside your Dropbox: `~/Dropbox/tokenscope/`.
2. Set the env var wherever you call Claude:

   ```bash
   export TOKENSCOPE_LOG_FILE=~/Dropbox/tokenscope/usage.jsonl
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

   The wrapper creates the file (and parent dirs) on first write.

3. Smoke test:

   ```bash
   cd tokenscope/wrappers
   npm install
   npm run smoke
   ```

   Confirm `~/Dropbox/tokenscope/usage.jsonl` now exists and contains one
   line of JSON.

4. **Right-click that file in Dropbox → Share → Create link → Copy link.**
   Open `tokenscope.html` in your browser, click the gear icon, paste the
   link. Done — your dashboard auto-fetches that file every 30 seconds.

## JavaScript / Node

```bash
cd tokenscope/wrappers
npm install
```

```javascript
import { claudeCall } from "./tokenscope.js";

const response = await claudeCall({
  tag: "cam-rec",
  model: "claude-sonnet-4-6",
  messages: [{ role: "user", content: prompt }],
  system: systemPrompt,
  metadata: { property: "1045-sansome", step: "variance-commentary" }
});

console.log(response.content[0].text);
```

## Python

```bash
cd tokenscope/wrappers
pip install -r requirements.txt
```

```python
from tokenscope import claude_call

response = claude_call(
    tag="cam-rec",
    model="claude-sonnet-4-6",
    messages=[{"role": "user", "content": prompt}],
    system=system_prompt,
    metadata={"property": "1045-sansome", "step": "variance-commentary"},
)

print(response.content[0].text)
```

## Environment variables

| Var | Required for | Where it goes |
|---|---|---|
| `ANTHROPIC_API_KEY` | always | Standard Anthropic auth — picked up automatically by the SDK. |
| `TOKENSCOPE_LOG_FILE` | file mode | Path to a JSONL file the wrapper appends to. `~` is expanded. |
| `SUPABASE_URL` | Supabase mode | Your Supabase project URL. |
| `SUPABASE_SERVICE_KEY` | Supabase mode | Service-role key — **server only, never browser**. |
| `TOKENSCOPE_USER_ID` | Supabase mode | UUID of the Supabase auth user the logs should belong to. |

## Tag conventions

Tags are free-form strings — the dashboard groups by whatever you pass.
Convention is **lowercase-hyphenated**, no enforcement.

Common tags from the reference workflow:

| Tag | Workflow |
| --- | --- |
| `cam-rec` | CAM/TAX reconciliation |
| `code-projects` | App and tool development |
| `gl-variance` | GL variance commentary |
| `owner-report` | Monthly owner report generation |
| `cheat-sheet` | Cheat sheet / snapshot updates |
| `expense-report` | Expense report processing |
| `chat` | General / ad hoc queries |

## Updating prices

Pricing lives in `PRICING` at the top of both `tokenscope.js` and
`tokenscope.py`. When Anthropic changes prices, update both copies.
Existing rows in your log file or Supabase table are not retroactively
re-priced — `cost_usd` is a snapshot of the price in effect when the call
was made.

## Log file format

One JSON object per line (JSONL). Each row:

```jsonc
{
  "id":                  "uuid-v4",
  "created_at":          "2026-04-26T19:42:31.123Z",
  "tag":                 "cam-rec",
  "model":               "claude-sonnet-4-6",
  "stop_reason":         "end_turn",
  "input_tokens":        14200,
  "output_tokens":       3100,
  "cache_read_tokens":   0,
  "cache_write_tokens":  0,
  "cost_usd":            0.0892,
  "duration_ms":         4200,
  "metadata":            { "property": "1045-sansome" }
}
```

Safe to `cat`, `grep`, `jq`, etc. Safe to copy or back up. The dashboard
re-aggregates from these rows every fetch — no derived state lives anywhere
else.
