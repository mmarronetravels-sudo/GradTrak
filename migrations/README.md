# Migrations

This folder contains SQL migration files for the GradTrack Supabase database.

## Conventions

- **One file per change.** Each migration is a self-contained SQL file.
- **Date-prefixed filenames.** Format: `YYYY_MM_DD_short_description.sql` (e.g., `2026_05_04_all_students_view_rls.sql`). Date prefixes ensure files sort chronologically.
- **Wrap in a transaction.** Every migration starts with `BEGIN;` and ends with `COMMIT;` so it applies atomically — either the whole thing succeeds or none of it does.
- **Header comment.** Each file opens with a comment block describing context, what it does, and what it does NOT do.
- **Rollback included, commented out.** Every migration has a rollback block at the bottom, commented out. If we ever need to revert, we uncomment and run.

## How migrations are run

Migrations are applied manually via the Supabase SQL Editor in the browser. There is no automated runner — this folder is the source-of-truth record of what's been applied, not an active deploy pipeline.

When applying a new migration:
1. Add the `.sql` file to this folder and commit it.
2. Paste the file contents into the Supabase SQL Editor and run.
3. Verify with the migration's own verification queries (usually a `SELECT` against `pg_policies` or similar).
4. Update the relevant master index file with a changelog entry.

## Existing files

| Date | File | Purpose |
|---|---|---|
| 2026-05-04 | `2026_05_04_all_students_view_rls.sql` | Widen counselor SELECT on `courses` and `student_notes` so non-superuser advisors can see courses/credits/notes in the All Students view |
