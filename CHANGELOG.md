# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **`POST /api/score-task`** — new Vercel serverless function that owns the proprietary scoring IP (the default keyword library, sender→tier lookup, keyword/sender tier combination, and due-date defaults). Accepts `{ name, senderEmail, receivedDateISO, explicitDueDate, todayISO, tierOverride? }` and returns `{ tier, startPriority, peakPriority, dueDate, matchedKeywords }` — the keyword library itself is never returned. Authenticates via either a Supabase `Authorization: Bearer <access_token>` header (the browser flow) or the same `x-api-key` → `CHIEFEO_USER_ID_<LABEL>` mapping that `api/intake.js` uses (the Claude skill flow). Reads the user's priorities config (custom people, custom keywords) via the SERVICE ROLE key and falls back to server-side defaults when fields are missing. The browser now calls this endpoint from `handleQuickAdd`, `rescoreAllTasks`, and a 250ms-debounced effect inside `QuickAddModal` instead of running the scoring functions locally.
- **Trash auto-expire cron** at `api/cron-expire-trash.js`, scheduled via `vercel.json` for `0 3 * * *` (03:00 UTC daily). Feature-flagged off by default: every run returns `{ skipped: true, reason: "feature_flag_off" }` unless the Vercel env var `AUTO_DELETE_TRASH_ENABLED` is the literal string `"true"`. When enabled, deletes every row in `tasks` with `trashed=true` and `trashed_at` older than 30 days, using the Supabase SERVICE ROLE key to bypass RLS, and returns the deleted count parsed from PostgREST's `Content-Range` header. Stays off until Phase 6 ships.
- **Cleanup** card on the Priorities/settings page lets the user permanently delete completed tasks older than a chosen window (30 days, 90 days, 6 months, 1 year). Counts matches against the locally loaded task list, opens a confirmation modal showing the count, and on confirm runs a single Supabase `DELETE` filtered by `user_id + complete=true + completed_at < cutoff`. Tasks with NULL `completed_at` (completions from before Phase 3) are excluded — only tasks whose completion time is known get swept. Shows a "Deleted N completed tasks." toast on success.
- `tasks.completed_at` and `tasks.trashed_at` (TIMESTAMPTZ) columns are now read and written by the frontend. The central `updateTask` mutator pairs every `complete`/`trashed` flag flip with its corresponding timestamp (or NULL on un-flip), and `dbRowToTask` / `taskToDbRow` / `dbUpdateTask` map the new fields. Pre-existing rows with NULL timestamps are tolerated (they fall through every "older than X" sweep).
  > **Migration required.** Run in the Supabase SQL editor before merging:
  > ```sql
  > ALTER TABLE tasks ADD COLUMN completed_at TIMESTAMPTZ;
  > ALTER TABLE tasks ADD COLUMN trashed_at   TIMESTAMPTZ;
  > UPDATE tasks SET completed_at = updated_at WHERE complete = true AND completed_at IS NULL;
  > UPDATE tasks SET trashed_at   = updated_at WHERE trashed  = true AND trashed_at   IS NULL;
  > ```
- Copyright notice HTML comment at the top of `index.html`.
- `LICENSE` file declaring proprietary, all-rights-reserved terms under Golden Real Estate Ventures and Exchanges LLC.
- Web App Manifest at `manifest.json` (repo root, served as `/manifest.json`) declaring ChiefEO as a standalone PWA (theme color `#3b82f6`, background `#f8fafc`, start URL `/`).
- Placeholder icon set under `icons/` (16, 32, 180, 192, 512 px) — a blue rounded-square with white "CE" wordmark — wired up via `<link rel="manifest">`, `<link rel="apple-touch-icon">`, favicon `<link>`s, and the iOS-specific `apple-mobile-web-app-capable` / `apple-mobile-web-app-status-bar-style` / `theme-color` meta tags so the app installs cleanly to home screens on iOS and Android.
- Service worker (`sw.js`, cache `chiefeo-v1`) registered from `index.html` on `window.load`. Pre-caches the HTML shell (`/`, `/index.html`, `/manifest.json`, `/icons/icon-192.png`) on install. Uses cache-first for shell/static asset requests and network-first with cache fallback for any `*.supabase.co` host so the UI stays usable offline while live Supabase reads/writes always prefer the network when reachable. An `activate` handler purges any cache key other than the current `CACHE` constant on version bumps.
- iOS "Add to Home Screen" install hint: a dismissible bottom-sheet banner styled to match the app's dark header (gradient `#1e293b → #334155`) instructing users to tap the Share icon and choose **Add to Home Screen**. Detection only shows it on iOS Safari (UA tests for `iPad|iPhone|iPod` plus iPadOS-as-Mac fingerprint, and excludes `CriOS`/`FxiOS`/`EdgiOS`/`OPiOS`/`DuckDuckGo`/`YaBrowser`/`MiuiBrowser`). Suppressed when already installed (`navigator.standalone === true` or `display-mode: standalone`) and after the user dismisses via the `&times;` button, which persists `chiefeo:iosInstallHintDismissed=1` in `localStorage`.

### Changed
- **Scoring logic moved off the client.** `index.html` no longer ships `scoreNewTask`, `combineTiers`, `scanKeywords`/`extractKeywords`, `lookupSenderTier`, `valueToTier`, the `TIER_VALUE` map, or the default keyword library. `DEFAULT_PRIORITIES.keywords` is now `[]` — viewing source on the deployed app no longer reveals the keyword set. New users see an empty Keywords list in the Priorities UI; the server's defaults still apply silently while they add their own custom keywords. Existing users keep whatever keywords are already in their saved Supabase priorities row.
- Sanitized `console.error` calls to log only `e?.message` and `e?.code` instead of full error objects, reducing the risk of accidentally surfacing network metadata or sensitive fields in browser DevTools.

### Security
- Added Subresource Integrity (`integrity` + `crossorigin="anonymous"`) to all CDN-loaded `<script src>` tags (React 18.2.0, ReactDOM 18.2.0, Babel Standalone 7.23.9). Hashes are sha384 and were computed from the official npm tarballs that cdnjs mirrors, so a tampered or substituted CDN payload will be rejected by the browser. Note: the Supabase ESM bundle is loaded via a JavaScript `import` statement (not a `<script src>` tag), where SRI is not currently expressible via attribute and is therefore tracked as a separate concern.
