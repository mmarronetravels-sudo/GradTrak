import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase';

export default function DataSyncUpload({ schoolId }) {
  const [uploadState, setUploadState] = useState({
    file: null,
    status: 'idle', // idle, uploading, success, error
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
    const records = students.map(s => ({
      school_id: schoolId,
      email: s.email?.trim().toLowerCase(),
      full_name: s.full_name?.trim(),
      grade: parseInt(s.grade, 10),
      graduation_year: parseInt(s.graduation_year, 10),
    })).filter(s => s.email && s.full_name);

    if (records.length === 0) return { count: 0, errors: [] };

    const { error } = await supabase
      .from('students')
      .upsert(records, { onConflict: 'school_id,email' });

    if (error) {
      return { count: 0, errors: [error.message] };
    }
    return { count: records.length, errors: [] };
  };

  const syncCourses = async (courses) => {
    const records = courses.map(c => ({
      school_id: schoolId,
      student_email: c.student_email?.trim().toLowerCase(),
      course_name: c.course_name?.trim(),
      credits: parseFloat(c.credits),
      category: c.category?.trim(),
      term: c.term?.trim(),
      grade: c.grade?.trim() || null,
      is_dual_credit: ['yes', 'true', '1'].includes(c.is_dual_credit?.toLowerCase() || ''),
      dual_credit_type: c.dual_credit_type?.trim() || null,
    })).filter(c => c.student_email && c.course_name && c.category);

    if (records.length === 0) return { count: 0, errors: [] };

    const { error } = await supabase
      .from('student_courses')
      .upsert(records, { onConflict: 'school_id,student_email,course_name,term' });

    if (error) {
      return { count: 0, errors: [error.message] };
    }
    return { count: records.length, errors: [] };
  };

  const handleUpload = async () => {
    if (!uploadState.file) return;

    setUploadState(prev => ({ ...prev, status: 'uploading' }));

    try {
      const { students, courses } = await parseExcel(uploadState.file);
      
      const studentResult = await syncStudents(students);
      const courseResult = await syncCourses(courses);

      const allErrors = [...studentResult.errors, ...courseResult.errors];

      setUploadState(prev => ({
        ...prev,
        status: allErrors.length > 0 ? 'error' : 'success',
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