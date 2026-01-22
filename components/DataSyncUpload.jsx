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
    
    // Map Engage credit type codes to category names
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
      'CC': 'Higher Ed & Career Path Skills',
      'EL': 'Electives',
      'MS': null, // Middle School - don't count
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
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    
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
          c === 'student_id' || c === 'student_email' || c === 'first_name'
        ) && !columns.includes('credit_amount') && !columns.includes('credit_type');
        
        const isCourseSheet = columns.some(c => 
          c === 'class' || c === 'credit_amount' || c === 'credit_type'
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
      const advisorField = (s.advisor || s.counselor_email || '')?.trim().toLowerCase();
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
        .eq('school_id', schoolId)
        .eq('email', email)
        .single();

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
        // Insert new student
        const { data: newStudent, error } = await supabase
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
          })
          .select('id')
          .single();
        
        if (error) {
          errors.push(`Insert ${email}: ${error.message}`);
        } else {
          count++;
          studentProfileId = newStudent.id;
        }
      }

      // Store mapping from local Student_ID to profile UUID
      if (studentIdLocal && studentProfileId) {
        studentIdMap[studentIdLocal] = studentProfileId;
      }

      // Assign counselor if found
      if (studentProfileId && counselorId) {
        const { data: existingAssignment } = await supabase
          .from('counselor_assignments')
          .select('id')
          .eq('student_id', studentProfileId)
          .eq('counselor_id', counselorId)
          .single();

        if (!existingAssignment) {
          const { error: assignError } = await supabase
            .from('counselor_assignments')
            .insert({
              student_id: studentProfileId,
              counselor_id: counselorId,
              school_id: schoolId,
              assigned_by: user?.id || null,
              assigned_at: new Date().toISOString()
            });

          if (assignError && !assignError.message.includes('duplicate')) {
            errors.push(`Counselor assignment for ${email}: ${assignError.message}`);
          }
        }
      }
    }

    return { count, errors, studentIdMap };
  };

  // Sync courses from the Courses sheet
  const syncCourses = async (courses, studentIdMap = {}) => {
    const errors = [];
    let count = 0;

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

    for (const c of courses) {
      // Map Engage field names
      const studentIdLocal = (c.student_id || c['student id'])?.trim();
      const courseName = (c.class || c.course_name)?.trim();
      const creditAmount = parseFloat(c.credit_amount || c.credits || 0);
      const creditType = (c.credit_type || c.category)?.trim().toUpperCase();
      const term = (c.term || '')?.trim();
      const year = (c.year || '')?.trim();
      const finalGrade = (c.final_grade || c.grade || '')?.trim();
      const datePosted = (c.date_posted || '')?.trim();

      // Skip if missing required fields
      if (!studentIdLocal || !courseName) {
        continue;
      }

      // Skip middle school courses
      if (creditType === 'MS') {
        continue;
      }

      // Skip courses with no credit (W, I with 0 credits)
      if (creditAmount === 0 || isNaN(creditAmount)) {
        continue;
      }

      // Find student profile ID
      const studentProfileId = studentIdMap[studentIdLocal];
      if (!studentProfileId) {
        errors.push(`Course "${courseName}": Student ID ${studentIdLocal} not found`);
        continue;
      }

      // Find credit category
      const category = getCategoryByCode(creditType);
      if (!category) {
        errors.push(`Course "${courseName}": Unknown credit type "${creditType}"`);
        continue;
      }

      // Format term (e.g., "T1 25/26" or "T1")
      const termFormatted = year ? `${term} ${year}` : term;

      // Check if course already exists (same student, course name, term)
      const { data: existingCourse } = await supabase
        .from('courses')
        .select('id')
        .eq('student_id', studentProfileId)
        .eq('course_name', courseName)
        .eq('term', termFormatted)
        .single();

      if (existingCourse) {
        // Update existing course
        const { error } = await supabase
          .from('courses')
          .update({
            credits: creditAmount,
            category_id: category.id,
            grade: finalGrade,
            status: 'completed',
          })
          .eq('id', existingCourse.id);

        if (error) {
          errors.push(`Update course "${courseName}": ${error.message}`);
        } else {
          count++;
        }
      } else {
        // Insert new course
        const { error } = await supabase
          .from('courses')
          .insert({
            student_id: studentProfileId,
            school_id: schoolId,
            course_name: courseName,
            credits: creditAmount,
            category_id: category.id,
            term: termFormatted,
            grade: finalGrade,
            status: 'completed',
          });

        if (error) {
          errors.push(`Insert course "${courseName}": ${error.message}`);
        } else {
          count++;
        }
      }
    }

    return { count, errors };
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

      const allErrors = [...studentResult.errors, ...courseResult.errors];

      setUploadState(prev => ({
        ...prev,
        status: allErrors.length > 0 && (studentResult.count === 0 && courseResult.count === 0) ? 'error' : 'success',
        result: {
          studentsProcessed: studentResult.count,
          coursesProcessed: courseResult.count,
          errors: allErrors,
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
          📋 Use the <strong>GradTrack Engage Import Template</strong> with two sheets:
        </p>
        <ul className="text-slate-400 text-xs mt-1 ml-4 list-disc">
          <li><strong>Students</strong>: Student_ID, Last_Name, First_Name, Student Email, Grade, Advisor</li>
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
              <ul className="text-slate-400 text-sm mt-2">
                {uploadState.result.errors?.map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
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
