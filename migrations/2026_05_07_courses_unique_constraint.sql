-- ============================================================
-- Migration: Courses unique constraint — prevents duplicate (student, course, term)
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
--   term) groupings with COUNT > 1 returned zero rows before applying.
--
-- What this migration does:
--   Adds a UNIQUE constraint on (student_id, name, term) to the
--   courses table. PostgreSQL's standard NULL-uniqueness rules apply,
--   meaning two rows with term=NULL for the same student/course would
--   not violate the constraint (but two rows with term='' WOULD).
--   Acceptable because the importer (post-fix) no longer creates
--   either NULL-term or empty-term rows.
--
-- What this migration does NOT do:
--   - Reject NULL-term rows (PostgreSQL treats NULLs as distinct in
--     UNIQUE; a future bug producing NULL terms would not be blocked
--     by this constraint, but would be visible as anomalies in the
--     data and easier to investigate)
--   - Use COALESCE/expression index to merge NULL and empty (decided
--     against — adds permanent complexity for an edge case the
--     importer fix already eliminates)
--   - Touch any other columns or tables
--
-- Companion changes shipped same day:
--   - migrations/2026_05_07_courses_dedup.sql — documents the
--     deduplication that made this constraint applicable
--   - DataSyncUpload.jsx — rejects term-less rows before they reach
--     the database
--
-- Operational note:
--   With this constraint in place, any future importer bug that tries
--   to create a duplicate will fail loudly with a constraint violation
--   error, surfacing in the import UI's error array. This is the
--   desired behavior — visible failure beats invisible duplication.
-- ============================================================

BEGIN;

ALTER TABLE courses
ADD CONSTRAINT courses_unique_per_student_term
UNIQUE (student_id, name, term);

COMMIT;

-- ============================================================
-- Rollback (run only if needed)
-- ============================================================
-- BEGIN;
-- ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_unique_per_student_term;
-- COMMIT;
-- ============================================================
