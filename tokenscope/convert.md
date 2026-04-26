# Conversion path: Dropbox → Supabase + Vercel

This file documents exactly what changes when you outgrow the single-file
`tokenscope.html` + Dropbox setup and switch to the hosted React build under
`src/`. **Nothing in this file is required for the day-1 setup** — file it
for when you actually want to make the switch.

## What stays the same

- The wrapper's public API: `claudeCall({ tag, ... })` / `claude_call(tag=...)`
- The row schema (one row per call, same fields)
- The dashboard's visual design, charts, math, and weighted/compare modes
- All your historical data — JSONL rows can be bulk-imported into Supabase

## The seam

Both dashboards depend on **one function**: take an array of log rows in this
shape, return an aggregated `{ now, then, windowDays }` object that the pages
render.

In `tokenscope.html` this lives inline as `useUsageData(rows, windowSel, mode)`,
where `rows` comes from a Dropbox `fetch`.

In `src/`, the equivalent is `src/hooks/useUsageData.js`, which calls
`src/lib/queries.js#loadUsage` → `fetchLogsInRange` → Supabase.

**The aggregation logic is byte-identical** — `aggregateLogs` and `buildPeriod`
are the same in both places. When you switch, you only change the data source.

## Steps when you're ready

### 1. Set up Supabase (one-time, ~10 min)

Follow [`supabase/README.md`](./supabase/README.md). You'll end up with:

- A Supabase project
- The `usage_logs` table created (run [`supabase/001_init.sql`](./supabase/001_init.sql))
- An auth user account (you'll log in with email + password)
- Three values copied: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
- One UUID copied: `TOKENSCOPE_USER_ID` (your auth.users row)

### 2. Backfill your existing JSONL into Supabase (optional, one-time)

If you want your Dropbox-era history visible in the new dashboard, copy the
file out of Dropbox and run:

```bash
# Quick-and-dirty backfill via curl + Supabase REST.
# Run from a machine that has psql, OR use the Supabase SQL editor's
# "Insert" button + paste JSONL via the table editor.

while IFS= read -r line; do
  curl -s "$SUPABASE_URL/rest/v1/usage_logs" \
    -H "apikey: $SUPABASE_SERVICE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "$(echo "$line" | jq --arg uid "$TOKENSCOPE_USER_ID" '. + {user_id: $uid}')"
done < ~/Dropbox/tokenscope/usage.jsonl
```

(If the file is large, ask Claude to write a small Node script that batches
inserts — Supabase's REST endpoint accepts arrays of up to 1000 rows.)

### 3. Flip the wrapper to dual-write (zero-downtime)

The wrapper already supports both destinations simultaneously. Add the
Supabase env vars **alongside** your existing `TOKENSCOPE_LOG_FILE`:

```bash
export TOKENSCOPE_LOG_FILE=~/Dropbox/tokenscope/usage.jsonl   # keep this
export SUPABASE_URL=https://xxxx.supabase.co                  # new
export SUPABASE_SERVICE_KEY=eyJ...                            # new
export TOKENSCOPE_USER_ID=...                                 # new
```

Now every call writes to both. Run for a day or two to confirm Supabase is
catching everything, then drop `TOKENSCOPE_LOG_FILE` if you want to stop
syncing through Dropbox.

### 4. Deploy the React dashboard

Follow the original handoff:

1. `cd tokenscope && cp .env.example .env.local`, fill in
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the **anon** key, not
   service_role — the dashboard runs in the browser and RLS protects you).
2. `npm install && npm run dev` → confirm it works locally.
3. Vercel → import the repo, set **Root Directory** to `tokenscope/`, add the
   same two `VITE_*` env vars in project settings, deploy.

The Vite app under `src/` is already built and committed — you don't need to
write any code for the conversion. The HTML version under
`tokenscope/tokenscope.html` keeps working in parallel; you can delete it
whenever you're confident in the hosted version.

## Why both versions exist

| | `tokenscope.html` | `src/` (Vite + Supabase) |
|---|---|---|
| Setup time | 2 min | ~30 min |
| Auth | none (Dropbox link is privacy boundary) | proper Supabase Auth |
| Multi-device | yes (Dropbox syncs the file) | yes (queries the cloud) |
| Multi-user | no | yes (RLS isolates per user) |
| Hosted URL | optional (Dropbox/static host) | required (Vercel etc.) |
| Real-time | 30s polling | 30s polling (same UX) |
| Code split | one file | proper React project |
| Best for | one person, today | multi-user, long-term |

The HTML version is the right call until you (a) want to share the dashboard
with someone else, (b) want it behind real auth, or (c) the JSONL file gets
uncomfortably large (think tens of thousands of rows — Dropbox has to
re-download the whole thing each refresh).

## Rolling back

If anything goes wrong with the hosted version, the Dropbox flow is
untouched — just open `tokenscope.html` again. Nothing about the conversion
is destructive.
