import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { supabase, getDiplomaTypes } from '../supabase';

export default function DataSyncUpload({ schoolId }) {
  const [uploadState, setUploadState] = useState({
    file: null,
    status: 'idle',
    result: null,
  });
  
  const [diplomaTypes, setDiplomaTypes] = useState([]);
  const [diplomaTypesLoaded, setDiplomaTypesLoaded] = useState(false);
  const [creditCategories, setCreditCategories] = useState([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  // Fetch diploma types when component loads
  useEffect(() => {
    async function loadDiplomaTypes() {
      if (schoolId) {
        const types = await getDiplomaTypes(schoolId);
        setDiplomaTypes(types);
        setDiplomaTypesLoaded(true);
      }
    }
    loadDiplomaTypes();
  }, [schoolId]);

  // Fetch credit categories when component loads
  useEffect(() => {
    async function loadCategories() {
      if (schoolId) {
        const { data } = await supabase
          .from('credit_categories')
          .select('*')
          .eq('school_id', schoolId);
        setCreditCategories(data || []);
        setCategoriesLoaded(true);
      }
    }
    loadCategories();
  }, [schoolId]);

  // Map Credit Type codes to category IDs
  const getCategoryByCode = (creditTypeCode) => {
    if (!creditTypeCode) return null;
    const code = creditTypeCode.toUpperCase().trim();
    
    // Map Engage credit type codes to credit category names. These names
    // must match the school's credit_categories.name values exactly
    // (case-insensitive). Whether a category contributes to a particular
    // student's graduation requirements is determined elsewhere via the
    // diploma_requirements override table — this map only resolves which
    // category an imported course belongs to.
    const codeToName = {
      'MA': 'Mathematics',
      'LA': 'English Language Arts',
      'SC': 'Science',
      'SS': 'Social Studies',
      'CV': 'Civics',
      'PE': 'Physical Education',
      'HE': 'Health',
      'RE': 'CTE/Art/Language',
      'PF': 'Personal Financial Education',
      'CC': 'Career & College',
      'EL': 'Electives',
      'MS': null, // Middle School — don't count toward HS credits
    };

    const categoryName = codeToName[code];
    if (!categoryName) return null;

    return creditCategories.find(c => 
      c.name?.toLowerCase() === categoryName.toLowerCase()
    );
  };

  // Determine the right diploma type for a student
  const getDefaultDiplomaType = (graduationYear) => {
    if (!diplomaTypes.length) return null;
    
    const requirementYear = graduationYear <= 2026 ? '2026' : '2027';
    
    const standardDiploma = diplomaTypes.find(d => 
      d.code?.includes('STANDARD') && d.code?.includes(requirementYear)
    );
    
    const anyMatchingDiploma = diplomaTypes.find(d => 
      d.code?.includes(requirementYear)
    );
    
    return standardDiploma || anyMatchingDiploma || diplomaTypes[0] || null;
  };

  // Calculate graduation year from grade level
  const calculateGraduationYear = (grade) => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-11
    
    // If we're in the fall (Aug-Dec), use current school year; otherwise, use previous
    const schoolYear = currentMonth >= 7 ? currentYear : currentYear - 1;
    
    const gradeNum = parseInt(grade, 10);
    if (isNaN(gradeNum) || gradeNum < 9 || gradeNum > 12) return null;
    
    // Grade 9 = 4 years to graduation, Grade 12 = 1 year
    return schoolYear + (13 - gradeNum);
  };

  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (file) {
      setUploadState({ file, status: 'idle', result: null });
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const parseExcel = async (file) => {
    let workbook;
    if (file.name.toLowerCase().endsWith('.csv')) {
      // Read CSV as text and normalize line endings before parsing.
      // SheetJS can usually handle CR/LF/CRLF, but some Engage exports come
      // with classic Mac CR-only terminators that have caused silent failures.
      const text = await file.text();
      const normalized = text.replace(/\r\n?/g, '\n');
      workbook = XLSX.read(normalized, { type: 'string' });
    } else {
      const buffer = await file.arrayBuffer();
      workbook = XLSX.read(buffer, { type: 'array' });
    }
    
    let students = [];
    let courses = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      // Skip instruction/reference sheets
      if (sheetName.toLowerCase().includes('instruction') || 
          sheetName.toLowerCase().includes('credit type')) {
        continue;
      }
      
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      
      // Skip header description row (row 2 in template)
      const filteredData = data.filter(row => {
        const firstValue = Object.values(row)[0]?.toString().toLowerCase() || '';
        return !firstValue.includes('required') && !firstValue.includes('optional');
      });

      const normalized = filteredData.map(row => {
        const newRow = {};
        for (const [key, value] of Object.entries(row)) {
          // Normalize column names: lowercase, trim, replace spaces with underscores
          const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, '_');
          newRow[normalizedKey] = String(value).trim();
        }
        return newRow;
      });

      if (normalized.length > 0) {
        const columns = Object.keys(normalized[0]);
        
        // Detect sheet type by column names
        const isStudentSheet = columns.some(c => 
          c === 'student_email' || c === 'first_name'
        ) && !columns.includes('credit_amount') && !columns.includes('credit_type');
        
        const isCourseSheet = columns.some(c => 
  c === 'class' || c === 'class_name' || c === 'credit_amount' || c === 'credit_type'
);

        if (sheetName.toLowerCase() === 'students' || isStudentSheet) {
          students = normalized;
        } else if (sheetName.toLowerCase() === 'courses' || isCourseSheet) {
          courses = normalized;
        }
      }
    }

    return { students, courses };
  };

  // Sync students from the Students sheet
  const syncStudents = async (students) => {
    const errors = [];
    let count = 0;
    const studentIdMap = {}; // Maps Student_ID to profile UUID

    // Get all counselors for this school
    const { data: counselors } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('school_id', schoolId)
      .eq('role', 'counselor');

    // Create maps for counselor lookup (by email and by name)
    const counselorEmailMap = {};
    const counselorNameMap = {};
    counselors?.forEach(c => {
      counselorEmailMap[c.email.toLowerCase()] = c.id;
      if (c.full_name) {
        counselorNameMap[c.full_name.toLowerCase()] = c.id;
      }
    });

    const { data: { user } } = await supabase.auth.getUser();

    for (const s of students) {
      // Map Engage field names to our fields
      const studentIdLocal = s.student_id?.trim();
      const email = (s.student_email || s.email)?.trim().toLowerCase();
      const firstName = s.first_name?.trim();
      const lastName = s.last_name?.trim();
      const fullName = s.full_name?.trim() || `${firstName} ${lastName}`.trim();
      const grade = parseInt(s.grade, 10);
      
      // Calculate graduation year if not provided
      let graduationYear = parseInt(s.graduation_year, 10);
      if (isNaN(graduationYear) && !isNaN(grade)) {
        graduationYear = calculateGraduationYear(grade);
      }
      
      // Look up advisor/counselor (can be email or name)
      const advisorField = (s.advisor_name || s.advisor || s.counselor_email || '')?.trim().toLowerCase();
      let counselorId = counselorEmailMap[advisorField] || counselorNameMap[advisorField] || null;

      // Skip rows without required fields
      if (!email || !fullName || fullName === ' ') {
        if (studentIdLocal) {
          errors.push(`Skipped Student_ID ${studentIdLocal}: missing email or name`);
        }
        continue;
      }

      // Skip middle school students (grades below 9)
      if (grade < 9) {
        continue;
      }

      // Determine diploma type
      const diplomaType = getDefaultDiplomaType(graduationYear);
      const diplomaTypeId = diplomaType?.id || null;

      // Check if student exists (by email)
      const { data: existing } = await supabase
  .from('profiles')
  .select('id')
  .ilike('email', email)
  .eq('school_id', schoolId)
  .eq('is_active', true)
  .maybeSingle();

      let studentProfileId = existing?.id;

      if (existing) {
        // Update existing student
        const { error } = await supabase
          .from('profiles')
          .update({ 
            full_name: fullName, 
            grade, 
            graduation_year: graduationYear,
            diploma_type_id: diplomaTypeId,
            student_id_local: studentIdLocal,
          })
          .eq('id', existing.id);
        
        if (error) {
          errors.push(`Update ${email}: ${error.message}`);
        } else {
          count++;
          studentProfileId = existing.id;
        }
      } else {
        // Insert new student. First create an auth account (with the
        // shared default password) so the student can log in to view
        // their own progress, then upsert the profile keyed to the new
        // auth user id. Mirrors the legacy App.jsx Excel-import behavior
        // so we don't change the experience for new students.
        let newUserId = null;
        const { data: authData, error: authErr } = await supabase.auth.signUp({
          email,
          password: 'GradTrack2026!',
        });
        if (authErr) {
  const msg = authErr.message.toLowerCase();
  if (msg.includes('already registered')) {
    // fine — will look up existing profile below
  } else if (msg.includes('signups not allowed') || msg.includes('not allowed')) {
    // signups disabled — skip auth creation but still upsert profile
  } else {
    errors.push(`Auth signup ${email}: ${authErr.message}`);
    continue;
  }
}
        newUserId = authData?.user?.id || null;

        // Edge case: auth account already existed (e.g. cross-school move)
        // but we couldn't find a profile in this school. Look up the
        // existing profile by email regardless of school so we can adopt
        // the same id and upsert against it.
        if (!newUserId) {
          const { data: existingByEmail } = await supabase
            .from('profiles')
            .select('id')
            .ilike('email', email)
            .maybeSingle();
          newUserId = existingByEmail?.id || null;
        }

        if (!newUserId) {
  // No auth account and signups disabled — insert profile directly with a generated ID
  const { data: newProfile, error: insertErr } = await supabase
    .from('profiles')
    .insert({
      school_id: schoolId,
      email,
      full_name: fullName,
      grade,
      graduation_year: graduationYear,
      role: 'student',
      diploma_type_id: diplomaTypeId,
      student_id_local: studentIdLocal,
      engage_id: studentIdLocal,
      is_active: true,
    })
    .select('id')
    .single();
  if (insertErr || !newProfile) {
    errors.push(`Insert ${email}: could not create profile`);
    continue;
  }
  newUserId = newProfile.id;
}

        const { error } = await supabase
          .from('profiles')
          .upsert({
            id: newUserId,
            school_id: schoolId,
            email,
            full_name: fullName,
            grade,
            graduation_year: graduationYear,
            role: 'student',
            diploma_type_id: diplomaTypeId,
            student_id_local: studentIdLocal,
            is_active: true,
          });

        if (error) {
          errors.push(`Insert ${email}: ${error.message}`);
        } else {
          count++;
          studentProfileId = newUserId;
        }
      }

      // Store mapping from local Student_ID to profile UUID
      if (studentIdLocal && studentProfileId) {
        studentIdMap[studentIdLocal] = studentProfileId;
      }

     // Assign counselor if found — delete old assignment first, then insert new one
if (studentProfileId && counselorId) {
  const { data: existingAssignment } = await supabase
    .from('counselor_assignments')
    .select('id, counselor_id')
    .eq('student_id', studentProfileId)
    .eq('assignment_type', 'counselor')
    .maybeSingle();

  if (existingAssignment && existingAssignment.counselor_id !== counselorId) {
    // Student changed advisors — delete old assignment
    await supabase
      .from('counselor_assignments')
      .delete()
      .eq('id', existingAssignment.id);
  }

  if (!existingAssignment || existingAssignment.counselor_id !== counselorId) {
    // Insert new assignment
    const { error: assignError } = await supabase
      .from('counselor_assignments')
      .insert({
        student_id: studentProfileId,
        counselor_id: counselorId,
        school_id: schoolId,
        assignment_type: 'counselor',
        assigned_by: null,
        assigned_at: new Date().toISOString()
      });
    if (assignError && !assignError.message.includes('duplicate')) {
      errors.push(`Counselor assignment for ${email}: ${assignError.message}`);
    }
  }
}

    return { count, errors, studentIdMap };
  };

  // Sync courses from the Courses sheet.
  // Optimized for large files (25k+ rows): pre-fetches all relevant existing
  // course rows in batched queries, builds in-memory indexes for dedup,
  // skips no-op updates, then bulk-inserts new rows and runs updates in
  // small parallel batches. A naive per-row implementation against Supabase
  // takes hours for a typical Engage export; this finishes in ~1 minute.
  const syncCourses = async (courses, studentIdMap = {}) => {
    const errors = [];
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    // Build a map of student_id_local to profile id if not provided
    if (Object.keys(studentIdMap).length === 0) {
      const { data: students } = await supabase
        .from('profiles')
        .select('id, student_id_local')
        .eq('school_id', schoolId)
        .eq('role', 'student')
        .not('student_id_local', 'is', null);

      students?.forEach(s => {
        if (s.student_id_local) {
          studentIdMap[s.student_id_local] = s.id;
        }
      });
    }

    // Load all course mappings upfront. We fetch BOTH the category_id and
    // the credits column — current-courses files from Engage have no
    // credit_amount column at all, so credits must come from the mapping
    // table or the course will land in the database with credits=0.
    const { data: courseMappings } = await supabase
      .from('course_mappings')
      .select('course_name, category_id, credits')
      .eq('school_id', schoolId);

    const courseMappingMap = {};
    courseMappings?.forEach(m => {
      courseMappingMap[m.course_name.toLowerCase()] = {
        category_id: m.category_id,
        credits: m.credits,
      };
    });

    // Compute the current school-year suffix (e.g. "25/26") to fill in
    // for source rows that have a term ("T3") but no year column.
    const now = new Date();
    const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    const currentYearSuffix = `${String(startYear).slice(-2)}/${String(startYear + 1).slice(-2)}`;

    // ── Pass 1: Parse and validate each input row ──
    // Produces a list of fully-resolved rows ready to compare against the
    // database. Skipped rows (missing student, MS courses, etc.) get
    // recorded here once and never touched again.
    const parsed = [];
    const affectedStudentIds = new Set();

    for (const c of courses) {
      // Map Engage field names. Note `credit_ammount` is the (typo'd) header
      // some Engage exports actually ship with — accept both spellings.
      const studentIdLocal = (c.student_id || c['student id'])?.trim();
      const courseName = (c.class || c.class_name || c.course_name)?.trim();
      const creditAmountRaw = parseFloat(c.credit_ammount || c.credit_amount || c.credits || 0);
      const creditType = (c.credit_type || c.category)?.trim().toUpperCase();
      const term = (c.term || '')?.trim();
      const year = (c.year || '')?.trim();
      const finalGrade = (c.final_grade || c.grade || '')?.trim();

      if (!studentIdLocal || !courseName) continue;
      if (creditType === 'MS') continue;

      const studentProfileId = studentIdMap[studentIdLocal];
      if (!studentProfileId) {
        errors.push(`Course "${courseName}": Student ID ${studentIdLocal} not found`);
        continue;
      }

      // Resolve category. First try the row's credit_type code, then fall
      // back to the school's course_mappings table by course name.
      const mapping = courseMappingMap[courseName.toLowerCase()];
      let category = getCategoryByCode(creditType);
      if (!category && mapping?.category_id) {
        category = creditCategories.find(c => c.id === mapping.category_id);
      }
      if (!category) {
        errors.push(`Course "${courseName}": Unknown credit type "${creditType}"`);
        continue;
      }

      // Resolve credit amount. Source row first, then course_mappings
      // fallback. Current-courses Engage exports have no credit column at
      // all, so the mapping fallback is what populates credits for them.
      //
      // IMPORTANT: only fall back to mapping credits when the row has NO
      // grade. A graded row with credit=0 means "graded outcome with no
      // credit earned" (Incomplete, Fail) — that 0 is intentional and
      // overriding it from the mapping would inflate the student's earned
      // credit total.
      let creditAmount = isNaN(creditAmountRaw) ? null : creditAmountRaw;
      if (
        (creditAmount == null || creditAmount === 0) &&
        !finalGrade &&
        mapping?.credits != null
      ) {
        creditAmount = Number(mapping.credits);
      }

      // Skip truly empty rows: no grade AND no credit (after mapping
      // fallback). A row with grade='I' and credit=0 (Incomplete) is NOT
      // empty — it's a real outcome we want in the student's history.
      const hasGrade = !!finalGrade;
      const hasCredit = creditAmount != null && creditAmount > 0;
      if (!hasGrade && !hasCredit) continue;

      // Format term. If the source row has a term but no year column,
      // assume the current school year (e.g. "T3" -> "T3 25/26").
      let termFormatted;
      if (term && year) termFormatted = `${term} ${year}`;
      else if (term) termFormatted = `${term} ${currentYearSuffix}`;
      else termFormatted = '';

      const status = finalGrade ? 'completed' : 'in_progress';

      parsed.push({
        studentProfileId,
        courseName,
        creditAmount,
        categoryId: category.id,
        termFormatted,
        finalGrade: finalGrade || null,
        status,
      });
      affectedStudentIds.add(studentProfileId);
    }

    // ── Pass 2: Bulk pre-fetch existing courses for affected students ──
    // One query per ~50 students. Much faster than one query per row.
    const studentIdArray = [...affectedStudentIds];
    const allExisting = [];
    const FETCH_BATCH = 50;
    for (let i = 0; i < studentIdArray.length; i += FETCH_BATCH) {
      const batch = studentIdArray.slice(i, i + FETCH_BATCH);
      const { data, error } = await supabase
        .from('courses')
        .select('id, student_id, name, term, status, credits, category_id, grade, created_at')
        .in('student_id', batch);
      if (error) {
        errors.push(`Failed to fetch existing courses: ${error.message}`);
        return { count: inserted + updated, errors };
      }
      if (data) allExisting.push(...data);
    }

    // ── Pass 3: Build lookup indexes ──
    // strictIndex: (student|name|term) -> existing row, used as the primary
    //   match for normal same-term reconciliation.
    // inProgressIndex: (student|name) -> oldest in_progress row, used as a
    //   fallback so an asynch course finished in a later term still updates
    //   the original placeholder instead of creating a duplicate.
    const strictIndex = new Map();
    const inProgressIndex = new Map();
    for (const c of allExisting) {
      strictIndex.set(`${c.student_id}|${c.name}|${c.term}`, c);
      if (c.status === 'in_progress') {
        const key = `${c.student_id}|${c.name}`;
        const existing = inProgressIndex.get(key);
        if (!existing || new Date(c.created_at) < new Date(existing.created_at)) {
          inProgressIndex.set(key, c);
        }
      }
    }

    // ── Pass 4: Decide each row's fate locally (zero DB queries) ──
    const toInsert = [];
    const toUpdate = [];

    const creditsEqual = (a, b) => {
      if (a == null && b == null) return true;
      if (a == null || b == null) return false;
      return Number(a) === Number(b);
    };

    // Convert a term string like "T1 25/26", "T3 24/25", "SU 24/25" into a
    // sortable numeric value so we can compare which term came earlier.
    // Returns null for unparseable terms (in which case the asynch fallback
    // will be skipped to avoid wrong-row matches).
    const termOrder = (t) => {
      if (!t) return null;
      const yearMatch = t.match(/(\d{2})\/\d{2}\s*$/);
      if (!yearMatch) return null;
      const year = parseInt(yearMatch[1], 10);
      const triMatch = t.match(/^(SU|S(\d)|T(\d))/);
      let pos = 0;
      if (triMatch) {
        if (triMatch[3]) pos = parseInt(triMatch[3], 10);          // T1=1, T2=2, T3=3
        else if (triMatch[2]) pos = parseInt(triMatch[2], 10) * 2; // S1=2, S2=4
        else pos = 4; // SU (after T3 but before next year's T1)
      }
      return year * 10 + pos;
    };

    for (const row of parsed) {
      const strictKey = `${row.studentProfileId}|${row.courseName}|${row.termFormatted}`;
      let existing = strictIndex.get(strictKey);
      if (!existing && row.finalGrade) {
        // Asynch fallback: only match an in_progress row whose term is
        // EARLIER THAN OR EQUAL TO the new grade's term. The whole point
        // of the fallback is "course started earlier, finished later" —
        // matching a LATER in_progress row to satisfy an EARLIER grade
        // is the retake case (e.g. student got Incomplete in T2, is
        // currently retaking in T3) and would silently destroy the
        // current attempt's row.
        const candidate = inProgressIndex.get(
          `${row.studentProfileId}|${row.courseName}`
        );
        if (candidate) {
          const candidateOrder = termOrder(candidate.term);
          const newOrder = termOrder(row.termFormatted);
          if (
            candidateOrder != null &&
            newOrder != null &&
            candidateOrder <= newOrder
          ) {
            existing = candidate;
          }
        }
      }

      if (existing) {
        // No-op skip: if every relevant field already matches, don't issue
        // an UPDATE. For weekly re-uploads of mostly-unchanged data this
        // turns thousands of pointless writes into zero work.
        const isUnchanged =
          existing.term === row.termFormatted &&
          creditsEqual(existing.credits, row.creditAmount) &&
          existing.category_id === row.categoryId &&
          (existing.grade || null) === row.finalGrade &&
          existing.status === row.status;

        if (isUnchanged) {
          skipped++;
          continue;
        }

        toUpdate.push({
          id: existing.id,
          credits: row.creditAmount,
          category_id: row.categoryId,
          term: row.termFormatted,
          grade: row.finalGrade,
          status: row.status,
        });
      } else {
        toInsert.push({
          student_id: row.studentProfileId,
          name: row.courseName,
          credits: row.creditAmount,
          category_id: row.categoryId,
          term: row.termFormatted,
          grade: row.finalGrade,
          status: row.status,
        });
      }
    }

    // ── Pass 5: Bulk insert new rows ──
    const INSERT_BATCH = 500;
    for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
      const batch = toInsert.slice(i, i + INSERT_BATCH);
      const { error } = await supabase.from('courses').insert(batch);
      if (error) {
        errors.push(`Bulk insert failed (rows ${i}–${i + batch.length}): ${error.message}`);
      } else {
        inserted += batch.length;
      }
    }

    // ── Pass 6: Run updates in small parallel batches ──
    // Parallelism is bounded so we don't open hundreds of simultaneous
    // PostgREST connections. 10 in flight is a safe sweet spot.
    const UPDATE_PARALLEL = 10;
    for (let i = 0; i < toUpdate.length; i += UPDATE_PARALLEL) {
      const batch = toUpdate.slice(i, i + UPDATE_PARALLEL);
      const results = await Promise.all(
        batch.map(({ id, ...fields }) =>
          supabase.from('courses').update(fields).eq('id', id)
        )
      );
      for (let j = 0; j < results.length; j++) {
        if (results[j].error) {
          errors.push(`Update failed for row ${batch[j].id}: ${results[j].error.message}`);
        } else {
          updated++;
        }
      }
    }

    return { count: inserted + updated, errors, inserted, updated, skipped };
  };

  const handleUpload = async () => {
    if (!uploadState.file) return;
    
    if (!diplomaTypesLoaded || !categoriesLoaded) {
      setUploadState(prev => ({
        ...prev,
        status: 'error',
        result: { errors: ['Still loading configuration. Please wait and try again.'] },
      }));
      return;
    }

    setUploadState(prev => ({ ...prev, status: 'uploading' }));

    try {
      const { students, courses } = await parseExcel(uploadState.file);
      
      let studentResult = { count: 0, errors: [], studentIdMap: {} };
      let courseResult = { count: 0, errors: [] };

      // Sync students first
      if (students.length > 0) {
        studentResult = await syncStudents(students);
      }

      // Then sync courses (passing the student ID map)
      if (courses.length > 0) {
        courseResult = await syncCourses(courses, studentResult.studentIdMap);
      }

      let allErrors = [...studentResult.errors, ...courseResult.errors];
      
      // A file with rows but zero processed AND zero skipped is almost
      // always a silent failure (header mismatch, wrong column names,
      // missing categories). "Skipped" rows are intentional no-ops from
      // the new import path — those should NOT count as a silent failure.
      const hadInputRows = students.length > 0 || courses.length > 0;
      const processedNothing =
        studentResult.count === 0 &&
        courseResult.count === 0 &&
        (courseResult.skipped || 0) === 0;
      const isSilentNoOp = hadInputRows && processedNothing;

      // Archive students not in the import file (they have withdrawn)
let archivedCount = 0;
if (students.length > 500) {
  // Only run archive logic if this looks like a full student export (not partial)
  const importedEngageIds = new Set(
    students.map(s => s.student_id?.toString().trim()).filter(Boolean)
  );
  const importedEmails = new Set(
    students.map(s => s.student_email?.trim().toLowerCase()).filter(Boolean)
  );

  const { data: activeStudents } = await supabase
    .from('profiles')
    .select('id, email, engage_id, full_name')
    .eq('school_id', schoolId)
    .eq('role', 'student')
    .eq('is_active', true);

  const toArchive = (activeStudents || []).filter(s => {
    const inByEngageId = s.engage_id && importedEngageIds.has(s.engage_id.toString().trim());
    const inByEmail = s.email && importedEmails.has(s.email.toLowerCase());
    return !inByEngageId && !inByEmail;
  });

  for (const s of toArchive) {
    await supabase
      .from('profiles')
      .update({
        is_active: false,
        withdrawal_date: new Date().toISOString().split('T')[0],
      })
      .eq('id', s.id);
    archivedCount++;
    allErrors.push(`Archived (withdrew): ${s.full_name} (${s.email})`);
  }
}
      
      setUploadState(prev => ({
        ...prev,
        status: (allErrors.length > 0 && processedNothing) || isSilentNoOp ? 'error' : 'success',
        result: {
          studentsProcessed: studentResult.count,
          studentsArchived: archivedCount,
          coursesProcessed: courseResult.count,
          coursesInserted: courseResult.inserted || 0,
          coursesUpdated: courseResult.updated || 0,
          coursesSkipped: courseResult.skipped || 0,
          studentRowsInFile: students.length,
          courseRowsInFile: courses.length,
          errors: allErrors,
          silentNoOp: isSilentNoOp,
        },
      }));
    } catch (error) {
      setUploadState(prev => ({
        ...prev,
        status: 'error',
        result: { errors: [error.message] },
      }));
    }
  };

  const resetUpload = () => {
    setUploadState({ file: null, status: 'idle', result: null });
  };

  const isReady = diplomaTypesLoaded && categoriesLoaded;

  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
      <h3 className="text-lg font-semibold text-white mb-4">📤 Data Sync Upload</h3>
      
      {/* Status indicators */}
      <div className="mb-4 text-sm space-y-1">
        <div className={diplomaTypesLoaded ? 'text-emerald-400' : 'text-amber-400'}>
          {diplomaTypesLoaded ? '✓' : '⏳'} {diplomaTypes.length} diploma types {diplomaTypesLoaded ? 'loaded' : 'loading...'}
        </div>
        <div className={categoriesLoaded ? 'text-emerald-400' : 'text-amber-400'}>
          {categoriesLoaded ? '✓' : '⏳'} {creditCategories.length} credit categories {categoriesLoaded ? 'loaded' : 'loading...'}
        </div>
      </div>

      {/* Template download link */}
      <div className="mb-4 p-3 bg-slate-700/50 rounded-lg">
        <p className="text-slate-300 text-sm">
          📋 Use the <strong>ScholarPath Graduation Progress Engage Import Template</strong> with two sheets:
        </p>
        <ul className="text-slate-400 text-xs mt-1 ml-4 list-disc">
          <li><strong>Students</strong>: Student_ID, Last_Name, First_Name, Student Email, Grade, Graduation_Year, Advisor_ID, Advisor_Name, Subprogram</li>
          <li><strong>Courses</strong>: Student ID, Class, Credit Amount, Credit Type, Term, Year, Final Grade</li>
        </ul>
      </div>
      
      {/* Dropzone */}
      {uploadState.status === 'idle' && (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-indigo-500 bg-indigo-500/10'
              : 'border-slate-600 hover:border-slate-500'
          }`}
        >
          <input {...getInputProps()} />
          <div className="text-4xl mb-3">📁</div>
          {isDragActive ? (
            <p className="text-indigo-400">Drop your file here...</p>
          ) : (
            <>
              <p className="text-slate-300">Drag & drop an Excel file here</p>
              <p className="text-slate-500 text-sm mt-1">or click to browse</p>
            </>
          )}
        </div>
      )}

      {/* File selected */}
      {uploadState.file && uploadState.status === 'idle' && (
        <div className="mt-4">
          <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg">
            <span className="text-2xl">📄</span>
            <div className="flex-1">
              <p className="text-white font-medium">{uploadState.file.name}</p>
              <p className="text-slate-400 text-sm">
                {(uploadState.file.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              onClick={resetUpload}
              className="text-slate-400 hover:text-red-400 transition-colors"
            >
              ✕
            </button>
          </div>
          <button
            onClick={handleUpload}
            disabled={!isReady}
            className="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {isReady ? '🚀 Start Import' : '⏳ Loading...'}
          </button>
        </div>
      )}

      {/* Uploading */}
      {uploadState.status === 'uploading' && (
        <div className="mt-4 text-center py-8">
          <div className="animate-spin text-4xl mb-3">⚙️</div>
          <span className="text-slate-300">Processing your file...</span>
        </div>
      )}

      {/* Success */}
      {uploadState.status === 'success' && uploadState.result && (
        <div className="mt-6 p-4 bg-emerald-900/30 border border-emerald-700 rounded-xl">
          <div className="flex items-start gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <h4 className="text-emerald-400 font-semibold">Import Complete!</h4>
              <div className="text-slate-300 text-sm mt-2 space-y-1">
                <p>✓ {uploadState.result.studentsProcessed} students processed</p>
                <p>✓ {uploadState.result.coursesProcessed} course records processed</p>
                {(uploadState.result.coursesInserted > 0 ||
                  uploadState.result.coursesUpdated > 0 ||
                  uploadState.result.coursesSkipped > 0) && (
                  <p className="text-slate-400 text-xs ml-3">
                    ({uploadState.result.coursesInserted} new, {uploadState.result.coursesUpdated} updated,
                    {' '}{uploadState.result.coursesSkipped} unchanged)
                  </p>
                )}
              </div>
              {uploadState.result.errors?.length > 0 && (
                <div className="mt-3 p-2 bg-amber-900/30 rounded border border-amber-700">
                  <p className="text-amber-400 text-sm font-medium">⚠️ {uploadState.result.errors.length} warnings:</p>
                  <ul className="text-slate-400 text-xs mt-1 max-h-32 overflow-y-auto">
                    {uploadState.result.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                    {uploadState.result.errors.length > 10 && (
                      <li>• ...and {uploadState.result.errors.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}
              <button
                onClick={resetUpload}
                className="mt-3 text-sm text-emerald-400 hover:text-emerald-300 underline"
              >
                Upload another file
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {uploadState.status === 'error' && uploadState.result && (
        <div className="mt-6 p-4 bg-red-900/30 border border-red-700 rounded-xl">
          <div className="flex items-start gap-3">
            <span className="text-2xl">❌</span>
            <div>
              <h4 className="text-red-400 font-semibold">Import Failed</h4>
              {uploadState.result.silentNoOp && (
                <p className="text-amber-300 text-sm mt-2">
                  The file had {uploadState.result.studentRowsInFile} student row(s) and{' '}
                  {uploadState.result.courseRowsInFile} course row(s), but none were processed.
                  This usually means a column header doesn't match the expected names
                  (Student ID, Class, Credit_Ammount/Credit_Amount, Credit_Type, Term, Year, Final_Grade)
                  or that no rows had a recognized credit type code.
                </p>
              )}
              <ul className="text-slate-400 text-sm mt-2 max-h-40 overflow-y-auto">
                {uploadState.result.errors?.slice(0, 20).map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
                {uploadState.result.errors?.length > 20 && (
                  <li>• ...and {uploadState.result.errors.length - 20} more</li>
                )}
              </ul>
              <button
                onClick={resetUpload}
                className="mt-3 text-sm text-red-400 hover:text-red-300 underline"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
