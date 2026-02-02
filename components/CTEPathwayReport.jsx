import React, { useState, useEffect, useMemo } from 'react';
import { Download, Search, ChevronUp, ChevronDown, GraduationCap, Wrench, Stethoscope, Briefcase, Cpu, Leaf } from 'lucide-react';
import { supabase } from '../supabase';

// Pathway icons mapping
const pathwayIcons = {
  'Business': Briefcase,
  'Health Sciences': Stethoscope,
  'Information Technology': Cpu,
  'Agriculture': Leaf,
  'Manufacturing & Engineering': Wrench
};

const pathwayColors = {
  'Business': { bg: 'bg-amber-900/30', border: 'border-amber-800/50', text: 'text-amber-300', badge: 'bg-amber-500/30 text-amber-300' },
  'Health Sciences': { bg: 'bg-rose-900/30', border: 'border-rose-800/50', text: 'text-rose-300', badge: 'bg-rose-500/30 text-rose-300' },
  'Information Technology': { bg: 'bg-cyan-900/30', border: 'border-cyan-800/50', text: 'text-cyan-300', badge: 'bg-cyan-500/30 text-cyan-300' },
  'Agriculture': { bg: 'bg-green-900/30', border: 'border-green-800/50', text: 'text-green-300', badge: 'bg-green-500/30 text-green-300' },
  'Manufacturing & Engineering': { bg: 'bg-purple-900/30', border: 'border-purple-800/50', text: 'text-purple-300', badge: 'bg-purple-500/30 text-purple-300' }
};

