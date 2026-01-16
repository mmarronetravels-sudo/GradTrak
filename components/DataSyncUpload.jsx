import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase';

export default function DataSyncUpload({ schoolId }) {
  const [uploadState, setUploadState] = useState({
    file: null,
    status: 'idle',
    result: null,
  });

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
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      
      const normalized = data.map(row => {
        const newRow = {};
        for (const [key, value] of Object.entries(row)) {
          newRow[key.toLowerCase().trim().replace(/\s+/g, '_')] = String(value);
        }
        return newRow;
      });

      if (normalized.length > 0) {
        const columns = Object.keys(normalized[0]);
        if (columns.includes('student_email') || columns.includes('course_name')) {
          courses = normalized;
        } else if (columns.includes('email') || columns.includes('full_name')) {
          students = normalized;
        }
      }
    }

    return { students, courses };
  };

  const syncStudents = async (students) => {
    const errors = [];
    let count = 0;

    for (const s of students) {
      const email = s.email?.trim().toLowerCase();
      const fullName = s.full_name?.trim();
      const grade = parseInt(s.grade, 10);
      const graduationYear = parseInt(s.graduation_year, 10);

      if (!email || !fullName) continue;

      // Check if student exists
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('school_id', schoolId)
        .eq('email', email)
        .single();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('profiles')
          .update({ full_name: fullName, grade, graduation_year: graduationYear })
          .eq('id', existing.id);
        
        if (error) errors.push(`Update ${email}: ${error.message}`);
        else count++;
      } else {
        // Insert new student
        const { error } = await supabase
          .from('profiles')
          .insert({
            school_id: schoolId,
            email,
            full_name: fullName,
            grade,
            graduation_year: graduationYear,
            role: 'student'
          });
        
        if (error) errors.push(`Insert ${email}: ${error.message}`);
        else count++;
      }
    }

    return { count, errors };
  };

  const syncCourses = async (courses) => {
    const errors = [];
    let count = 0;

    // Get all categories for this school to map names to IDs
    const { data: categories } = await supabase
      .from('credit_categories')
      .select('id, name')
      .eq('school_id', schoolId);

    const categoryMap = {};
    categories?.forEach(c => {
      categoryMap[c.name.toLowerCase()] = c.id;
    });

    // Get all student profiles to map emails to IDs
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('school_id', schoolId);

    const studentMap = {};
    profiles?.forEach(p => {
      studentMap[p.email.toLowerCase()] = p.id;
    });

    for (const c of courses) {
      const studentEmail = c.student_email?.trim().toLowerCase();
      const courseName = c.course_name?.trim();
      const credits = parseFloat(c.credits);
      const category = c.category?.trim().toLowerCase();
      const term = c.term?.trim();
      const grade = c.grade?.trim() || null;
      const isDualCredit = ['yes', 'true', '1'].includes(c.is_dual_credit?.toLowerCase() || '');
      const dualCreditType = c.dual_credit_type?.trim() || null;

      if (!studentEmail || !courseName) continue;

      const studentId = studentMap[studentEmail];
      const categoryId = categoryMap[category];

      if (!studentId) {
        errors.push(`Student not found: ${studentEmail}`);
        continue;
      }

      if (!categoryId) {
        errors.push(`Category not found: ${c.category}`);
        continue;
      }

      // Check if course already exists for this student/term
      const { data: existing } = await supabase
        .from('courses')
        .select('id')
        .eq('student_id', studentId)
        .eq('name', courseName)
        .eq('term', term)
        .single();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('courses')
          .update({
            category_id: categoryId,
            credits,
            grade,
            is_dual_credit: isDualCredit,
            dual_credit_type: dualCreditType
          })
          .eq('id', existing.id);
        
        if (error) errors.push(`Update course ${courseName}: ${error.message}`);
        else count++;
      } else {
        // Insert new
        const { error } = await supabase
          .from('courses')
          .insert({
            student_id: studentId,
            name: courseName,
            category_id: categoryId,
            credits,
            term,
            grade,
            is_dual_credit: isDualCredit,
            dual_credit_type: dualCreditType
          });
        
        if (error) errors.push(`Insert course ${courseName}: ${error.message}`);
        else count++;
      }
    }

    return { count, errors };
  };

  const handleUpload = async () => {
    if (!uploadState.file) return;

    setUploadState(prev => ({ ...prev, status: 'uploading' }));

    try {
      const { students, courses } = await parseExcel(uploadState.file);
      
      let studentResult = { count: 0, errors: [] };
      let courseResult = { count: 0, errors: [] };

      // Sync students first (so they exist for course sync)
      if (students.length > 0) {
        studentResult = await syncStudents(students);
      }

      // Then sync courses
      if (courses.length > 0) {
        courseResult = await syncCourses(courses);
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

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Import Student Data</h2>
        <p className="text-slate-400">
          Upload a CSV or Excel file exported from Engage to sync student and course data.
        </p>
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
          ${isDragActive ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-600 hover:border-slate-500 bg-slate-800/50'}
          ${uploadState.file ? 'border-indigo-500' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        {uploadState.file ? (
          <div className="flex flex-col items-center">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-white font-medium">{uploadState.file.name}</p>
            <p className="text-slate-400 text-sm mt-1">
              {(uploadState.file.size / 1024).toFixed(1)} KB
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); resetUpload(); }}
              className="mt-3 text-sm text-slate-400 hover:text-white underline"
            >
              Choose different file
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="text-4xl mb-3">📁</div>
            <p className="text-white font-medium">
              {isDragActive ? 'Drop your file here' : 'Drag & drop your file here'}
            </p>
            <p className="text-slate-400 text-sm mt-1">or click to browse</p>
            <p className="text-slate-500 text-xs mt-3">Supports CSV and Excel files up to 10MB</p>
          </div>
        )}
      </div>

      {/* Format Info */}
      <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
        <h4 className="text-sm font-medium text-slate-300 mb-2">📋 Expected File Format</h4>
        <div className="text-xs text-slate-400 space-y-1">
          <p><strong className="text-slate-300">Students:</strong> email, full_name, grade, graduation_year</p>
          <p><strong className="text-slate-300">Courses:</strong> student_email, course_name, credits, category, term, grade, is_dual_credit, dual_credit_type</p>
        </div>
      </div>

      {/* Upload Button */}
      {uploadState.file && uploadState.status === 'idle' && (
        <button
          onClick={handleUpload}
          className="mt-6 w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl transition-all duration-200"
        >
          Sync Data
        </button>
      )}

      {/* Loading */}
      {uploadState.status === 'uploading' && (
        <div className="mt-6 p-4 bg-slate-800 rounded-xl flex items-center justify-center gap-3">
          <div className="animate-spin h-5 w-5 border-2 border-indigo-400 border-t-transparent rounded-full"></div>
          <span className="text-slate-300">Processing your file...</span>
        </div>
      )}

      {/* Success */}
      {uploadState.status === 'success' && uploadState.result && (
        <div className="mt-6 p-4 bg-emerald-900/30 border border-emerald-700 rounded-xl">
          <div className="flex items-start gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <h4 className="text-emerald-400 font-semibold">Sync Complete!</h4>
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
              <button onClick={resetUpload} className="mt-3 text-sm text-emerald-400 hover:text-emerald-300 underline">
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
              <h4 className="text-red-400 font-semibold">Sync Failed</h4>
              {uploadState.result.errors?.map((err, i) => (
                <p key={i} className="text-slate-300 text-sm mt-1">{err}</p>
              ))}
              <button onClick={resetUpload} className="mt-3 text-sm text-red-400 hover:text-red-300 underline">
                Try again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}