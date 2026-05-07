# GradTrack Master Index — May 7, 2026 Update

**Session: Duplicate courses cleanup (Step A complete, A.5 in progress)**

*Add to v40 — follows the May 4 update*

---

## Session Summary

This session is partway through a four-step cleanup of the `courses` table. An advisor reported a student whose past-term classes appeared duplicated, and a diagnostic sweep revealed the problem was not isolated: 1,303 duplicate rows across 65 students, all caused by `DataSyncUpload.jsx` running `INSERT` instead of `UPSERT` and re-importing the same historical course data on every sync.

**Step A (database cleanup of exact duplicates) shipped today.** Steps A.5 (empty-term-string variants), B (unique constraint), and C (importer fix) are pending. Step D (delete-course UI for advisors) is deferred to a future session.

The session began with the user reporting "every previous term has classes listed twice" on a student. Diagnostic queries showed the worst-affected students had imports stacked 4× deep (Aleena Hill at 119 rows, Kylah Herpst at 106, Amina Abdirahman at 82). Timeline of imports showed the trigger event: Apr 10 had two imports run 35 minutes apart at 20:44 and 21:19, both pulling full historical data and appending without deduplication. Apr 20 then layered another full reimport on top.

---

## ✅ Completed Today — Step A: Duplicate row deletion

**Symptom:** Students had identical (student_id, name, term) course rows duplicated 2–4 times across the table, with everything matching byte-for-byte except `id` and `created_at`. Worst case: Aleena Hill's English 9A S1 24/25 row repeated 4 times, all grade=F, credits=0, status=completed, same category_id.

**Scope:** 1,303 duplicate rows across 65 students. Date range Feb 5 – Apr 20, 2026. All cleanly attributable to `DataSyncUpload.jsx` running an INSERT-only path that re-imported historical course data on every sync.

**Discovery process:**

1. Dumped `courses` schema. Confirmed columns: `id (uuid)`, `student_id`, `category_id`, `name`, `credits`, `term`, `grade`, `is_dual_credit`, `dual_credit_type`, `created_at`, `pathway_id`, `status`, `section_name`, `teacher_name`, `teacher_email`, `completed_at`. No `course_code` field — `name` and `term` are the natural composite key.
2. Grouped on `(student_id, name, normalized_term)` where normalized_term = `LOWER(TRIM(term))`. 1,303 rows had `rn > 1`.
3. Spot-checked random duplicate groups — all confirmed identical grade/credits/category between the keeper and the duplicates. NULL-grade keepers paired with NULL-grade duplicates (no data loss from picking earliest-created as the survivor).
4. Reviewed import history for Aleena specifically: 22 rows on Jan 28, 5 on Feb 5, 29 on Apr 10 at 20:44, ~30 more on Apr 10 at 21:19 (35 minutes after the previous run, same day, same content), 33 on Apr 20. Pattern of full-history re-imports without dedup confirmed.

**Fix — applied via Supabase SQL Editor in production:**

- **Backup first:** `CREATE SCHEMA IF NOT EXISTS backups;` then `CREATE TABLE backups.courses_2026_05_07_dupes AS SELECT * FROM courses WHERE id IN (...)`. 1,303 rows backed up successfully.
- **Delete:** Wrapped in `BEGIN; ... COMMIT;`. Used CTE with `ROW_NUMBER() OVER (PARTITION BY student_id, name, LOWER(TRIM(term)) ORDER BY created_at)` and deleted where `rn > 1`. Verified `expected = 1303, still_present_should_be_zero = 0`. Committed.

**Verification:** Aleena Hill went from 119 course rows → 38, which matches her real courseload (a sophomore at ~25 courses/year × 1.5 years ≈ 37–38, accounting for trimesters and CRX courses). User confirmed the count looks right in GradTrack UI.

---

## 🔄 In Progress — Step A.5: Empty-string-term variants

