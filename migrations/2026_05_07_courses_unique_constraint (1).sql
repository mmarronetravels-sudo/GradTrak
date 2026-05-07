-- ============================================================
-- Migration: Courses unique constraint — expression-index version
-- Date: May 7, 2026
-- ============================================================
-- Context:
--   Two duplicate-prevention bugs were identified and fixed earlier
--   on May 7:
--     1. 1,303 exact duplicates from repeated INSERTs (Step A)
--     2. 1,578 empty-term variants from term-less source rows (Step A.5)
--
--   Both were data-cleanup operations. This migration adds a database-
--   level guard so neither class of bug — nor any future bug along the
--   same lines — can silently corrupt the courses table again.
--
--   Verified pre-flight: a SELECT for any remaining (student_id, name,
--   normalized_term) groupings with COUNT > 1 returned zero rows before
--   applying.
--
-- What this migration does:
--   Adds a UNIQUE INDEX on (student_id, name, normalized_term), where
--   normalized_term is `COALESCE(NULLIF(TRIM(term), ''), '__NO_TERM__')`.
--   This treats NULL, empty-string, and whitespace-only terms as the
--   same value (the sentinel '__NO_TERM__'), so two rows for the same
--   (student, course) — one with a real term, one with no/empty term —
--   would COLLIDE on the index and be rejected.
--
--   Why an expression index instead of a plain UNIQUE constraint:
--     A plain `UNIQUE (student_id, name, term)` would NOT catch the
--     scenario we just spent the day cleaning up: an empty-term row
--     coexisting alongside a real-term row for the same (student,
--     course). PostgreSQL treats 'T1 25/26' and '' as distinct values,
--     so both rows could legally coexist under a plain UNIQUE — exactly
--     the bug we want to prevent.
--
--     The expression-index version normalizes empty/null/whitespace to
--     a single sentinel, making the empty-vs-real coexistence a
--     uniqueness violation at the database level.
--
-- What this migration does NOT do:
--   - Use a `CONSTRAINT` declaration (PostgreSQL doesn't allow named
--     UNIQUE constraints over expressions; the equivalent is a UNIQUE
--     INDEX, which provides identical enforcement)
--   - Touch any other columns or tables
--
-- Companion changes shipped same day:
--   - migrations/2026_05_07_courses_dedup.sql — documents the
--     deduplication that made this constraint applicable
--   - DataSyncUpload.jsx — rejects term-less rows before they reach
--     the database
--
-- Operational note:
--   With this index in place, any future importer bug that tries
--   to create a duplicate — including one that tries to insert an
--   empty-term row alongside an existing real-term row — will fail
--   loudly with a constraint violation error, surfacing in the import
--   UI's error array. Visible failure beats invisible duplication.
--
-- Historical note:
--   An earlier version of this migration (drafted earlier in the day)
--   used a plain `UNIQUE (student_id, name, term)` constraint. That
--   version was applied via Supabase SQL Editor inside a BEGIN/COMMIT
--   block whose COMMIT did not persist (Supabase SQL Editor sessions
--   end at the end of each Run, implicitly rolling back any open
--   transaction; explicit COMMIT statements run as separate Runs are
--   no-ops on already-finished sessions). When the lack of persistence
--   was discovered later that day, this stronger expression-index
--   version was applied instead, as a single-statement Run that
--   commits immediately. This file is the version that actually
--   reflects production state.
-- ============================================================

CREATE UNIQUE INDEX courses_unique_per_student_term
ON courses (
  student_id,
  name,
  COALESCE(NULLIF(TRIM(term), ''), '__NO_TERM__')
);

-- ============================================================
-- Verification
-- ============================================================
-- Confirm the index exists and has the expected definition:
--
--   SELECT indexname, indexdef
--   FROM pg_indexes
--   WHERE tablename = 'courses'
--     AND indexname = 'courses_unique_per_student_term';
-- ============================================================


-- ============================================================
-- Rollback (run only if needed)
-- ============================================================
-- DROP INDEX IF EXISTS courses_unique_per_student_term;
-- ============================================================
