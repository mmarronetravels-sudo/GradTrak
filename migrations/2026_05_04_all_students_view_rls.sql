-- ============================================================
-- Migration: All Students View — RLS widening for non-superuser counselors
-- Date: May 4, 2026
-- ============================================================
-- Context:
--   The "All Students" toggle in CounselorDashboard was rolled out in
--   April 2026 to all advisors, but the RLS policies on `courses` and
--   `student_notes` were never widened to match. Non-superuser counselors
--   could see the student list (because profiles_select_counselor already
--   permits school-wide read) but not courses, credits, or notes for any
--   student outside their counselor_assignments.
--
-- What this migration does:
--   Adds two new permissive SELECT policies — one on `courses`, one on
--   `student_notes` — that grant counselors read access to any student
--   in their own school. PostgreSQL evaluates multiple permissive policies
--   as OR, so the existing assignment-based policies remain in force as
--   redundant fallbacks.
--
-- What this migration does NOT do:
--   - Touch case_manager policies (they remain scoped to assigned IEP students)
--   - Touch student/parent/viewer/admin/superuser policies
--   - Modify any UPDATE/INSERT/DELETE policies
--   - Change the existing notes_insert_staff policy (already permits any
--     counselor to add notes against any student in school — verified May 4)
--   - Change the existing notes_update_own policy (already author-only,
--     so counselors still cannot edit other counselors' notes)
-- ============================================================

BEGIN;

-- ----------------------------------------------------------
-- 1. courses — let counselors read all courses for students in their school
-- ----------------------------------------------------------
CREATE POLICY "courses_select_counselor_school"
ON courses FOR SELECT
USING (
  auth_user_role() = 'counselor'
  AND EXISTS (
    SELECT 1 FROM profiles s
    WHERE s.id = courses.student_id
      AND s.school_id = auth_user_school_id()
      AND s.role = 'student'
  )
);

-- ----------------------------------------------------------
-- 2. student_notes — let counselors read all notes for students in their school
-- ----------------------------------------------------------
CREATE POLICY "notes_select_counselor_school"
ON student_notes FOR SELECT
USING (
  auth_user_role() = 'counselor'
  AND EXISTS (
    SELECT 1 FROM profiles s
    WHERE s.id = student_notes.student_id
      AND s.school_id = auth_user_school_id()
      AND s.role = 'student'
  )
);

COMMIT;

-- ============================================================
-- Rollback (run only if needed)
-- ============================================================
-- BEGIN;
-- DROP POLICY IF EXISTS "courses_select_counselor_school" ON courses;
-- DROP POLICY IF EXISTS "notes_select_counselor_school" ON student_notes;
-- COMMIT;