export default function CTEPathwayReport({ schoolId, counselorId = null, onSelectStudent }) {
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [pathways, setPathways] = useState([]);
  const [courseMappings, setCourseMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [pathwayFilter, setPathwayFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [sortField, setSortField] = useState('progress');
  const [sortDirection, setSortDirection] = useState('desc');
  
  const [expandedStudent, setExpandedStudent] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        
        // Fetch CTE pathways for school
        const { data: pathwaysData, error: pathwaysError } = await supabase
          .from('cte_pathways')
          .select('*')
          .eq('school_id', schoolId)
          .order('display_order');
        if (pathwaysError) throw pathwaysError;
        
        // Fetch course mappings with pathway links
        const { data: mappingsData, error: mappingsError } = await supabase
          .from('course_mappings')
          .select('*')
          .eq('school_id', schoolId)
          .not('pathway_id', 'is', null);
        if (mappingsError) throw mappingsError;
        
        // Fetch students
        let studentsQuery = supabase
          .from('profiles')
          .select(`*, diploma_types (id, code, name)`)
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
        
        // Fetch courses for all students in batches
        const studentIds = studentsData.map(s => s.id);
        const batchSize = 20;
        let allCourses = [];
        for (let i = 0; i < studentIds.length; i += batchSize) {
          const batch = studentIds.slice(i, i + batchSize);
          const { data: courseData, error: coursesError } = await supabase
            .from('courses')
            .select('*')
            .in('student_id', batch)
            .limit(5000);
          if (coursesError) throw coursesError;
          if (courseData) {
            allCourses = allCourses.concat(courseData);
          }
        }
        
        setPathways(pathwaysData || []);
        setCourseMappings(mappingsData || []);
        setStudents(studentsData || []);
        setCourses(allCourses);
        
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

  // Calculate pathway progress for a student
  const calculatePathwayProgress = (studentId) => {
    const studentCourses = courses.filter(c => c.student_id === studentId);
    const results = [];
    
    pathways.forEach(pathway => {
      // Find course mappings for this pathway
      const pathwayCourseNames = courseMappings
        .filter(cm => cm.pathway_id === pathway.id)
        .map(cm => cm.course_name.toLowerCase());
      
      // Find completed courses that match
      const completedCourses = studentCourses.filter(c => 
        pathwayCourseNames.includes(c.name?.toLowerCase())
      );
      
      const earnedCredits = completedCourses.reduce((sum, c) => sum + (Number(c.credits) || 0), 0);
      const requiredCredits = pathway.credits_required || 3.0;
      const percentage = Math.round((earnedCredits / requiredCredits) * 100);
      
      if (earnedCredits > 0) {
        results.push({
          pathway,
          earnedCredits,
          requiredCredits,
          percentage: Math.min(percentage, 100),
          completedCourses,
          isComplete: earnedCredits >= requiredCredits
        });
      }
    });
    
    return results;
  };
  
  // Get pathway status
  const getPathwayStatus = (progress) => {
    if (progress.isComplete) return { level: 'complete', label: 'Complete', color: 'bg-emerald-500/30 text-emerald-300' };
    if (progress.percentage >= 67) return { level: 'near', label: 'Near Complete', color: 'bg-blue-500/30 text-blue-300' };
    if (progress.percentage >= 33) return { level: 'in-progress', label: 'In Progress', color: 'bg-amber-500/30 text-amber-300' };
    return { level: 'started', label: 'Started', color: 'bg-slate-500/30 text-slate-300' };
  };
  
  // Get missing courses for a pathway
  const getMissingCourses = (studentId, pathwayId) => {
    const studentCourses = courses.filter(c => c.student_id === studentId);
    const completedNames = studentCourses.map(c => c.name?.toLowerCase());
    
    const pathwayCourses = courseMappings.filter(cm => cm.pathway_id === pathwayId);
    
    return pathwayCourses.filter(cm => 
      !completedNames.includes(cm.course_name.toLowerCase())
    );
  };

  // Process students with pathway data
  const processedStudents = useMemo(() => {
    return students.map(student => {
      const pathwayProgress = calculatePathwayProgress(student.id);
      const primaryPathway = pathwayProgress.length > 0 
        ? pathwayProgress.reduce((max, p) => p.earnedCredits > max.earnedCredits ? p : max, pathwayProgress[0])
        : null;
      
      return {
        ...student,
        pathwayProgress,
        primaryPathway,
        totalCTECredits: pathwayProgress.reduce((sum, p) => sum + p.earnedCredits, 0),
        hasPathwayProgress: pathwayProgress.length > 0
      };
    }).filter(s => s.hasPathwayProgress); // Only show students with CTE progress
  }, [students, courses, pathways, courseMappings]);

  // Filter and sort students
  const filteredStudents = useMemo(() => {
    let result = [...processedStudents];
    
    if (pathwayFilter !== 'all') {
      result = result.filter(s => 
        s.pathwayProgress.some(p => p.pathway.id === pathwayFilter)
      );
    }
    
    if (statusFilter !== 'all') {
      result = result.filter(s => {
        const primary = s.primaryPathway;
        if (!primary) return false;
        const status = getPathwayStatus(primary);
        return status.level === statusFilter;
      });
    }
    
    if (gradeFilter !== 'all') {
      result = result.filter(s => s.grade === parseInt(gradeFilter));
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(s => 
        s.full_name?.toLowerCase().includes(term) ||
        s.email?.toLowerCase().includes(term)
      );
    }
    
    // Sort
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
        case 'pathway':
          aVal = a.primaryPathway?.pathway.name || '';
          bVal = b.primaryPathway?.pathway.name || '';
          break;
        case 'progress': 
          aVal = a.primaryPathway?.percentage || 0; 
          bVal = b.primaryPathway?.percentage || 0; 
          break;
        case 'credits':
          aVal = a.primaryPathway?.earnedCredits || 0;
          bVal = b.primaryPathway?.earnedCredits || 0;
          break;
        default: 
          aVal = 0; 
          bVal = 0;
      }
      if (typeof aVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    
    return result;
  }, [processedStudents, pathwayFilter, statusFilter, gradeFilter, searchTerm, sortField, sortDirection]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const total = processedStudents.length;
    const complete = processedStudents.filter(s => s.primaryPathway?.isComplete).length;
    const nearComplete = processedStudents.filter(s => {
      const p = s.primaryPathway;
      return p && !p.isComplete && p.percentage >= 67;
    }).length;
    const inProgress = processedStudents.filter(s => {
      const p = s.primaryPathway;
      return p && !p.isComplete && p.percentage < 67;
    }).length;
    
    // Count by pathway
    const byPathway = {};
    pathways.forEach(p => {
      byPathway[p.name] = processedStudents.filter(s => 
        s.pathwayProgress.some(pp => pp.pathway.id === p.id)
      ).length;
    });
    
    return { total, complete, nearComplete, inProgress, byPathway };
  }, [processedStudents, pathways]);

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Name', 'Grade', 'Email', 'Primary Pathway', 'Credits Earned', 'Credits Required', 'Progress %', 'Status', 'Completed Courses'];
    const rows = filteredStudents.map(s => {
      const primary = s.primaryPathway;
      const status = primary ? getPathwayStatus(primary) : { label: 'N/A' };
      const completedCourses = primary?.completedCourses.map(c => c.name).join('; ') || '';
      return [
        s.full_name,
        s.grade,
        s.email,
        primary?.pathway.name || 'N/A',
        primary?.earnedCredits.toFixed(1) || '0',
        primary?.requiredCredits || '3.0',
        (primary?.percentage || 0) + '%',
        status.label,
        completedCourses
      ];
    });
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cte-pathway-report-${new Date().toISOString().split('T')[0]}.csv`;
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

  const handleStudentClick = (student) => {
    if (onSelectStudent) {
      onSelectStudent(student);
    }
  };
  
  const toggleExpanded = (studentId, e) => {
    e.stopPropagation();
    setExpandedStudent(expandedStudent === studentId ? null : studentId);
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
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-indigo-400" />
            CTE Pathway Progress Report
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Track student progress toward Career & Technical Education pathways
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
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Students with CTE</div>
          <div className="text-3xl font-bold text-white">{summaryStats.total}</div>
        </div>
        <div className="bg-emerald-900/30 rounded-xl p-4 border border-emerald-800/50">
          <div className="text-xs uppercase tracking-wide text-emerald-300 mb-1">Pathway Complete</div>
          <div className="text-3xl font-bold text-emerald-400">{summaryStats.complete}</div>
          <div className="text-xs text-emerald-300/70">3.0+ credits</div>
        </div>
        <div className="bg-blue-900/30 rounded-xl p-4 border border-blue-800/50">
          <div className="text-xs uppercase tracking-wide text-blue-300 mb-1">Near Complete</div>
          <div className="text-3xl font-bold text-blue-400">{summaryStats.nearComplete}</div>
          <div className="text-xs text-blue-300/70">67%+ progress</div>
        </div>
        <div className="bg-amber-900/30 rounded-xl p-4 border border-amber-800/50">
          <div className="text-xs uppercase tracking-wide text-amber-300 mb-1">In Progress</div>
          <div className="text-3xl font-bold text-amber-400">{summaryStats.inProgress}</div>
          <div className="text-xs text-amber-300/70">&lt;67% progress</div>
        </div>
      </div>
      
      {/* Pathway Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {pathways.map(pathway => {
          const colors = pathwayColors[pathway.name] || pathwayColors['Business'];
          const Icon = pathwayIcons[pathway.name] || Briefcase;
          const count = summaryStats.byPathway[pathway.name] || 0;
          return (
            <div key={pathway.id} className={`${colors.bg} rounded-xl p-3 border ${colors.border}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon size={16} className={colors.text} />
                <span className={`text-xs font-medium ${colors.text}`}>{pathway.name}</span>
              </div>
              <div className={`text-2xl font-bold ${colors.text}`}>{count}</div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wide text-slate-400">Pathway</label>
          <select value={pathwayFilter} onChange={(e) => setPathwayFilter(e.target.value)}
            className="px-3 py-2 border border-slate-500 rounded-lg text-sm bg-slate-600 text-white">
            <option value="all">All Pathways</option>
            {pathways.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wide text-slate-400">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-500 rounded-lg text-sm bg-slate-600 text-white">
            <option value="all">All Statuses</option>
            <option value="complete">Complete</option>
            <option value="near">Near Complete</option>
            <option value="in-progress">In Progress</option>
            <option value="started">Just Started</option>
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
          <label className="text-xs uppercase tracking-wide text-slate-400">Search</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Name..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-2 border border-slate-500 rounded-lg text-sm w-44 bg-slate-600 text-white placeholder-slate-400" />
          </div>
        </div>
        
        <div className="flex-1"></div>
        <div className="text-sm text-slate-300">
          Showing <strong className="text-white">{filteredStudents.length}</strong> of {summaryStats.total} students
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
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-300 uppercase cursor-pointer hover:bg-slate-600"
                onClick={() => handleSort('pathway')}>
                Pathway {sortField === 'pathway' && (sortDirection === 'asc' ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />)}
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-300 uppercase cursor-pointer hover:bg-slate-600"
                onClick={() => handleSort('credits')}>
                Credits {sortField === 'credits' && (sortDirection === 'asc' ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />)}
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-300 uppercase cursor-pointer hover:bg-slate-600"
                onClick={() => handleSort('progress')}>
                Progress {sortField === 'progress' && (sortDirection === 'asc' ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />)}
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Status</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No students with CTE pathway progress found.
                </td>
              </tr>
            ) : (
              filteredStudents.map((student) => {
                const primary = student.primaryPathway;
                const status = primary ? getPathwayStatus(primary) : null;
                const colors = pathwayColors[primary?.pathway.name] || pathwayColors['Business'];
                const Icon = pathwayIcons[primary?.pathway.name] || Briefcase;
                const isExpanded = expandedStudent === student.id;
                const missingCourses = primary ? getMissingCourses(student.id, primary.pathway.id) : [];
                
                return (
                  <React.Fragment key={student.id}>
                    <tr className="border-b border-slate-600/50 hover:bg-slate-600/30 cursor-pointer"
                      onClick={() => handleStudentClick(student)}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-blue-400 hover:text-blue-300">{student.full_name}</div>
                        <div className="text-xs text-slate-500">{student.engage_id || student.id.slice(0, 8)}</div>
                      </td>
                      <td className="px-3 py-3 text-slate-300">{student.grade}</td>
                      <td className="px-3 py-3">
                        {primary && (
                          <div className="flex items-center gap-2">
                            <Icon size={14} className={colors.text} />
                            <span className={colors.text}>{primary.pathway.name}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-mono text-white">
                          {primary?.earnedCredits.toFixed(1)} / {primary?.requiredCredits}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-slate-600 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${
                              primary?.isComplete ? 'bg-emerald-500' :
                              primary?.percentage >= 67 ? 'bg-blue-500' :
                              primary?.percentage >= 33 ? 'bg-amber-500' : 'bg-slate-500'
                            }`} style={{ width: `${primary?.percentage || 0}%` }} />
                          </div>
                          <span className="text-xs text-slate-300 w-8">{primary?.percentage || 0}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {status && (
                          <span className={`px-2 py-1 text-xs font-semibold rounded ${status.color}`}>
                            {status.label}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={(e) => toggleExpanded(student.id, e)}
                          className="text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-600"
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </td>
                    </tr>
                    
                    {/* Expanded Details Row */}
                    {isExpanded && (
                      <tr className="bg-slate-800/50">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="grid md:grid-cols-2 gap-4">
                            {/* Completed Courses */}
                            <div>
                              <h4 className="text-sm font-semibold text-emerald-400 mb-2">✓ Completed Courses</h4>
                              {primary?.completedCourses.length > 0 ? (
                                <ul className="space-y-1">
                                  {primary.completedCourses.map(course => (
                                    <li key={course.id} className="text-sm text-slate-300 flex justify-between">
                                      <span>{course.name}</span>
                                      <span className="text-slate-500">{course.credits} cr</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-sm text-slate-500">No completed courses</p>
                              )}
                            </div>
                            
                            {/* Suggested Next Courses */}
                            <div>
                              <h4 className="text-sm font-semibold text-amber-400 mb-2">📋 Available Pathway Courses</h4>
                              {missingCourses.length > 0 ? (
                                <ul className="space-y-1 max-h-40 overflow-y-auto">
                                  {missingCourses.slice(0, 8).map(course => (
                                    <li key={course.id} className="text-sm text-slate-400">
                                      {course.course_name} ({course.default_credits} cr)
                                    </li>
                                  ))}
                                  {missingCourses.length > 8 && (
                                    <li className="text-sm text-slate-500 italic">
                                      +{missingCourses.length - 8} more courses available
                                    </li>
                                  )}
                                </ul>
                              ) : (
                                <p className="text-sm text-emerald-400">Pathway complete! 🎉</p>
                              )}
                            </div>
                          </div>
                          
                          {/* Credits needed */}
                          {!primary?.isComplete && (
                            <div className="mt-3 pt-3 border-t border-slate-700">
                              <p className="text-sm text-slate-400">
                                <span className="text-amber-400 font-medium">
                                  {(primary.requiredCredits - primary.earnedCredits).toFixed(1)} credits needed
                                </span>
                                {' '}to complete {primary.pathway.name} pathway
                              </p>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