**Issue:** During Step A's spot-checking, found a separate class of duplicate where the same student has the same course name with both an empty/null term AND a real term (e.g. `term=''` AND `term='T3 25/26'` for "Independent Study"). These didn't match Step A's grouping because `LOWER(TRIM(''))` ≠ `LOWER(TRIM('T3 25/26'))`.

**Scope:** Initial preview query returned a very large result set (~5000+ pairs visible in the result paste). Most are paired between an empty-term keeper and a `T3 25/26` real-term row. A significant portion span multiple terms (e.g. T1, T2, T3 with one empty version).

**Status:** Preview query has been run. **The result is too large to inspect row-by-row.** Need a grouped summary query first to understand the shape — then decide whether to delete the empty-term rows wholesale, or merge their data into real-term rows where the real-term row has nulls.

**Preview query that was run (for reference):**

```sql
SELECT
  c1.student_id, c1.name,
  c1.term AS empty_or_null_term, c2.term AS real_term,
  c1.id AS empty_row_id, c2.id AS real_row_id,
  c1.grade AS empty_grade, c2.grade AS real_grade,
  c1.created_at AS empty_created, c2.created_at AS real_created
FROM courses c1
JOIN courses c2
  ON c1.student_id = c2.student_id
  AND c1.name = c2.name
  AND c1.id != c2.id
WHERE (c1.term IS NULL OR TRIM(c1.term) = '')
  AND c2.term IS NOT NULL
  AND TRIM(c2.term) <> ''
ORDER BY c1.student_id, c1.name;
```

**Next action when resuming:** Run a grouped summary query to count how many empty-term rows exist, how many distinct students are affected, and whether any empty-term row has a non-null `grade` that the matching real-term row is missing (would need merging rather than deletion).

```sql
-- Suggested next query
SELECT
  COUNT(DISTINCT c1.id) AS empty_rows_total,
  COUNT(DISTINCT c1.student_id) AS students_affected,
  COUNT(DISTINCT c1.id) FILTER (
    WHERE c1.grade IS NOT NULL AND TRIM(c1.grade) <> ''
  ) AS empty_rows_with_grade
FROM courses c1
JOIN courses c2
  ON c1.student_id = c2.student_id
  AND c1.name = c2.name
  AND c1.id != c2.id
WHERE (c1.term IS NULL OR TRIM(c1.term) = '')
  AND c2.term IS NOT NULL
  AND TRIM(c2.term) <> '';
```

If `empty_rows_with_grade = 0`, just delete all empty-term rows that have a real-term sibling. If non-zero, need a merge strategy.

---

## ⏳ Pending — Step B: Unique constraint

After A.5 finishes, add a unique constraint to prevent recurrence:

```sql
-- Likely shape (verify normalized_term handling first)
ALTER TABLE courses
ADD CONSTRAINT courses_unique_per_student_term
UNIQUE (student_id, name, term);
```

**Open question:** Standard `UNIQUE` treats `''` and `NULL` as distinct. May need an expression index (`UNIQUE (student_id, name, LOWER(TRIM(COALESCE(term, ''))))`) instead, depending on how A.5 normalizes the term field. Decide based on what A.5 produces.

---

## ⏳ Pending — Step C: Importer fix

`DataSyncUpload.jsx` currently runs `.insert()` on every course row from Engage. Switch to `.upsert()` with `onConflict` matching the new constraint from Step B:

```javascript
// Approximate shape — verify against actual file before editing
await supabase.from('courses').upsert(rows, {
  onConflict: 'student_id,name,term',  // match Step B's constraint
  ignoreDuplicates: false,              // update on conflict, don't skip
});
```

**Decision point:** Should the upsert update grade/credits/status from new imports (overwriting any manual edits a counselor made), or should it skip-on-conflict (preserving manual edits but missing real updates from Engage)? Default recommendation: update only NULL fields; preserve any non-NULL field that exists in the database. Confirm with user before implementing.

---

