import React, { useState, useEffect, useMemo } from 'react';
import { Download, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { supabase } from '../supabase';

export default function AtRiskReport({ schoolId, counselorId = null, onSelectStudent }) {
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [studentNotes, setStudentNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [riskFilter, setRiskFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [flagFilter, setFlagFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [sortField, setSortField] = useState('riskLevel');
  const [sortDirection, setSortDirection] = useState('desc');

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        
        let studentsQuery = supabase
          .from('profiles')
          .select('*')
          .eq('school_id', schoolId)
          .eq('role', 'student');
        
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
        
        const studentIds = studentsData.map(s => s.id);
        const { data: coursesData, error: coursesError } = await supabase
          .from('courses')
          .select('*')
          .in('student_id', studentIds);
        if (coursesError) throw coursesError;
        
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('credit_categories')
          .select('*')
          .eq('school_id', schoolId);
        if (categoriesError) throw categoriesError;
        
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

  const getCurrentTrimester = () => {
    const month = new Date().getMonth() + 1;
    if (month >= 8 && month <= 11) return 1;
    if (month === 12 || month <= 2) return 2;
    return 3;
  };
  
  const getExpectedProgress = (grade, trimester) => {
    const expectations = {
      9:  { 1: 0,  2: 8,  3: 17 },
      10: { 1: 25, 2: 33, 3: 42 },
      11: { 1: 50, 2: 58, 3: 67 },
      12: { 1: 75, 2: 83, 3: 92 }
    };
    return expectations[grade]?.[trimester] || 0;
  };
  
  const calculateStudentStats = (studentId) => {
    const studentCourses = courses.filter(c => c.student_id === studentId);
    const totalEarned = studentCourses.reduce((sum, c) => sum + (Number(c.credits) || 0), 0);
    const totalRequired = 24;
    const percentage = Math.round((totalEarned / totalRequired) * 100);
    return { totalEarned, totalRequired, percentage };
  };
  
  const getRiskLevel = (student, stats) => {
    const trimester = getCurrentTrimester();
    const expectedPercent = getExpectedProgress(student.grade, trimester);
    const expectedCredits = (expectedPercent / 100) * 24;
    const actualCredits = stats.totalEarned;
    const creditsBehind = expectedCredits - actualCredits;
    
    if (creditsBehind >= 3) return { level: 'critical', creditsBehind, label: 'Critical' };
    if (creditsBehind >= 1.5) return { level: 'at-risk', creditsBehind, label: 'At-Risk' };
    if (creditsBehind >= 0.5) return { level: 'watch', creditsBehind, label: 'Watch' };
    return { level: 'on-track', creditsBehind: 0, label: 'On Track' };
  };
  
  const getLastNoteDate = (studentId) => {
    const note = studentNotes.find(n => n.student_id === studentId);
    return note ? new Date(note.created_at) : null;
  };

  const processedStudents = useMemo(() => {
    return students.map(student => {
      const stats = calculateStudentStats(student.id);
      const risk = getRiskLevel(student, stats);
      const lastNote = getLastNoteDate(student.id);
      return { ...student, stats, risk, lastNote };
    });
  }, [students, courses, categories, studentNotes]);

  const filteredStudents = useMemo(() => {
    let result = processedStudents.filter(s => s.risk.level !== 'on-track');
    
    if (riskFilter !== 'all') {
      if (riskFilter === 'critical-at-risk') {
        result = result.filter(s => s.risk.level === 'critical' || s.risk.level === 'at-risk');
      } else {
        result = result.filter(s => s.risk.level === riskFilter);
      }
    }
    
    if (gradeFilter !== 'all') {
      result = result.filter(s => s.grade === parseInt(gradeFilter));
    }
    
    if (flagFilter !== 'all') {
      if (flagFilter === 'iep') result = result.filter(s => s.is_iep);
      if (flagFilter === '504') result = result.filter(s => s.is_504);
      if (flagFilter === 'ell') result = result.filter(s => s.is_ell);
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(s => 
        s.full_name?.toLowerCase().includes(term) ||
        s.email?.toLowerCase().includes(term) ||
        s.engage_id?.toLowerCase().includes(term)
      );
    }
    
    result.sort((a, b) => {
      let aVal, bVal;
      switch (sortField) {
        case 'name': aVal = a.full_name || ''; bVal = b.full_name || ''; break;
        case 'grade': aVal = a.grade || 0; bVal = b.grade || 0; break;
        case 'riskLevel':
          const riskOrder = { critical: 3, 'at-risk': 2, watch: 1, 'on-track': 0 };
          aVal = riskOrder[a.risk.level]; bVal = riskOrder[b.risk.level]; break;
        case 'progress': aVal = a.stats.percentage; bVal = b.stats.percentage; break;
        case 'creditsBehind': aVal = a.risk.creditsBehind; bVal = b.risk.creditsBehind; break;
        case 'lastNote': aVal = a.lastNote ? a.lastNote.getTime() : 0; bVal = b.lastNote ? b.lastNote.getTime() : 0; break;
        default: aVal = 0; bVal = 0;
      }
      return sortDirection === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
    
    return result;
  }, [processedStudents, riskFilter, gradeFilter, flagFilter, searchTerm, sortField, sortDirection]);

  const summaryStats = useMemo(() => {
    const atRiskStudents = processedStudents.filter(s => s.risk.level !== 'on-track');
    return {
      total: processedStudents.length,
      critical: atRiskStudents.filter(s => s.risk.level === 'critical').length,
      atRisk: atRiskStudents.filter(s => s.risk.level === 'at-risk').length,
      watch: atRiskStudents.filter(s => s.risk.level === 'watch').length
    };
  }, [processedStudents]);

  const exportToCSV = () => {
    const headers = ['Name', 'Grade', 'Email', 'Risk Level', 'Progress %', 'Credits Behind', 'IEP', '504', 'ELL', 'Last Note'];
    const rows = filteredStudents.map(s => [
      s.full_name, s.grade, s.email, s.risk.label,
      s.stats.percentage + '%', s.risk.creditsBehind.toFixed(1),
      s.is_iep ? 'Yes' : 'No', s.is_504 ? 'Yes' : 'No', s.is_ell ? 'Yes' : 'No',
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
    const diffDays = Math.floor((new Date() - date) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
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

  const handleStudentClick = (student) => {
    if (onSelectStudent) {
      onSelectStudent(student);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-100 border border-red-300 rounded-lg p-4 text-red-700">
        Error loading data: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">At-Risk Student Report</h2>
          <p className="text-sm text-slate-400 mt-1">
            {getTrimesterName()} Trimester, {new Date().getFullYear()}-{(new Date().getFullYear() + 1).toString().slice(-2)}
          </p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg text-sm font-medium text-white hover:bg-blue-700"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Caseload</div>
          <div className="text-3xl font-bold text-white">{summaryStats.total}</div>
        </div>
        <div className="bg-red-900/30 rounded-xl p-4 border border-red-800/50">
          <div className="text-xs uppercase tracking-wide text-red-300 mb-1">Critical</div>
          <div className="text-3xl font-bold text-red-400">{summaryStats.critical}</div>
          <div className="text-xs text-red-300/70">3+ credits behind</div>
        </div>
        <div className="bg-amber-900/30 rounded-xl p-4 border border-amber-800/50">
          <div className="text-xs uppercase tracking-wide text-amber-300 mb-1">At-Risk</div>
          <div className="text-3xl font-bold text-amber-400">{summaryStats.atRisk}</div>
          <div className="text-xs text-amber-300/70">1.5-2.9 behind</div>
        </div>
        <div className="bg-blue-900/30 rounded-xl p-4 border border-blue-800/50">
          <div className="text-xs uppercase tracking-wide text-blue-300 mb-1">Watch</div>
          <div className="text-3xl font-bold text-blue-400">{summaryStats.watch}</div>
          <div className="text-xs text-blue-300/70">0.5-1.4 behind</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wide text-slate-400">Risk Level</label>
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}
            className="px-3 py-2 border border-slate-500 rounded-lg text-sm bg-slate-600 text-white">
            <option value="all">All Levels</option>
            <option value="critical">Critical</option>
            <option value="critical-at-risk">Critical + At-Risk</option>
            <option value="at-risk">At-Risk</option>
            <option value="watch">Watch</option>
          </select>
        </div>
        
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wide text-slate-400">Grade</label>
          <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}
            className="px-3 py-2 border border-slate-500 rounded-lg text-sm bg-slate-600 text-white">
            <option value="all">All</option>
            <option value="9">9th</option>
            <option value="10">10th</option>
            <option value="11">11th</option>
            <option value="12">12th</option>
          </select>
        </div>
        
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wide text-slate-400">Flags</label>
          <select value={flagFilter} onChange={(e) => setFlagFilter(e.target.value)}
            className="px-3 py-2 border border-slate-500 rounded-lg text-sm bg-slate-600 text-white">
            <option value="all">All</option>
            <option value="iep">IEP</option>
            <option value="504">504</option>
            <option value="ell">ELL</option>
          </select>
        </div>
        
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wide text-slate-400">Search</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Name or ID..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-2 border border-slate-500 rounded-lg text-sm w-44 bg-slate-600 text-white placeholder-slate-400" />
          </div>
        </div>
        
        <div className="flex-1"></div>
        <div className="text-sm text-slate-300">
          Showing <strong className="text-white">{filteredStudents.length}</strong> of {summaryStats.critical + summaryStats.atRisk + summaryStats.watch} students
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-slate-700/50 rounded-xl border border-slate-600 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-700 border-b border-slate-600">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase cursor-pointer hover:bg-slate-600"
                onClick={() => handleSort('name')}>
                Student {sortField === 'name' && (sortDirection === 'asc' ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />)}
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-300 uppercase cursor-pointer hover:bg-slate-600"
                onClick={() => handleSort('grade')}>
                Gr {sortField === 'grade' && (sortDirection === 'asc' ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />)}
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Flags</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-300 uppercase cursor-pointer hover:bg-slate-600"
                onClick={() => handleSort('riskLevel')}>
                Risk {sortField === 'riskLevel' && (sortDirection === 'asc' ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />)}
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-300 uppercase cursor-pointer hover:bg-slate-600"
                onClick={() => handleSort('progress')}>
                Progress {sortField === 'progress' && (sortDirection === 'asc' ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />)}
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-300 uppercase cursor-pointer hover:bg-slate-600"
                onClick={() => handleSort('creditsBehind')}>
                Behind {sortField === 'creditsBehind' && (sortDirection === 'asc' ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />)}
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-300 uppercase cursor-pointer hover:bg-slate-600"
                onClick={() => handleSort('lastNote')}>
                Last Note {sortField === 'lastNote' && (sortDirection === 'asc' ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />)}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No at-risk students found.
                </td>
              </tr>
            ) : (
              filteredStudents.map((student) => (
                <tr key={student.id} className="border-b border-slate-600/50 hover:bg-slate-600/30 cursor-pointer"
                  onClick={() => handleStudentClick(student)}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-blue-400 hover:text-blue-300">{student.full_name}</div>
                    <div className="text-xs text-slate-500">{student.engage_id || student.id.slice(0, 8)}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-300">{student.grade}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      {student.is_iep && <span className="px-1.5 py-0.5 text-xs rounded bg-pink-500/30 text-pink-300">IEP</span>}
                      {student.is_504 && <span className="px-1.5 py-0.5 text-xs rounded bg-purple-500/30 text-purple-300">504</span>}
                      {student.is_ell && <span className="px-1.5 py-0.5 text-xs rounded bg-cyan-500/30 text-cyan-300">ELL</span>}
                      {!student.is_iep && !student.is_504 && !student.is_ell && <span className="text-slate-500">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-1 text-xs font-semibold rounded ${
                      student.risk.level === 'critical' ? 'bg-red-500/30 text-red-300' :
                      student.risk.level === 'at-risk' ? 'bg-amber-500/30 text-amber-300' :
                      'bg-blue-500/30 text-blue-300'
                    }`}>
                      {student.risk.label}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-slate-600 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${
                          student.risk.level === 'critical' ? 'bg-red-500' :
                          student.risk.level === 'at-risk' ? 'bg-amber-500' : 'bg-blue-500'
                        }`} style={{ width: `${Math.min(student.stats.percentage, 100)}%` }} />
                      </div>
                      <span className="text-xs text-slate-300 w-8">{student.stats.percentage}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-mono font-medium text-red-400">-{student.risk.creditsBehind.toFixed(1)}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs ${
                      getDateStaleness(student.lastNote) === 'very-stale' ? 'text-red-400' :
                      getDateStaleness(student.lastNote) === 'stale' ? 'text-amber-400' : 'text-slate-400'
                    }`}>
                      {formatDate(student.lastNote)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
