# Migrations

SQL migrations for the ChiefEO Supabase database. Numbered, idempotent, applied
manually via the Supabase SQL editor (we don't run a migration framework yet —
the schema is small enough that a per-PR checklist works).

## How to apply

1. Open the SQL editor for the production project: <https://supabase.com/dashboard/project/dsmbppzvembacitwdrsj/sql/new>
2. Paste the contents of the next un-applied file from this directory.
3. Run.
4. Update the `Applied in production:` line at the top of the file in a follow-up
   commit so future readers know it's live.

## Files

| #   | File                                       | Purpose                                                                |
| --- | ------------------------------------------ | ---------------------------------------------------------------------- |
| 001 | `001-completed-at-trashed-at.sql`          | `tasks.completed_at` + `tasks.trashed_at` (TIMESTAMPTZ) for cleanup/cron |
| 002 | `002-due-date-priority-auto-flags.sql`     | `tasks.due_date_auto` + `tasks.priority_auto` (BOOLEAN) for the auto/manual indicator |

## Conventions

- File names: `NNN-kebab-case-summary.sql` (zero-padded, monotonically increasing).
- Always use `IF NOT EXISTS` / `IS NULL` guards so re-runs are safe.
- Header comment must explain *what*, *why*, and *which app code reads/writes
  the new column(s)*.
- Backfills go in the same migration as the schema change — never two migrations
  where one alters and one populates, or staggered deployments will see NULLs.
