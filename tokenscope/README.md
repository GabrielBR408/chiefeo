# TokenScope

> Claude API usage intelligence — token consumption, cost, latency, and cache
> efficiency, broken down by per-call tags you define.

The dashboard makes **zero Claude API calls** — all data is populated by a
fire-and-forget logging wrapper (Node and Python) that drops into your
existing code.

Two ways to run it. Pick one (you can switch later).

| | **HTML + Dropbox** (recommended day-1) | **React + Supabase + Vercel** (long-term) |
|---|---|---|
| Setup time | ~2 min | ~30 min |
| Where it lives | one `tokenscope.html` file | hosted Vercel app |
| Where data lives | a `.jsonl` file in your Dropbox | Supabase Postgres |
| Auth | none — Dropbox link is the boundary | proper Supabase Auth |
| Multi-user | no | yes |
| Best for | one person, today | shared with others, long-term |

The two paths share **the same wrapper**, **the same row schema**, and
**the same aggregation/charting code**. Switching later is a config change,
not a rebuild — see [`convert.md`](./convert.md).

## Path A — HTML + Dropbox (the simple path)

```
┌──────────────────────┐  append   ┌─────────────────────┐  fetch    ┌────────────────┐
│  Your code +         │ ────────▶ │  ~/Dropbox/         │ ────────▶ │  tokenscope    │
│  tokenscope wrapper  │  JSONL    │  tokenscope/        │  raw URL  │  .html         │
│                      │  line     │  usage.jsonl        │           │  (any browser) │
└──────────────────────┘           └─────────────────────┘           └────────────────┘
```

1. **Wrap your Claude calls.** Copy `wrappers/tokenscope.js` (or `.py`) into
   your project and replace `anthropic.messages.create(...)` with `claudeCall(...)`.
   See [`wrappers/README.md`](./wrappers/README.md).
2. **Set one env var:**
   ```bash
   export TOKENSCOPE_LOG_FILE=~/Dropbox/tokenscope/usage.jsonl
   ```
3. **Smoke test:** `cd wrappers && npm install && npm run smoke`. Confirm the
   file now exists with one line in it.
4. **Share the file:** in Dropbox, right-click the file → Share → Create link
   → copy.
5. **Open the dashboard:** double-click `tokenscope.html` (or host it
   anywhere — works from disk, from any static URL, from a USB stick). Click
   the gear icon, paste the Dropbox link, save. Done.

## Path B — React + Supabase + Vercel (when you outgrow path A)

Everything you need is in `src/`, `supabase/`, and `vercel.json`. Read
[`convert.md`](./convert.md) for the step-by-step migration.

## Repo layout

```
tokenscope/
├── tokenscope.html       # ★ single-file dashboard — path A
├── convert.md            # how to migrate path A → path B later
├── wrappers/             # tokenscope.js + tokenscope.py + smoke test
│   └── README.md         # wrapper setup + Dropbox walkthrough
├── src/                  # path B: React + Vite dashboard (Vercel)
│   ├── App.jsx
│   ├── pages/            # Overview, ByTag, Models, Log
│   ├── components/       # layout + shared atoms
│   ├── hooks/            # useAuth, useIsMobile, useUsageData
│   ├── lib/              # supabase client, queries, calculations
│   └── constants/theme.js
├── supabase/             # path B: 001_init.sql + setup walkthrough
├── tokenscope-v2.jsx     # approved design mockup (reference only)
├── vercel.json           # path B: Vercel framework preset + SPA rewrite
└── package.json          # path B: Vite project manifest
```

## Two viewing modes (both paths)

- **⚡ Weighted** (default) — recency-weighted summary numbers. Today counts
  ×1.0, 7 days ago counts ×0.30. Recent workflow shifts surface immediately
  instead of being smoothed away by 30-day averages. Charts always show raw
  daily values; only the headline cards re-weight.
- **↔ vs Prior** — every stat card pairs with a `prev` value and a green/red
  delta. Tags with no prior history get an `EMERGING ▲` badge.

The window selector (`7d` / `14d` / `30d`) controls both periods. Mode
toggling is instant — no re-fetch.

## Adding a tag

Tags are free-form strings. Just pass one when you call the wrapper:

```js
await claudeCall({
  tag: "owner-report",
  model: "claude-sonnet-4-6",
  messages: [{ role: "user", content: prompt }],
  metadata: { property: "1045-sansome" },
});
```

The dashboard auto-discovers new tags and assigns each a stable color.

## Hard rules

- Zero Claude API calls in the dashboard (either path).
- Wrapper is fire-and-forget — a logging failure never blocks the caller.
- Pricing lives in `wrappers/tokenscope.{js,py}` `PRICING`. Update both
  copies when Anthropic prices change. Historical rows are not retroactively
  re-priced.

## Phase 2 backlog

Tag management UI · monthly cost-budget alerts · CSV export · public
read-only share links · multi-user team workspaces · browser sidebar widget
· prompt-caching recommendations.
