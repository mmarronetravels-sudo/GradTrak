import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Download, Search, ChevronUp, ChevronDown, Eye } from 'lucide-react';
import { supabase } from '../supabase';

// ============================================
// AT-RISK STUDENT REPORT COMPONENT
// ============================================

export default function AtRiskReport({ schoolId, counselorId = null }) {
  // State
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [studentNotes, setStudentNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [riskFilter, setRiskFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [flagFilter, setFlagFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Sorting
  const [sortField, setSortField] = useState('riskLevel');
  const [sortDirection, setSortDirection] = useState('desc');

  // ============================================
  // DATA FETCHING
  // ============================================
  
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        
        // Fetch students (with optional counselor filter)
        let studentsQuery = supabase
          .from('profiles')
          .select('*')
          .eq('school_id', schoolId)
          .eq('role', 'student');
        
        // If counselorId provided, filter by counselor's caseload
        if (counselorId) {
          const { data: assignments } = await supabase
            .from('counselor_assignments')
            .select('student_id')
            .eq('counselor_id', counselorId);
          
          if (assignments && assignments.length > 0) {
            const studentIds = assignments.map(a => a.student_id);
            studentsQuery = studentsQuery.in('id', studentIds);
          }
        }
        
        const { data: studentsData, error: studentsError } = await studentsQuery;
        if (studentsError) throw studentsError;
        
        // Fetch courses for these students
        const studentIds = studentsData.map(s => s.id);
        const { data: coursesData, error: coursesError } = await supabase
          .from('courses')
          .select('*')
          .in('student_id', studentIds);
        if (coursesError) throw coursesError;
        
        // Fetch credit categories
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('credit_categories')
          .select('*')
          .eq('school_id', schoolId);
        if (categoriesError) throw categoriesError;
        
        // Fetch most recent note for each student
        const { data: notesData, error: notesError } = await supabase
          .from('student_notes')
          .select('student_id, created_at')
          .in('student_id', studentIds)
          .order('created_at', { ascending: false });
        if (notesError) throw notesError;
        
        setStudents(studentsData || []);
        setCourses(coursesData || []);
        setCategories(categoriesData || []);
        setStudentNotes(notesData || []);
        
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    if (schoolId) {
      fetchData();
    }
  }, [schoolId, counselorId]);

  // ============================================
  // CALCULATION FUNCTIONS
  // ============================================
  
  // Get current trimester (Summit Learning Charter schedule)
  const getCurrentTrimester = () => {
    const month = new Date().getMonth() + 1; // 1-12
    if (month >= 8 && month <= 11) return 1; // Fall: Aug-Nov
    if (month === 12 || month <= 2) return 2; // Winter: Dec-Feb
    return 3; // Spring: Mar-Jun (July is summer)
  };
  
  // Expected progress by grade and trimester (percentage of 24 credits)
  const getExpectedProgress = (grade, trimester) => {
    const expectations = {
      9:  { 1: 0,  2: 8,  3: 17 },
      10: { 1: 25, 2: 33, 3: 42 },
      11: { 1: 50, 2: 58, 3: 67 },
      12: { 1: 75, 2: 83, 3: 92 }
    };
    return expectations[grade]?.[trimester] || 0;
  };
  
  // Calculate student stats
  const calculateStudentStats = (studentId) => {
    const studentCourses = courses.filter(c => c.student_id === studentId);
    
    // Total credits earned
    const totalEarned = studentCourses.reduce((sum, c) => sum + (Number(c.credits) || 0), 0);
    
    // Total required (24 credits)
    const totalRequired = 24;
    
    // Percentage complete
    const percentage = Math.round((totalEarned / totalRequired) * 100);
    
    // Credits by category
    const creditsByCategory = {};
    categories.forEach(cat => {
      creditsByCategory[cat.id] = studentCourses
        .filter(c => c.category_id === cat.id)
        .reduce((sum, c) => sum + (Number(c.credits) || 0), 0);
    });
    
    // Find deficiencies (categories where student is behind)
    const deficiencies = categories
      .map(cat => {
        const earned = creditsByCategory[cat.id] || 0;
        const required = Number(cat.credits_required) || 0;
        if (earned < required) {
          return { category: cat, needed: required - earned, earned, required };
        }
        return null;
      })
      .filter(Boolean);
    
    return {
      totalEarned,
      totalRequired,
      percentage,
      creditsByCategory,
      deficiencies
    };
  };
  
  // Determine risk level based on credits behind
  const getRiskLevel = (student, stats) => {
    const trimester = getCurrentTrimester();
    const expectedPercent = getExpectedProgress(student.grade, trimester);
    const actualPercent = stats.percentage;
    
    // Convert percentage gap to credits
    const expectedCredits = (expectedPercent / 100) * 24;
    const actualCredits = stats.totalEarned;
    const creditsBehind = expectedCredits - actualCredits;
    
    if (creditsBehind >= 3) return { level: 'critical', creditsBehind, label: 'Critical' };
    if (creditsBehind >= 1.5) return { level: 'at-risk', creditsBehind, label: 'At-Risk' };
    if (creditsBehind >= 0.5) return { level: 'watch', creditsBehind, label: 'Watch' };
    return { level: 'on-track', creditsBehind: 0, label: 'On Track' };
  };
  
  // Get most recent note date for a student
  const getLastNoteDate = (studentId) => {
    const note = studentNotes.find(n => n.student_id === studentId);
    return note ? new Date(note.created_at) : null;
  };

  // ============================================
  // PROCESS STUDENTS DATA
  // ============================================
  
  const processedStudents = useMemo(() => {
    return students.map(student => {
      const stats = calculateStudentStats(student.id);
      const risk = getRiskLevel(student, stats);
      const lastNote = getLastNoteDate(student.id);
      
      return {
        ...student,
        stats,
        risk,
        lastNote,
        categoriesShort: stats.deficiencies.map(d => d.category.name)
      };
    });
  }, [students, courses, categories, studentNotes]);

  // ============================================
  // FILTERING & SORTING
  // ============================================
  
  const filteredStudents = useMemo(() => {
    let result = processedStudents;
    
    // Only show students who are behind (not on-track)
    result = result.filter(s => s.risk.level !== 'on-track');
    
    // Risk filter
    if (riskFilter !== 'all') {
      if (riskFilter === 'critical-at-risk') {
        result = result.filter(s => s.risk.level === 'critical' || s.risk.level === 'at-risk');
      } else {
        result = result.filter(s => s.risk.level === riskFilter);
      }
    }
    
    // Grade filter
    if (gradeFilter !== 'all') {
      result = result.filter(s => s.grade === parseInt(gradeFilter));
    }
    
    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter(s => 
        s.categoriesShort.some(cat => cat.toLowerCase().includes(categoryFilter.toLowerCase()))
      );
    }
    
    // Flag filter
    if (flagFilter !== 'all') {
      if (flagFilter === 'iep') result = result.filter(s => s.is_iep);
      if (flagFilter === '504') result = result.filter(s => s.is_504);
      if (flagFilter === 'ell') result = result.filter(s => s.is_ell);
    }
    
    // Search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(s => 
        s.full_name?.toLowerCase().includes(term) ||
        s.email?.toLowerCase().includes(term) ||
        s.engage_id?.toLowerCase().includes(term)
      );
    }
    
    // Sorting
    result.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortField) {
        case 'name':
          aVal = a.full_name || '';
          bVal = b.full_name || '';
          break;
        case 'grade':
          aVal = a.grade || 0;
          bVal = b.grade || 0;
          break;
        case 'riskLevel':
          const riskOrder = { critical: 3, 'at-risk': 2, watch: 1, 'on-track': 0 };
          aVal = riskOrder[a.risk.level];
          bVal = riskOrder[b.risk.level];
          break;
        case 'progress':
          aVal = a.stats.percentage;
          bVal = b.stats.percentage;
          break;
        case 'creditsBehind':
          aVal = a.risk.creditsBehind;
          bVal = b.risk.creditsBehind;
          break;
        case 'lastNote':
          aVal = a.lastNote ? a.lastNote.getTime() : 0;
          bVal = b.lastNote ? b.lastNote.getTime() : 0;
          break;
        default:
          aVal = 0;
          bVal = 0;
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });
    
    return result;
  }, [processedStudents, riskFilter, gradeFilter, categoryFilter, flagFilter, searchTerm, sortField, sortDirection]);

  // ============================================
  // SUMMARY STATS
  // ============================================
  
  const summaryStats = useMemo(() => {
    const atRiskStudents = processedStudents.filter(s => s.risk.level !== 'on-track');
    return {
      total: processedStudents.length,
      critical: atRiskStudents.filter(s => s.risk.level === 'critical').length,
      atRisk: atRiskStudents.filter(s => s.risk.level === 'at-risk').length,
      watch: atRiskStudents.filter(s => s.risk.level === 'watch').length
    };
  }, [processedStudents]);

  // ============================================
  // EXPORT FUNCTIONS
  // ============================================
  
  const exportToCSV = () => {
    const headers = ['Name', 'Grade', 'Email', 'Risk Level', 'Progress %', 'Credits Behind', 'Categories Short', 'IEP', '504', 'ELL', 'Last Note'];
    const rows = filteredStudents.map(s => [
      s.full_name,
      s.grade,
      s.email,
      s.risk.label,
      s.stats.percentage + '%',
      s.risk.creditsBehind.toFixed(1),
      s.categoriesShort.join('; '),
      s.is_iep ? 'Yes' : 'No',
      s.is_504 ? 'Yes' : 'No',
      s.is_ell ? 'Yes' : 'No',
      s.lastNote ? s.lastNote.toLocaleDateString() : 'Never'
    ]);
    
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `at-risk-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // ============================================
  // HELPER FUNCTIONS
  // ============================================
  
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };
  
  const formatDate = (date) => {
    if (!date) return 'Never';
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  
  const getDateStaleness = (date) => {
    if (!date) return 'very-stale';
    const diffDays = Math.floor((new Date() - date) / (1000 * 60 * 60 * 24));
    if (diffDays > 30) return 'very-stale';
    if (diffDays > 14) return 'stale';
    return 'recent';
  };

  const getTrimesterName = () => {
    const t = getCurrentTrimester();
    if (t === 1) return 'Fall';
    if (t === 2) return 'Winter';
    return 'Spring';
  };

  // ============================================
  // RENDER
  // ============================================
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        Error loading data: {error}
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">At-Risk Student Report</h1>
          <p className="text-sm text-slate-500 mt-1">
            {getTrimesterName()} Trimester, {new Date().getFullYear()}-{(new Date().getFullYear() + 1).toString().slice(-2)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border border-gray-200 border-l-4 border-l-slate-700">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">My Caseload</div>
          <div className="text-3xl font-bold text-slate-800">{summaryStats.total}</div>
          <div className="text-xs text-gray-500">students assigned</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200 border-l-4 border-l-red-600">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Critical</div>
          <div className="text-3xl font-bold text-red-600">{summaryStats.critical}</div>
          <div className="text-xs text-gray-500">3+ credits behind</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200 border-l-4 border-l-amber-500">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">At-Risk</div>
          <div className="text-3xl font-bold text-amber-600">{summaryStats.atRisk}</div>
          <div className="text-xs text-gray-500">1.5–2.9 credits behind</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200 border-l-4 border-l-blue-500">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Watch</div>
          <div className="text-3xl font-bold text-blue-600">{summaryStats.watch}</div>
          <div className="text-xs text-gray-500">0.5–1.4 credits behind</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-gray-200 mb-4 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wide text-gray-500">Risk Level</label>
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="all">All Levels</option>
            <option value="critical">Critical Only</option>
            <option value="critical-at-risk">Critical + At-Risk</option>
            <option value="at-risk">At-Risk Only</option>
            <option value="watch">Watch Only</option>
          </select>
        </div>
        
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wide text-gray-500">Grade</label>
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="all">All Grades</option>
            <option value="9">9th Grade</option>
            <option value="10">10th Grade</option>
            <option value="11">11th Grade</option>
            <option value="12">12th Grade</option>
          </select>
        </div>
        
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wide text-gray-500">Category Behind</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.name}>{cat.name}</option>
            ))}
          </select>
        </div>
        
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wide text-gray-500">Flags</label>
          <select
            value={flagFilter}
            onChange={(e) => setFlagFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="all">All Students</option>
            <option value="iep">IEP</option>
            <option value="504">504 Plan</option>
            <option value="ell">ELL</option>
          </select>
        </div>
        
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wide text-gray-500">Search</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-md text-sm w-52"
            />
          </div>
        </div>
        
        <div className="flex-1"></div>
        
        <div className="text-sm text-gray-500">
          Showing <strong className="text-gray-700">{filteredStudents.length}</strong> of {summaryStats.critical + summaryStats.atRisk + summaryStats.watch} students
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th 
                className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('name')}
              >
                Student {sortField === 'name' && (sortDirection === 'asc' ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />)}
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('grade')}
              >
                Grade {sortField === 'grade' && (sortDirection === 'asc' ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />)}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Flags
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('riskLevel')}
              >
                Risk Level {sortField === 'riskLevel' && (sortDirection === 'asc' ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />)}
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('progress')}
              >
                Progress {sortField === 'progress' && (sortDirection === 'asc' ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />)}
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('creditsBehind')}
              >
                Behind {sortField === 'creditsBehind' && (sortDirection === 'asc' ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />)}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Categories Short
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('lastNote')}
              >
                Last Note {sortField === 'lastNote' && (sortDirection === 'asc' ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />)}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  No at-risk students found matching your filters.
                </td>
              </tr>
            ) : (
              filteredStudents.map((student) => (
                <tr key={student.id} className="border-b border-gray-100 hover:bg-blue-50/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{student.full_name}</div>
                    <div className="text-xs text-gray-400 font-mono">{student.engage_id || student.id.slice(0, 8)}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{student.grade}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {student.is_iep && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-pink-100 text-pink-700">IEP</span>
                      )}
                      {student.is_504 && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-700">504</span>
                      )}
                      {student.is_ell && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700">ELL</span>
                      )}
                      {!student.is_iep && !student.is_504 && !student.is_ell && (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-semibold uppercase rounded ${
                      student.risk.level === 'critical' ? 'bg-red-100 text-red-700' :
                      student.risk.level === 'at-risk' ? 'bg-amber-100 text-amber-700' :
                      student.risk.level === 'watch' ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {student.risk.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden w-20">
                        <div 
                          className={`h-full rounded-full ${
                            student.risk.level === 'critical' ? 'bg-red-500' :
                            student.risk.level === 'at-risk' ? 'bg-amber-500' :
                            student.risk.level === 'watch' ? 'bg-blue-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(student.stats.percentage, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-600 w-10 text-right font-mono">
                        {student.stats.percentage}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono font-medium text-red-600">
                      -{student.risk.creditsBehind.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {student.categoriesShort.slice(0, 3).map((cat, i) => (
                        <span key={i} className="px-2 py-0.5 text-xs font-medium rounded bg-red-50 text-red-700">
                          {cat.length > 10 ? cat.slice(0, 10) + '...' : cat}
                        </span>
                      ))}
                      {student.categoriesShort.length > 3 && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600">
                          +{student.categoriesShort.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${
                      getDateStaleness(student.lastNote) === 'very-stale' ? 'text-red-600 font-medium' :
                      getDateStaleness(student.lastNote) === 'stale' ? 'text-amber-600' :
                      'text-gray-500'
                    }`}>
                      {formatDate(student.lastNote)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button 
                      className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 hover:border-blue-400 hover:text-blue-600 transition-colors"
                      onClick={() => {
                        // Navigate to student detail - you can customize this
                        window.location.hash = `student/${student.id}`;
                      }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        
        {/* Table Footer */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {filteredStudents.length} students
          </div>
        </div>
      </div>
    </div>
  );
}
