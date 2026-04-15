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
      'MS': null,
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
    const currentMonth = new Date().getMonth();
    const schoolYear = currentMonth >= 7 ? currentYear : currentYear - 1;
    const gradeNum = parseInt(grade, 10);
    if (isNaN(gradeNum) || gradeNum < 9 || gradeNum > 12) return null;
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
      if (sheetName.toLowerCase().includes('instruction') || 
          sheetName.toLowerCase().includes('credit type')) {
        continue;
      }
      
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      
      const filteredData = data.filter(row => {
        const firstValue = Object.values(row)[0]?.toString().toLowerCase() || '';
        return !firstValue.includes('required') && !firstValue.includes('optional');
      });

      const normalized = filteredData.map(row => {
        const newRow = {};
        for (const [key, value] of Object.entries(row)) {
          const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, '_');
          newRow[normalizedKey] = String(value).trim();
        }
        return newRow;
      });

      if (normalized.length > 0) {
        const columns = Object.keys(normalized[0]);
        
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
    const studentIdMap = {};

    // Get all counselors for this school
    const { data: counselors } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('school_id', schoolId)
      .in('role', ['counselor', 'case_manager']);

    const counselorEmailMap = {};
    const counselorNameMap = {};
    counselors?.forEach(c => {
      counselorEmailMap[c.email.toLowerCase()] = c.id;
      if (c.full_name) {
        counselorNameMap[c.full_name.toLowerCase()] = c.id;
      }
    });

    for (const s of students) {
      const studentIdLocal = s.student_id?.trim();
      const email = (s.student_email || s.email)?.trim().toLowerCase();
      const firstName = s.first_name?.trim();
      const lastName = s.last_name?.trim();
      const fullName = s.full_name?.trim() || `${firstName} ${lastName}`.trim();
      const grade = parseInt(s.grade, 10);
      
      let graduationYear = parseInt(s.graduation_year, 10);
      // Guard against 2-digit graduation years (e.g. "28" instead of "2028")
      // that some Engage exports produce. Without this, getGradeLevel() in
      // AdminStudentManager computes absurd grade values and returns null.
      if (!isNaN(graduationYear) && graduationYear < 100) {
        graduationYear += 2000;
      }
      if (isNaN(graduationYear) && !isNaN(grade)) {
        graduationYear = calculateGraduationYear(grade);
      }
      
      // Look up advisor/counselor — accept Advisor_Name or Advisor column
      const advisorField = (s.advisor_name || s.advisor || s.counselor_email || '')?.trim().toLowerCase();
      let counselorId = counselorEmailMap[advisorField] || counselorNameMap[advisorField] || null;

      if (!email || !fullName || fullName === ' ') {
        if (studentIdLocal) {
          errors.push(`Skipped Student_ID ${studentIdLocal}: missing email or name`);
        }
        continue;
      }

      if (grade < 9) continue;

      const diplomaType = getDefaultDiplomaType(graduationYear);
      const diplomaTypeId = diplomaType?.id || null;

      // Check if student exists by email — use maybeSingle + is_active filter
      // to avoid .single() errors when inactive duplicates exist
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
            engage_id: studentIdLocal,
          })
          .eq('id', existing.id);
        
        if (error) {
          errors.push(`Update ${email}: ${error.message}`);
        } else {
          count++;
          studentProfileId = existing.id;
        }
      } else {
        // New student — try auth signup first, but don't stop if signups are disabled
        let newUserId = null;
        const { data: authData, error: authErr } = await supabase.auth.signUp({
          email,
          password: 'GradTrack2026!',
        });

        if (authErr) {
          const msg = authErr.message.toLowerCase();
          if (msg.includes('already registered')) {
            // Auth account exists — will look up profile below
          } else if (msg.includes('signups not allowed') || msg.includes('not allowed')) {
            // Signups disabled — skip auth creation, still upsert profile
          } else {
            errors.push(`Auth signup ${email}: ${authErr.message}`);
            continue;
          }
        } else {
          newUserId = authData?.user?.id || null;
        }

        // If no auth user ID yet, look up existing profile by email
        if (!newUserId) {
          const { data: existingByEmail } = await supabase
            .from('profiles')
            .select('id')
            .ilike('email', email)
            .maybeSingle();
          newUserId = existingByEmail?.id || null;
        }

        // If still no ID, insert profile directly (signups disabled case)
        if (!newUserId) {
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
        } else {
          // Upsert profile with known ID
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
              engage_id: studentIdLocal,
              is_active: true,
            });
          if (error) {
            errors.push(`Insert ${email}: ${error.message}`);
            continue;
          }
        }

        count++;
        studentProfileId = newUserId;
      }

      // Store mapping from local Student_ID to profile UUID
      if (studentIdLocal && studentProfileId) {
        studentIdMap[studentIdLocal] = studentProfileId;
      }

      // Assign counselor — update if changed, insert if new.
      // Using .limit(1) instead of .maybeSingle() so pre-existing
      // duplicate rows don't cause an error that skips the cleanup.
      if (studentProfileId && counselorId) {
        const { data: existingRows } = await supabase
          .from('counselor_assignments')
          .select('id, counselor_id')
          .eq('student_id', studentProfileId)
          .eq('assignment_type', 'counselor')
          .limit(1);
        const existingAssignment = existingRows?.[0] || null;

        if (existingAssignment && existingAssignment.counselor_id !== counselorId) {
          // Advisor changed — delete old assignment
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
              assigned_at: new Date().toISOString(),
            });
          if (assignError && !assignError.message.includes('duplicate')) {
            errors.push(`Counselor assignment for ${email}: ${assignError.message}`);
          }
        }
      }
    }

    return { count, errors, studentIdMap };
  };

  // Sync courses from the Courses sheet.
  const syncCourses = async (courses, studentIdMap = {}) => {
    const errors = [];
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

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

    const now = new Date();
    const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    const currentYearSuffix = `${String(startYear).slice(-2)}/${String(startYear + 1).slice(-2)}`;

    const parsed = [];
    const affectedStudentIds = new Set();

    for (const c of courses) {
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

      const mapping = courseMappingMap[courseName.toLowerCase()];
      let category = getCategoryByCode(creditType);
      if (!category && mapping?.category_id) {
        category = creditCategories.find(c => c.id === mapping.category_id);
      }
      if (!category) {
        errors.push(`Course "${courseName}": Unknown credit type "${creditType}"`);
        continue;
      }

      let creditAmount = isNaN(creditAmountRaw) ? null : creditAmountRaw;
      if (
        (creditAmount == null || creditAmount === 0) &&
        !finalGrade &&
        mapping?.credits != null
      ) {
        creditAmount = Number(mapping.credits);
      }

      const hasGrade = !!finalGrade;
      const hasCredit = creditAmount != null && creditAmount > 0;
      if (!hasGrade && !hasCredit) continue;

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

    const toInsert = [];
    const toUpdate = [];

    const creditsEqual = (a, b) => {
      if (a == null && b == null) return true;
      if (a == null || b == null) return false;
      return Number(a) === Number(b);
    };

    const termOrder = (t) => {
      if (!t) return null;
      const yearMatch = t.match(/(\d{2})\/\d{2}\s*$/);
      if (!yearMatch) return null;
      const year = parseInt(yearMatch[1], 10);
      const triMatch = t.match(/^(SU|S(\d)|T(\d))/);
      let pos = 0;
      if (triMatch) {
        if (triMatch[3]) pos = parseInt(triMatch[3], 10);
        else if (triMatch[2]) pos = parseInt(triMatch[2], 10) * 2;
        else pos = 4;
      }
      return year * 10 + pos;
    };

    for (const row of parsed) {
      const strictKey = `${row.studentProfileId}|${row.courseName}|${row.termFormatted}`;
      let existing = strictIndex.get(strictKey);
      if (!existing && row.finalGrade) {
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

      if (students.length > 0) {
        studentResult = await syncStudents(students);
      }

      if (courses.length > 0) {
        courseResult = await syncCourses(courses, studentResult.studentIdMap);
      }

      let allErrors = [...studentResult.errors, ...courseResult.errors];

      // Archive students not in the import file (withdrawn students)
      // Only runs when file looks like a full export (500+ students)
      let archivedCount = 0;
      if (students.length > 500) {
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

      const hadInputRows = students.length > 0 || courses.length > 0;
      const processedNothing =
        studentResult.count === 0 &&
        courseResult.count === 0 &&
        (courseResult.skipped || 0) === 0;
      const isSilentNoOp = hadInputRows && processedNothing;

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
      
      <div className="mb-4 text-sm space-y-1">
        <div className={diplomaTypesLoaded ? 'text-emerald-400' : 'text-amber-400'}>
          {diplomaTypesLoaded ? '✓' : '⏳'} {diplomaTypes.length} diploma types {diplomaTypesLoaded ? 'loaded' : 'loading...'}
        </div>
        <div className={categoriesLoaded ? 'text-emerald-400' : 'text-amber-400'}>
          {categoriesLoaded ? '✓' : '⏳'} {creditCategories.length} credit categories {categoriesLoaded ? 'loaded' : 'loading...'}
        </div>
      </div>

      <div className="mb-4 p-3 bg-slate-700/50 rounded-lg">
        <p className="text-slate-300 text-sm">
          📋 Use the <strong>ScholarPath Graduation Progress Engage Import Template</strong> with two sheets:
        </p>
        <ul className="text-slate-400 text-xs mt-1 ml-4 list-disc">
          <li><strong>Students</strong>: Student_ID, Last_Name, First_Name, Student Email, Grade, Graduation_Year, Advisor_ID, Advisor_Name, Subprogram</li>
          <li><strong>Courses</strong>: Student ID, Class, Credit Amount, Credit Type, Term, Year, Final Grade</li>
        </ul>
      </div>
      
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

      {uploadState.status === 'uploading' && (
        <div className="mt-4 text-center py-8">
          <div className="animate-spin text-4xl mb-3">⚙️</div>
          <span className="text-slate-300">Processing your file...</span>
        </div>
      )}

      {uploadState.status === 'success' && uploadState.result && (
        <div className="mt-6 p-4 bg-emerald-900/30 border border-emerald-700 rounded-xl">
          <div className="flex items-start gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <h4 className="text-emerald-400 font-semibold">Import Complete!</h4>
              <div className="text-slate-300 text-sm mt-2 space-y-1">
                <p>✓ {uploadState.result.studentsProcessed} students processed</p>
                {uploadState.result.studentsArchived > 0 && (
                  <p>📦 {uploadState.result.studentsArchived} students archived (withdrew)</p>
                )}
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
