# TokenScope wrappers

Drop-in replacements for `anthropic.messages.create(...)` that mirror every
call into a Supabase `usage_logs` table. The wrappers are **fire-and-forget**:
a logging failure never blocks or throws into the caller.

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

Smoke test:

```bash
ANTHROPIC_API_KEY=sk-ant-... \
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_KEY=eyJ... \
TOKENSCOPE_USER_ID=00000000-0000-0000-0000-000000000000 \
npm run smoke
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

| Var | Where | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | server only | Standard Anthropic auth — picked up automatically by the SDK. |
| `SUPABASE_URL` | server only | Your Supabase project URL. |
| `SUPABASE_SERVICE_KEY` | **server only — never browser** | Service-role key. Bypasses RLS so the wrapper can insert with an explicit `user_id`. |
| `TOKENSCOPE_USER_ID` | server only | UUID of the Supabase auth user the logs should belong to. Get this from `auth.users` after creating your account. |

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
`tokenscope.py`. When Anthropic changes prices, update both copies. Existing
`usage_logs` rows are not retroactively re-priced — `cost_usd` is a snapshot
of the price in effect when the call was made.
