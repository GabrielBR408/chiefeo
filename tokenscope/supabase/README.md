# TokenScope — Supabase setup

## One-time setup

1. Create a new project at https://supabase.com (free tier is fine).
2. In the SQL editor, paste and run [`001_init.sql`](./001_init.sql).
3. Authentication → Providers → enable **Email** (disable public signup if you want a single-user install).
4. Authentication → Users → "Add user" → create your account. Copy the user's UUID — that's your `TOKENSCOPE_USER_ID`.
5. Project Settings → API:
   - `Project URL` → `SUPABASE_URL` and `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY` (browser-safe)
   - `service_role` key → `SUPABASE_SERVICE_KEY` (server-side only — never ship this to a browser)

## Smoke test

After installing the wrapper:

```bash
cd tokenscope/wrappers
node smoke.js   # see wrappers/README.md
```

Then in the Supabase Table editor, open `usage_logs` — you should see a single row.

## Schema notes

- `cost_usd` is calculated by the wrapper at write time using the price table baked into the wrapper. If Anthropic changes prices, update `PRICING` in both `tokenscope.js` and `tokenscope.py`. Historical rows are not retroactively re-priced (cost is a snapshot of what you paid that day).
- Cache token fields default to 0 because not every model/call returns them.
- RLS is enforced — every query must run with an authenticated session, and a session can only see its own rows. The dashboard uses the `anon` key + Supabase Auth session; the wrapper uses the `service_role` key (which bypasses RLS) and writes with an explicit `user_id`.