## ⏳ Deferred — Step D: Delete-course UI

User originally asked for a delete-course feature for advisors so they could clean duplicates manually. After diagnosing the scope (1,303 rows), a database-side cleanup made more sense for the immediate problem. The UI feature is still wanted, but is scoped for a future session.

**Open design questions:**
- **Permissions:** Counselors delete their own caseload's courses? Admins delete anyone's? Case managers excluded entirely?
- **Audit:** Soft-delete (mark `deleted_at`) vs. hard-delete? Audit log entry per deletion?
- **Undo:** Time-window undo, or backup-table approach like Step A?
- **UI placement:** Inline trash icon on each course row in the student detail view, with confirm modal?

---

## Files Modified This Session

**Database (Supabase production, no file artifact in repo):**
- Created `backups` schema (idempotent)
- Created `backups.courses_2026_05_07_dupes` table (1,303 rows)
- Deleted 1,303 rows from `courses` (Step A)

**Note:** Step A was applied directly via Supabase SQL Editor without creating a `migrations/2026_05_07_*.sql` file in the repo, because the operation was data cleanup rather than schema change and the backup table preserves rollback capability. **Action item for next session:** Create a `migrations/2026_05_07_courses_dedup.sql` file documenting the queries that were run, for repo audit trail consistency with the May 4 RLS migration convention.

**Repo files (not yet modified — pending later steps):**
- `DataSyncUpload.jsx` — Step C
- `migrations/2026_05_07_courses_dedup.sql` — needs to be backfilled
- `migrations/2026_05_XX_courses_unique_constraint.sql` — Step B

---

## How to Resume Next Session

1. Open this file plus `master_index_may4_update.md` for context.
2. Tell new Claude: *"Continuing the courses table cleanup from May 7. Step A is committed. We're at Step A.5 — need to run a grouped summary query before deciding how to handle empty-term variants."*
3. First action: run the grouped summary query under "Next action when resuming" above.
4. Decide A.5 strategy based on `empty_rows_with_grade` count.
5. Execute A.5 with backup-then-delete pattern (same as Step A).
6. Move to B, then C.

**Backup table to keep:** `backups.courses_2026_05_07_dupes` — retain at least until Step C ships and we've confirmed no regression. Can drop ~14 days after C is in production.

---

## Pending Items Rolled Forward (Not Touched This Session)

These are unchanged from the May 4 update — restating so they're not lost:

- Importer match on engage_id first, email fallback (would have prevented Aleena profile email mismatch)
- Backup retention from Apr 30: drop `backups.profiles_2026_04_30_dupes` and `backups.counselor_assignments_2026_04_30_dupes` — already past the 7–14 day window, can drop now
- Audit remaining 9 counselors' `full_name` vs Engage `Advisor_Name`
- `calculateStudentStats` scope bug (categories not in scope) in Admin Student View
- At-Risk Report doesn't refresh after imports (stale tiles)
- Admin dashboard parent fetch likely missing `is_active=true` filter
- Expand non-earning grade filter (I, IP, NG, NC, W, U, N, NM, NE, NB, X, Y, WF) and normalize casing
- Investigate duplicate `diploma_types` rows (12 rows, 6 codes × 2)
- Git author identity on work computer auto-set as `mmarrone@MacBook-Pro-8.local`; needs `git config --global user.name/.email` (still applies if working from work computer next)

---

## Conventions Reaffirmed This Session

- **Backup-before-destructive-change** in `backups` schema with date-stamped table name (`backups.{tablename}_{YYYY_MM_DD}_{description}`)
- **Wrap destructive SQL in BEGIN/COMMIT** — verify counts inside the transaction before committing
- **Verification queries always paired with destructive queries** — `expected = N, still_present_should_be_zero = 0` pattern
- **Run via Supabase SQL Editor** (no staging environment exists)
- **Walk through one step at a time** per user preference
- **Diagnostic queries before action queries** — confirm scope before designing the fix
