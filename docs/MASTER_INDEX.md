# GradTrak — Master Index

> Internal map of the codebase. The public-facing `README.md` covers what the app
> is, demo logins, and how to run/deploy. **This document** is the orientation
> guide for working *inside* the code: where things live, how roles route, what
> every component does, the data model, and a running change log.

- **Last updated:** June 18, 2026
- **App version:** `2.15.1` (constant `APP_VERSION` in `App.jsx`)
- **Package name:** `gradtrack` (package.json), version `2.0.0`
- **Naming note:** The product is branded **"ScholarPath Graduation Progress"** in
  the README and **"GradTrack/GradTrak"** in the repo/package and in component
  header comments. Same product; the inconsistency is historical.

---

## 1. What it is

A mobile-friendly web app for high-school credit tracking and graduation
planning, with first-class support for **dual-credit** courses (courses that
count toward both a high-school diploma and an Associate/Transfer college
degree). It serves students, counselors/case managers, school admins, and
parents, each with a distinct dashboard.

---

## 2. Tech stack & how it boots

- **Frontend:** React 18 + Vite 5, styled with Tailwind CSS 3.
- **Backend:** Supabase — Postgres (with row-level data scoped by `school_id`),
  Supabase Auth, and Deno **edge functions**.
- **Notable libraries:** `recharts` (charts), `jspdf` (PDF transcripts/plans),
  `xlsx` + `csv-parse` + `react-dropzone` (data import), `lucide-react` (icons).
- **Boot path:** `index.html` → `main.jsx` → `App.jsx` (`export default App`).
  `supabase.js` creates the singleton Supabase client from
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see `.env.local`).
- **App startup logic:** `App()` (App.jsx ~line 4778) handles auth/session
  recovery, loads the user `profile`, then routes to the correct dashboard by
  role (see §4).

---

## 3. Repo layout

```
GradTrak/
├── index.html, main.jsx        # entry
├── App.jsx                     # ~5,000-line core: auth, routing, dashboards, helpers
├── supabase.js                 # Supabase client + diploma-type data helpers
├── hooks/
│   └── useSupabaseQuery.js      # generic data-fetching hook (loading/error/data)
├── components/                 # feature components (see §7)
├── supabase/
│   ├── functions/send-advising-email/index.ts
│   └── invite-parent/index.ts
├── docs/
│   ├── MASTER_INDEX.md          # this file
│   └── UPDATES_2026-04-16.md    # dated changelog entry
├── vite.config.js, tailwind.config.js, postcss.config.js
├── vercel.json, .vercel/        # deploy config (Vercel project: grad-trak)
└── README.md
```

---

## 4. Roles & routing

User role lives on the `profiles` row (`profile.role`). Routing happens at the
bottom of `App()` (App.jsx ~5002–5031):

| Role | Lands in | Notes |
|------|----------|-------|
| `admin` | `AdminDashboard` (or `CounselorDashboard` when `adminViewMode === 'counselor'`) | Admin can switch into a counselor view of the data. |
| `counselor` | `CounselorDashboard` | Sees assigned caseload by default; can toggle to all students. Display title "School Counselor". |
| `case_manager` | `CounselorDashboard` | Same dashboard; assignments filtered by `assignment_type = 'case_manager'`. Display title "Case Manager". |
| `viewer` | `CounselorDashboard` | Read-oriented; always sees all students school-wide. |
| `parent` | `ParentDashboard` | Linked to students via `parent_students`. |
| `student` (default) | `StudentDashboard` | Sees only their own record. |

`is_superuser` is an additional flag that grants school-wide student visibility
regardless of caseload.

---

## 5. The four dashboards (all defined in App.jsx)

- **`StudentDashboard`** (~2245): the student's own credit progress — category
  cards, circular progress, dual-credit badges, CTE pathway progress, alerts,
  the Credit Progress Timeline, transcript export.
- **`CounselorDashboard`** (~2605): the workhorse. Tabbed `mainView`:
  `students` (roster), `at-risk`, `cte-pathways`, `contact-snapshot`,
  `mtss-interventions`. Holds the **My Students / All Students** toggle
  (`viewAllStudents` state) and per-student detail with notes, emails, parent
  alerts, contracts, archive. Admins enter here via "switch to counselor". The
  `students` roster toolbar has a **📣 Email Group** button (`BulkEmailModal`)
  for emailing a filtered group at once (counselor/case_manager/admin, plus any
  superuser).
