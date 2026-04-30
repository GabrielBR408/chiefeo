-- 002 — due_date_auto + priority_auto on tasks
--
-- Adds two BOOLEAN flags so the app can mark which task fields were filled
-- in by the system (intake API auto-scoring) vs. typed in by the user.
-- Tasks created via `/api/intake` set both to TRUE; tasks created in the
-- web app's Quick-Add modal set both to FALSE; editing a date or priority
-- in the app flips the corresponding flag to FALSE.
--
-- Default is FALSE so existing rows (whose origin we can't recover) render
-- without the "auto" indicator — the user can still edit them and the
-- indicator will simply never appear. Going forward, intake-imported
-- rows are flagged TRUE explicitly.
--
-- Idempotent (`IF NOT EXISTS`) so it can be re-run safely.
--
-- Used by:
--   - `api/intake.js`                                 (sets both to TRUE on insert)
--   - `index.html` → `dbRowToTask` / `taskToDbRow` /
--     `dbUpdateTask` / `EditForm` / `TaskCard`        (renders + clears flags)
--
-- Applied in production: <pending>

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date_auto BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority_auto BOOLEAN NOT NULL DEFAULT false;
