# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
- Sanitized `console.error` calls to log only `e?.message` and `e?.code` instead of full error objects, reducing the risk of accidentally surfacing network metadata or sensitive fields in browser DevTools.

### Security
- Added Subresource Integrity (`integrity` + `crossorigin="anonymous"`) to all CDN-loaded `<script src>` tags (React 18.2.0, ReactDOM 18.2.0, Babel Standalone 7.23.9). Hashes are sha384 and were computed from the official npm tarballs that cdnjs mirrors, so a tampered or substituted CDN payload will be rejected by the browser. Note: the Supabase ESM bundle is loaded via a JavaScript `import` statement (not a `<script src>` tag), where SRI is not currently expressible via attribute and is therefore tracked as a separate concern.