- **`AdminDashboard`** (App.jsx ~1181 — *note:* there is also a separate
  `components/AdminDashboard.jsx`; the in-`App.jsx` one is what's routed):
  school-wide management — data sync upload, at-risk, CTE pathways, attendance
  export, audit log, FERPA, student management.
- **`ParentDashboard`** (~4489): read-only view of the parent's linked student(s).

---

## 6. App.jsx internal map

`App.jsx` is large; use these landmarks (line numbers approximate, they drift
with edits — search the banner text):

**Section banners** (`// ==== TITLE ====`):

| ~Line | Banner | Contents |
|------|--------|----------|
| 19 | AUDIT LOGGING HELPER | `logAudit(action, table, recordId, details)` → inserts into `audit_logs`. |
| 40 | UTILITY FUNCTIONS | credit/diploma/pathway/alert calculations (below). |
| 223 | UI COMPONENTS | small presentational components (below). |
| 433 | PRIVACY SETTINGS MODAL (FERPA) | `PrivacySettingsModal` — deletion requests. |
| 547 | ADD COURSE MODAL | `AddCourseModal`. |
| 711 | TRANSCRIPT MODAL | `TranscriptModal` — jsPDF transcript export. |
| 919 | LOGIN / SIGNUP SCREEN | `AuthScreen`. |
| 1177 | ADMIN DASHBOARD | `AdminDashboard` + `CategoryModal`, `PathwayModal`. |
| 2243 | (student) | `StudentDashboard`. |
| 2573 | COUNSELOR DASHBOARD | `CounselorDashboard` (incl. Advising Plan PDF export ~3005). |
| 4487 | (parent) | `ParentDashboard`. |
| 4774 | MAIN APP | `App()` root: session recovery (~4922), role routing. |

**Utility functions** (pure helpers, ~44–220):
`calculateYearlyProgress`, `calculateStudentStats` (sums earned credits, used
across views), `calculatePathwayProgress` (CTE), `generateAlerts`,
`getDisplayName`.

**Small UI components** (~227–422): `CircularProgress`, `YearlyProgressChart`,
`ProgressBar`, `DualCreditBadge`, `CTEBadge`, `AlertBanner`, `CategoryCard`,
`PathwayCard`, `CourseItem`, `LoadingSpinner`.

---

## 7. Components catalog (`components/`)

| File | Purpose | Key props |
|------|---------|-----------|
| `AtRiskReport.jsx` | At-risk student report with risk levels, filters, CSV export. Fetches its own data; when `counselorId` is `null` it loads the whole school, otherwise just that counselor's caseload. | `schoolId`, `counselorId` (null = all), `onSelectStudent` |
| `CTEPathwayReport.jsx` | CTE pathway completion report. Same caseload/all pattern as At-Risk. | `schoolId`, `counselorId`, `onSelectStudent` |
| `ContactSnapshotReport.jsx` | Contacts (notes) per staff member per month — counts all note-loggers, not just counselors. | object props |
| `MTSSInterventionReport.jsx` | MTSS tracker: students with intervention notes, sorted by count. Relies on `school_id` being set on notes. | object props |
| `StudentNotesLog.jsx` | Structured, timestamped note-taking log for a student. | object props |
| `AcademicContractForm.jsx` | Modal to create/review academic contracts (`academic_contracts`). | object props |
| `SendAdvisingEmail.jsx` | Email a student's notes/plan via the `send-advising-email` edge function. | object props |
| `SendParentAlert.jsx` | "Student behind in coursework" alert to a parent. | object props |
| `BulkEmailModal.jsx` | Email a filtered group of students at once (by grade/risk/pathway/flag or whole current view); loops `send-advising-email` per recipient with `logContact: true`, so each `bulk_email` contact note is written server-side. Opened from the roster's "📣 Email Group" button. | `students`, `pathways`, `categories`, `counselorProfile`, `supabaseClient`, `getRiskLevel`, `onSent` |
| `AttendanceContactExport.jsx` | Admin CSV export of notes flagged as attendance contacts. | `supabaseClient`, `schoolId` |
| `DataSyncUpload.jsx` | Bulk import of students/courses (CSV/XLSX via dropzone), mapped against diploma types. | `schoolId` |
| `AdminStudentManager.jsx` | Admin roster management; caps display grade at 12 for "super seniors". | `schoolId`, `profile`, `onViewStudent` |
| `ArchiveStudentModal.jsx` | Archive/withdraw or reactivate a student (sets `is_active`, withdrawal fields). | object props |
| `CreditProgressTimeline.jsx` | Recharts line chart: cumulative credits earned by term vs. expected pace, with On/Behind Pace badge. | `courses`, `totalRequired`, `graduationYear` |
| `AdminDashboard.jsx` | Standalone admin dashboard component (the routed admin UI lives in App.jsx). | `user`, `profile`, `onLogout` |
| `QueryState.jsx` | Reusable loading/error/empty wrapper for Supabase queries. | render props |
| `Navbar.jsx` | (stub) | — |

**Hook:** `hooks/useSupabaseQuery.js` — `useSupabaseQuery(queryFn, deps)` returns
`{ data, loading, error, refetch }`.

**`supabase.js` helpers:** `getDiplomaTypes(schoolId)`,
`getDiplomaRequirements(diplomaTypeId)`,
`getDiplomaTypesWithRequirements(schoolId)`.

---

## 8. Edge functions (`supabase/`)

- **`send-advising-email/index.ts`** — Deno function that emails advising
  content to a single student (plus optional CCs) and logs to
  `email_audit_logs`. Invoked at `functions/v1/send-advising-email`. Restricted
  to `counselor`/`admin`/`case_manager` **or any `is_superuser` sender**.
  `contentType` accepts `notes`, `plan`, `both` (advising-notes framing) and
  `message`, `message_plan` (custom message with a neutral "A message from your
  counselor" intro; takes a `messageHtml` param). When the request includes
  `logContact: true` (+ `contactNote`, `contactNoteType`), it also inserts a
  `student_notes` contact row using the **service-role key** (bypasses RLS, so
  it works for senders without notes-insert rights). The bulk-email feature
  calls this once per recipient with `logContact: true`.
- **`invite-parent/index.ts`** — creates/invites a parent account and links it to
  a student. Payload: `{ parentEmail, studentId, studentName, counselorName,
  schoolId }`. Invoked at `functions/v1/invite-parent`.

---

## 9. Data model (Supabase tables referenced)

Counts are how often the table is queried in the codebase — a rough proxy for
centrality.

| Table | Role |
|-------|------|
| `profiles` (30) | All users (students + staff + parents); holds `role`, `school_id`, `grade`, `graduation_year`, flags (`is_iep`/`has_iep`, `is_504`/`has_504`, `is_ell`, `is_ged`), `is_active`, withdrawal fields, `diploma_type` join. |
| `counselor_assignments` (14) | Maps staff → students. `assignment_type` is `counselor` or `case_manager`; this is what the caseload filter uses. |
| `courses` (12) | Per-student course records: `credits`, `grade`, `status`, `term`. `F`/`NP` grades earn no credit. |
| `student_notes` (9) | Counselor notes/interventions/contacts. Must carry `school_id` (a missing-`school_id` bug previously broke MTSS — see changelog). |
| `credit_categories` (8) | Graduation credit buckets per school (`display_order`). |
| `cte_pathways` (6) | Career & Technical Education pathways. |
| `course_mappings` (6) / `course_pathways` (2) | Map courses to categories/pathways. |
| `diploma_requirements` (4) / `diploma_types` (1) | Diploma definitions and per-category credit requirements. |
| `deletion_requests` (4) | FERPA data-deletion requests. |
| `parent_students` (3) | Parent ↔ student links. |
| `academic_contracts` (2) | Academic contracts. |
| `audit_logs` (2) | Activity log (action, table, record, user, details). |
| `schools` (2) | School records. |
| `advisor_mappings` (1), `counselor_caseload_summary` (1), `school_subscription_status` (1) | Auxiliary/reporting/billing. |

Everything is scoped by `school_id` (multi-tenant). **Open concern:** the
`diploma_requirements` fetch in `CounselorDashboard` is missing a `school_id`
filter (flagged in-code as a cross-tenant issue for a future security commit).

---

## 10. Key domain concepts

- **Caseload vs. school-wide.** Counselors/case managers see their assigned
  caseload by default. The **`viewAllStudents`** state (the 👤 My Students / 👁
  All Students toggle) flips reports and rosters to the whole school. When
  `viewAllStudents` is true, components are passed `counselorId={null}`, which
  makes them query all students for the school. The toggle is gated to
  `counselor`/`case_manager` roles. `viewer`/`admin` have **no toggle** and are
  meant to see everyone, so the reports must pass `counselorId={null}` for them
  unconditionally — the At-Risk and CTE report calls do this via
  `(viewAllStudents || role === 'viewer' || role === 'admin') ? null : profile.id`
  (see changelog `b7356d4`). The roster query already special-cases
  `viewer`/`admin` the same way.
- **Credit calculation.** Total required = **24 credits**. Earned credits sum
  `completed` courses, **excluding `F` and `NP` grades** (no credit earned).
- **At-risk thresholds** (`AtRiskReport`, by expected-vs-actual credits for the
  current trimester): **Critical** ≥ 3 behind, **At-Risk** ≥ 1.5, **Watch** ≥
  0.5, otherwise **On Track**. Expected progress is a grade×trimester lookup
  table (e.g., grade 12 trimester 3 expects 92% of 24).
- **Trimester model.** The app thinks in trimesters (Fall/Winter/Spring),
  derived from the calendar month.
- **Dual credit.** Courses can count toward an Associate and/or Transfer college
  degree in addition to the HS diploma — surfaced via `DualCreditBadge`.
- **CTE pathways.** Career/technical sequences tracked via `cte_pathways` +
  `course_pathways`/`course_mappings`; completion shown in `CTEPathwayReport`.
- **MTSS.** Multi-Tiered System of Supports — intervention tracking built on
  `student_notes` (requires `school_id` on each note).
- **FERPA.** Privacy compliance: data-deletion requests (`deletion_requests`),
  data-access summary, compliance statement — surfaced in the FERPA admin tab
  and `PrivacySettingsModal`.

---

## 11. Deploy flow

- Hosted on **Vercel** (project `grad-trak`, see `.vercel/project.json`).
- **Push to `main` on GitHub → Vercel auto-deploys** (`mmarronetravels-sudo/GradTrak`).
- Local dev: `npm run dev`; production build: `npm run build` (Vite → `dist/`).
- Env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) live in `.env.local`
  locally and Vercel project settings in production.

---

## 12. Known issues / cleanup backlog

- **`diploma_requirements` cross-tenant fetch** missing a `school_id` filter
  (flagged in `CounselorDashboard`) — security follow-up.
- **Brand naming** is split between "ScholarPath" (README) and "GradTrak/GradTrack"
  (everywhere else).
- **`node_modules/` appears tracked** in git (it shows up in status) — should be
  gitignored to keep diffs clean.
- Two `AdminDashboard` definitions exist (in `App.jsx` and `components/`); only
  the App.jsx one is routed — potential source of confusion.

---

## 13. Change log

| Date | Commit | Change |
|------|--------|--------|
| 2026-06-18 | _(pending)_ | **Superusers can use bulk email; bulk contact-note logging moved server-side.** A school counselor (`rmacswain@summitlc.org`) set up as role `viewer` + `is_superuser = true` (school-wide visibility, no caseload) couldn't see the 📣 Email Group button, and the `send-advising-email` edge function would have rejected her (`viewer` not in the allowed list). Widened the button gate to also include `profile.is_superuser`, and the edge function to allow any `is_superuser` sender (in addition to counselor/admin/case_manager). Because a viewer almost certainly lacks RLS INSERT rights on `student_notes` (the `notes_insert_staff` policy is counselor-scoped), the per-recipient contact note is now written **server-side inside the edge function using the service-role key** (RLS-proof) when the request includes `logContact: true` (+ `contactNote`, `contactNoteType`); `BulkEmailModal` no longer inserts the note client-side. Single-student `SendAdvisingEmail` and `SendParentAlert` are unaffected (they don't send `logContact`; SendParentAlert still logs its own `parent_contact` note). Confirmed `case_manager` is covered by both the button and the edge function. **Requires edge-function redeploy.** Bumped `APP_VERSION` to `2.15.1`. |
| 2026-06-18 | _(pending)_ | **Advisor bulk email to a filtered group, logged as a contact.** New `components/BulkEmailModal.jsx`, opened from a "📣 Email Group" button in the `CounselorDashboard` roster toolbar (gated to `counselor`/`case_manager`/`admin`; hidden from `viewer`). An advisor picks a group — Everyone in current view, by grade, by risk level (uses `getStudentRiskLevel`), by CTE pathway, or by flag (IEP/504/ELL/GED) — then deselects individuals if needed, writes a subject + message, and optionally attaches each student's graduation-progress summary. It loops the recipients sequentially (≈350ms throttle), sending one personalized email per student via the existing `send-advising-email` edge function, and logs **one `student_notes` contact per successful recipient** (`note_type: 'bulk_email'`, `status: 'completed'`, `contact_date`) — mirroring the `SendParentAlert` auto-log pattern. The bulk note shows in Contact Snapshot and on each student's timeline but does **not** inflate the MTSS tracker, which only counts `note_type === 'intervention'`. Students with no email on file are listed and skipped. Recipient scope comes from `filteredStudents`, so it already respects caseload / All-Students and `school_id`. **Edge function change (requires redeploy):** `send-advising-email/index.ts` now accepts `messageHtml` and two new `contentType` values, `message` and `message_plan`, rendering a neutral "A message from your counselor" intro instead of the advising-notes framing; existing `notes`/`plan`/`both` paths are unchanged. Bumped `APP_VERSION` to `2.15.0`. |
| 2026-06-18 | _(pending)_ | **Authenticated-but-no-profile now shows an actionable error instead of silently looping the login screen.** A `viewer` staff member (`ahood@summitlc.org`) could authenticate (`SIGNED_IN`) but `findOrCreateProfile` returned `null`, so the app spun for 30s then fell through to `AuthScreen` — making a successful sign-in look like a failed login. Root cause was a **profile/auth id mismatch**: her `profiles.id` did not equal her `auth.users.id`, so the by-id lookup missed and the by-email self-heal was hidden by RLS (which scopes `profiles` to `id = auth.uid()`), so the relink PATCH never ran. Data fix: repoint `profiles.id` to the real auth UID. Code fix (this commit): split the `!user \|\| !profile` guard so an authenticated user with no profile sees a "We couldn't load your account / contact your admin" screen with a Sign out button, rather than being bounced to login. Bumped `APP_VERSION` to `2.14.1`. **Follow-up:** the by-email self-heal can never work under RLS keyed on `id`; profile creation should always set `profiles.id = auth uid` (trigger on `auth.users` insert or fix the invite flow). |
| 2026-06-15 | `b7356d4` | **At-Risk & CTE reports now show all students for `viewer`/`admin` roles.** A staff member with the `viewer` role (read-only, school-wide by design) could see the full roster but the At-Risk and CTE tabs collapsed to a "caseload." Cause: those reports passed `counselorId={viewAllStudents ? null : profile.id}`, but `viewer`/`admin` never get the My/All Students toggle, so `viewAllStudents` was always false and `counselorId` defaulted to their own id. Fixed to `counselorId={(viewAllStudents \|\| profile.role === 'viewer' \|\| profile.role === 'admin') ? null : profile.id}`, matching the roster's existing viewer/admin handling. Not an RLS issue — the `courses` school-wide policy was already in place. |
| 2026-06-09 | `cfaaf29` | **CTE Pathways report honors the All Students toggle.** Mirrored the At-Risk fix: the 👤/👁 toggle now also renders on the CTE Pathways tab, and the report uses `counselorId={viewAllStudents ? null : profile.id}` so a school counselor can view pathway progress for every student school-wide. |
| 2026-06-09 | `f9c80b6` | **At-Risk Report honors the All Students toggle.** The 👤/👁 toggle was rendered only inside the student-list view, so it vanished on the At-Risk tab, and the report was hard-coded to the counselor's own caseload (`counselorId={profile.id}`). Moved the toggle so it also shows on the At-Risk tab and changed the report to `counselorId={viewAllStudents ? null : profile.id}`, so a school counselor can view every at-risk student school-wide. |
| 2026-04-16 | (see `docs/UPDATES_2026-04-16.md`) | Credit Progress Timeline; All Students view for advisors; restored At-Risk / CTE / Audit Log / FERPA admin tabs; MTSS `school_id` note fix (1,732 notes corrected); Contact Snapshot now counts non-counselor staff. |

> When you ship a change worth remembering, add a row here (and bump
> `APP_VERSION` in `App.jsx` if user-visible).
