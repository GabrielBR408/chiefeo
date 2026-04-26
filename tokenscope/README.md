# TokenScope

> Claude API usage intelligence — token consumption, cost, latency, and cache
> efficiency, broken down by per-call tags you define.

A pure data-visualization layer over a Supabase `usage_logs` table. The dashboard
itself makes **zero Claude API calls** — all data is populated by a fire-and-forget
logging wrapper (Node and Python) that drops into your existing code.

```
┌──────────────────────┐    insert     ┌──────────┐    select     ┌──────────────┐
│  Your code +         │  ───────────▶ │ Supabase │  ───────────▶ │  TokenScope  │
│  tokenscope wrapper  │  service key  │  Postgres│  anon + RLS   │  React app   │
└──────────────────────┘               └──────────┘               └──────────────┘
```

## Repo layout

```
tokenscope/
├── src/                 # React + Vite dashboard (deploy this to Vercel)
│   ├── App.jsx          # auth guard + tab routing + global state
│   ├── pages/           # Overview, ByTag, Models, Log
│   ├── components/      # layout (Header, TabBar, ModeBar) + shared atoms
│   ├── hooks/           # useAuth, useIsMobile, useUsageData
│   ├── lib/             # supabase client, queries, calculations
│   └── constants/theme.js
├── supabase/            # 001_init.sql + setup walkthrough
├── wrappers/            # tokenscope.js + tokenscope.py + smoke test
├── tokenscope-v2.jsx    # approved design mockup (reference only)
├── vercel.json          # SPA rewrite + vite framework preset
└── package.json
```

## Build order (mirrors the original handoff)

1. **Supabase**: create project, run [`supabase/001_init.sql`](./supabase/001_init.sql),
   create your account in Auth, copy URL/keys. See [`supabase/README.md`](./supabase/README.md).
2. **JS wrapper**: `cd wrappers && npm install`, set env vars, `npm run smoke`,
   confirm a row in `usage_logs`. See [`wrappers/README.md`](./wrappers/README.md).
3. **Python wrapper**: `pip install -r wrappers/requirements.txt`, same env vars.
4. **Frontend**: `cd tokenscope && cp .env.example .env.local`, fill in
   `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`, then `npm install && npm run dev`.
5. **Vercel**: import the repo (root = `tokenscope/`), set the same two env vars in
   project settings, push to deploy.

## Two viewing modes

- **⚡ Weighted** (default) — recency-weighted summary numbers. Today counts ×1.0,
  7 days ago counts ×0.30. Recent workflow shifts surface immediately instead of
  being smoothed away by 30-day averages. Daily charts always show raw values;
  only the headline stat cards re-weight.
- **↔ vs Prior** — every stat card pairs with a `prev` value and a green/red
  delta. Tags with no prior history get an `EMERGING ▲` badge. Useful when you
  add or pivot a workflow and want to see exactly what changed.

The window selector (`7d` / `14d` / `30d`) controls the size of both periods.
Switching modes re-aggregates locally — no DB round-trip — so the toggle is
instant.

## Adding a tag

Tags are free-form strings. Just pass one when you call the wrapper:

```js
await claudeCall({
  tag: "owner-report",            // any string
  model: "claude-sonnet-4-6",
  messages: [{ role: "user", content: prompt }],
  metadata: { property: "1045-sansome" },
});
```

The dashboard automatically picks up new tags and assigns them a stable color
(seeded names get the brand palette; everything else gets a hash-based pick).

## Hard rules

- Zero Claude API calls in the deployed dashboard.
- Stack is fixed: **React + Vite + Recharts + Supabase + Vercel**. No Tailwind,
  no other chart libs, no other styling solutions — inline styles + the `C`
  theme object only.
- Wrapper is fire-and-forget: a logging failure never blocks the caller.
- Pricing lives in `wrappers/tokenscope.{js,py}` `PRICING`. Update both when
  Anthropic prices change. Historical rows are not retroactively re-priced.

## Phase 2 backlog (not built)

Tag management UI · monthly cost-budget alerts · CSV export · public read-only
share links · multi-user team workspaces · browser sidebar widget · prompt-caching
recommendations.
