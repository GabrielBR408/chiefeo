-- 001 — completed_at + trashed_at on tasks
--
-- Adds nullable TIMESTAMPTZ columns so the app can record exactly when a task
-- was completed or trashed. Backfills both from `updated_at` for rows that are
-- already in the corresponding terminal state, since the original transition
-- time wasn't recorded before this migration.
--
-- Idempotent (`IF NOT EXISTS` + `IS NULL` guards) so it can be re-run safely.
--
-- Used by:
--   - `api/cron-expire-trash.js`             (filters `trashed_at < now() - 30d`)
--   - Priorities page → Cleanup card        (filters `completed_at < cutoff`)
--   - `index.html` → `dbRowToTask`/`taskToDbRow`/`dbUpdateTask`/`updateTask`
--
-- Applied in production: 2026-04-25.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS trashed_at   TIMESTAMPTZ;

UPDATE tasks SET completed_at = updated_at WHERE complete = true AND completed_at IS NULL;
UPDATE tasks SET trashed_at   = updated_at WHERE trashed  = true AND trashed_at   IS NULL;
