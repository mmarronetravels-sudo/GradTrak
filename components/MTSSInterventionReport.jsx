// ============================================
// MTSSInterventionReport.jsx
// GradTrack — MTSS Intervention Tracker
// February 22, 2026
// ============================================
// Shows students with intervention notes, sorted by count.
// Helps counselors identify students who may need MTSS referral.
//
// Usage in App.jsx:
//   import MTSSInterventionReport from './components/MTSSInterventionReport';
//
//   <MTSSInterventionReport
//     supabaseClient={supabase}
//     schoolId={profile.school_id}
//     userRole={profile.role}
//     userId={profile.id}
//     isAdmin={profile.role === 'admin'}
//     onSelectStudent={(student) => { ... }}
//   />
// ============================================

import React, { useState, useEffect, useMemo } from 'react';

// — Note type config (matches StudentNotesLog) —
const NOTE_TYPES = {
  meeting:        { label: 'Meeting',        icon: '🤝', color: '#6366f1' },
  phone_call:     { label: 'Phone Call',     icon: '📞', color: '#8b5cf6' },
  zoom_meeting:   { label: 'Zoom Meeting',   icon: '💻', color: '#06b6d4' },
  email:          { label: 'Email',          icon: '📧', color: '#3b82f6' },
  text:           { label: 'Text Message',   icon: '💬', color: '#a855f7' },
  parent_contact: { label: 'Parent Contact', icon: '👨‍👩‍👧', color: '#f59e0b' },
  intervention:   { label: 'Intervention',   icon: '🎯', color: '#ef4444' },
  follow_up:      { label: 'Follow-Up',      icon: '📋', color: '#10b981' },
  general:        { label: 'General',        icon: '📝', color: '#64748b' },
  advising_plan:  { label: 'Advising Plan',  icon: '📊', color: '#0ea5e9' },
  academic_contract: { label: 'Academic Contract', icon: '📄', color: '#f97316' },
};

const MTSS_THRESHOLD = 5;

// — Date helpers —
function getSchoolYearStart() {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 6, 1); // July 1
}

function getSchoolYearEnd() {
  const start = getSchoolYearStart();
  return new Date(start.getFullYear() + 1, 5, 30); // June 30
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysSince(dateStr) {
  if (!dateStr) return 999;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - d) / 86400000);
}

function getGradeLevel(graduationYear) {
  if (!graduationYear) return '—';
  const now = new Date();
  const currentYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  const grade = 12 - (graduationYear - currentYear);
  return grade >= 9 && grade <= 12 ? grade : '—';
}

export default function MTSSInterventionReport({
  supabaseClient,
  schoolId,
  userRole,
  userId,
  isAdmin = false,
  onSelectStudent,
}) {
  const [notes, setNotes] = useState([]);
  const [studentProfiles, setStudentProfiles] = useState([]);
  const [counselorList, setCounselorList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [counselorFilter, setCounselorFilter] = useState('all');
  const [sortBy, setSortBy] = useState('interventions');
  const [sortDir, setSortDir] = useState('desc');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [showAllStudents, setShowAllStudents] = useState(false);

  // Initialize date range to current school year
  useEffect(() => {
    const start = getSchoolYearStart();
    const end = getSchoolYearEnd();
    const today = new Date();
    setDateStart(start.toISOString().slice(0, 10));
    setDateEnd((today < end ? today : end).toISOString().slice(0, 10));
  }, []);

  // — Fetch data —
  useEffect(() => {
    async function fetchData() {
      if (!schoolId || !dateStart || !dateEnd) return;
      setLoading(true);
      setError('');

      try {
        // 1. Fetch all notes in date range
        const { data: notesData, error: notesError } = await supabaseClient
          .from('student_notes')
          .select('id, student_id, counselor_id, note_type, status, created_at, contact_date, is_attendance_contact')
          .gte('created_at', dateStart + 'T00:00:00')
          .lte('created_at', dateEnd + 'T23:59:59');

        if (notesError) throw notesError;
        setNotes(notesData || []);

        // 2. Fetch counselor assignments to get student→counselor mapping
        const { data: assignmentsData } = await supabaseClient
          .from('counselor_assignments')
          .select('student_id, counselor_id, profiles!counselor_assignments_counselor_id_fkey (full_name)');

        const assignmentMap = {};
        (assignmentsData || []).forEach(a => {
          if (!assignmentMap[a.student_id]) {
            assignmentMap[a.student_id] = {
              counselor_id: a.counselor_id,
              counselor_name: a.profiles?.full_name || 'Unassigned',
            };
          }
        });

        // Build unique counselor list from assignments
        const counselorMap = {};
        (assignmentsData || []).forEach(a => {
          if (a.profiles?.full_name && !counselorMap[a.counselor_id]) {
            counselorMap[a.counselor_id] = a.profiles.full_name;
          }
        });
        setCounselorList(
          Object.entries(counselorMap)
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );

        // 3. Get student IDs that have at least one note
        const studentIdsWithNotes = [...new Set((notesData || []).map(n => n.student_id))];

        // 4. Fetch student profiles
        let profiles = [];
        if (studentIdsWithNotes.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < studentIdsWithNotes.length; i += batchSize) {
            const batch = studentIdsWithNotes.slice(i, i + batchSize);
            const { data: profilesBatch } = await supabaseClient
              .from('profiles')
              .select('id, full_name, email, graduation_year, is_active')
              .in('id', batch)
              .eq('is_active', true);
            if (profilesBatch) profiles = profiles.concat(profilesBatch);
          }
        }

        // Merge counselor info
        const mergedProfiles = profiles.map(s => ({
          ...s,
          grade: getGradeLevel(s.graduation_year),
          counselor_id: assignmentMap[s.id]?.counselor_id || null,
          counselor_name: assignmentMap[s.id]?.counselor_name || 'Unassigned',
        }));

        setStudentProfiles(mergedProfiles);
      } catch (err) {
        console.error('MTSS report fetch error:', err);
        setError(err.message || 'Failed to load intervention data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [schoolId, supabaseClient, dateStart, dateEnd]);

  // — Process data —
  const studentData = useMemo(() => {
    const studentMap = {};

    // Build per-student note summary
    notes.forEach(note => {
      const sid = note.student_id;
      if (!studentMap[sid]) {
        studentMap[sid] = {
          interventionCount: 0,
          totalContacts: 0,
          byType: {},
          firstIntervention: null,
          lastIntervention: null,
          openInterventions: 0,
        };
      }

      studentMap[sid].totalContacts++;
      const type = note.note_type || 'general';
      studentMap[sid].byType[type] = (studentMap[sid].byType[type] || 0) + 1;

      if (type === 'intervention') {
        studentMap[sid].interventionCount++;
        if (note.status === 'open') studentMap[sid].openInterventions++;

        const noteDate = note.contact_date || note.created_at;
        if (!studentMap[sid].firstIntervention || noteDate < studentMap[sid].firstIntervention) {
          studentMap[sid].firstIntervention = noteDate;
        }
        if (!studentMap[sid].lastIntervention || noteDate > studentMap[sid].lastIntervention) {
          studentMap[sid].lastIntervention = noteDate;
        }
      }
    });

    // Merge with student profiles
    return studentProfiles
      .map(student => {
        const noteData = studentMap[student.id] || {
          interventionCount: 0,
          totalContacts: 0,
          byType: {},
          firstIntervention: null,
          lastIntervention: null,
          openInterventions: 0,
        };
        return {
          ...student,
          ...noteData,
          daysSinceLast: daysSince(noteData.lastIntervention),
        };
      })
      .filter(s => showAllStudents || s.interventionCount > 0);
  }, [notes, studentProfiles, showAllStudents]);

  // — Filtered + sorted —
  const filteredStudents = useMemo(() => {
    let list = [...studentData];

    // Counselor filter
    if (counselorFilter !== 'all') {
      list = list.filter(s => s.counselor_id === counselorFilter);
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'interventions':
          cmp = a.interventionCount - b.interventionCount;
          break;
        case 'total':
          cmp = a.totalContacts - b.totalContacts;
          break;
        case 'name':
          cmp = (a.full_name || '').localeCompare(b.full_name || '');
          break;
        case 'grade':
          cmp = String(a.grade).localeCompare(String(b.grade));
          break;
        case 'last':
          cmp = a.daysSinceLast - b.daysSinceLast;
          break;
        default:
          cmp = a.interventionCount - b.interventionCount;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [studentData, counselorFilter, sortBy, sortDir]);

  // — Summary stats —
  const summaryStats = useMemo(() => {
    const withInterventions = studentData.filter(s => s.interventionCount > 0);
    const aboveThreshold = withInterventions.filter(s => s.interventionCount >= MTSS_THRESHOLD);
    const totalInterventions = withInterventions.reduce((sum, s) => sum + s.interventionCount, 0);
    return {
      studentsWithInterventions: withInterventions.length,
      aboveThreshold: aboveThreshold.length,
      totalInterventions,
      avgInterventions: withInterventions.length > 0
        ? Math.round((totalInterventions / withInterventions.length) * 10) / 10
        : 0,
    };
  }, [studentData]);

  // — Sort toggle —
  function toggleSort(column) {
    if (sortBy === column) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDir(column === 'name' ? 'asc' : 'desc');
    }
  }

  function getSortIndicator(column) {
    if (sortBy !== column) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  // — CSV Export —
  function exportCSV() {
    const noteTypeKeys = Object.keys(NOTE_TYPES);
    const headers = [
      'Student Name',
      'Grade',
      'Counselor',
      'Interventions',
      'Total Contacts',
      ...noteTypeKeys.map(k => NOTE_TYPES[k].label),
      'First Intervention',
      'Last Intervention',
      'Days Since Last',
      'Open Interventions',
    ];

    const rows = filteredStudents.map(s => [
      s.full_name,
      s.grade,
      s.counselor_name,
      s.interventionCount,
      s.totalContacts,
      ...noteTypeKeys.map(k => s.byType[k] || 0),
      s.firstIntervention ? formatDate(s.firstIntervention) : '',
      s.lastIntervention ? formatDate(s.lastIntervention) : '',
      s.interventionCount > 0 ? s.daysSinceLast : '',
      s.openInterventions,
    ]);

    const csv = [headers, ...rows].map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MTSS_Intervention_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // — Render —
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-4xl mb-3">⚠️</p>
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            🔍 MTSS Intervention Tracker
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Students with intervention notes — {MTSS_THRESHOLD}+ may warrant MTSS referral
          </p>
        </div>
        <button
          onClick={exportCSV}
          disabled={filteredStudents.length === 0}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          📥 Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Date range */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">From</label>
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">To</label>
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm"
          />
        </div>

        {/* Counselor filter */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Counselor</label>
          <select
            value={counselorFilter}
            onChange={(e) => setCounselorFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-sm"
          >
            <option value="all">All Counselors</option>
            {counselorList.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Show all students toggle */}
        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer hover:text-slate-300 pb-1">
          <input
            type="checkbox"
            checked={showAllStudents}
            onChange={(e) => setShowAllStudents(e.target.checked)}
            className="rounded border-slate-600 bg-slate-700 text-indigo-500"
          />
          Include students with 0 interventions
        </label>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 rounded-2xl p-4 border border-slate-800">
          <p className="text-2xl font-bold text-white">{summaryStats.studentsWithInterventions}</p>
          <p className="text-slate-400 text-xs mt-1">Students with Interventions</p>
        </div>
        <div className="bg-red-500/10 rounded-2xl p-4 border border-red-500/20">
          <p className="text-2xl font-bold text-red-400">{summaryStats.aboveThreshold}</p>
          <p className="text-slate-400 text-xs mt-1">{MTSS_THRESHOLD}+ Interventions</p>
        </div>
        <div className="bg-indigo-500/10 rounded-2xl p-4 border border-indigo-500/20">
          <p className="text-2xl font-bold text-indigo-400">{summaryStats.totalInterventions}</p>
          <p className="text-slate-400 text-xs mt-1">Total Interventions</p>
        </div>
        <div className="bg-amber-500/10 rounded-2xl p-4 border border-amber-500/20">
          <p className="text-2xl font-bold text-amber-400">{summaryStats.avgInterventions}</p>
          <p className="text-slate-400 text-xs mt-1">Avg per Student</p>
        </div>
      </div>

      {/* Data table */}
      {filteredStudents.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-slate-400 text-sm">No students with intervention notes found in this date range.</p>
          <p className="text-slate-600 text-xs mt-1">Intervention notes are added from the student detail view.</p>
        </div>
      ) : (
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/80">
                  <th
                    onClick={() => toggleSort('name')}
                    className="text-left px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-white min-w-[180px]"
                  >
                    Student{getSortIndicator('name')}
                  </th>
                  <th
                    onClick={() => toggleSort('grade')}
                    className="text-center px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-white"
                  >
                    Grade{getSortIndicator('grade')}
                  </th>
                  <th className="text-left px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider min-w-[120px]">
                    Counselor
                  </th>
                  <th
                    onClick={() => toggleSort('interventions')}
                    className="text-center px-3 py-3 text-red-400 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-red-300"
                  >
                    🎯 Interventions{getSortIndicator('interventions')}
                  </th>
                  <th
                    onClick={() => toggleSort('total')}
                    className="text-center px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-white"
                  >
                    Total Contacts{getSortIndicator('total')}
                  </th>
                  {/* Note type breakdown columns */}
                  {Object.entries(NOTE_TYPES).filter(([key]) => key !== 'intervention').map(([key, cfg]) => (
                    <th key={key} className="text-center px-2 py-3 text-slate-500 font-semibold text-xs uppercase tracking-wider" title={cfg.label}>
                      {cfg.icon}
                    </th>
                  ))}
                  <th className="text-center px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider min-w-[90px]">
                    First
                  </th>
                  <th
                    onClick={() => toggleSort('last')}
                    className="text-center px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-white min-w-[90px]"
                  >
                    Last{getSortIndicator('last')}
                  </th>
                  <th className="text-center px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                    Open
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student, idx) => {
                  const isAboveThreshold = student.interventionCount >= MTSS_THRESHOLD;
                  return (
                    <tr
                      key={student.id}
                      className={`border-t border-slate-700/50 transition-colors ${
                        isAboveThreshold
                          ? 'bg-red-500/5 hover:bg-red-500/10'
                          : 'hover:bg-slate-800/50'
                      }`}
                    >
                      {/* Student name */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onSelectStudent && onSelectStudent(student)}
                          className="text-left hover:text-indigo-400 transition-colors"
                        >
                          <span className="text-white font-medium">{student.full_name}</span>
                          {isAboveThreshold && (
                            <span className="ml-2 inline-block px-1.5 py-0.5 bg-red-500/20 text-red-400 text-xs rounded font-medium">
                              MTSS
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Grade */}
                      <td className="text-center px-3 py-3 text-slate-400">{student.grade}</td>

                      {/* Counselor */}
                      <td className="px-3 py-3 text-slate-400 text-xs">{student.counselor_name}</td>

                      {/* Interventions */}
                      <td className="text-center px-3 py-3">
                        <span className={`inline-block min-w-[32px] px-2 py-1 rounded-lg text-sm font-bold ${
                          student.interventionCount >= MTSS_THRESHOLD
                            ? 'bg-red-500/20 text-red-400'
                            : student.interventionCount >= 3
                              ? 'bg-amber-500/20 text-amber-400'
                              : student.interventionCount > 0
                                ? 'bg-slate-700 text-slate-300'
                                : 'text-slate-600'
                        }`}>
                          {student.interventionCount}
                        </span>
                      </td>

                      {/* Total contacts */}
                      <td className="text-center px-3 py-3">
                        <span className="text-slate-300">{student.totalContacts}</span>
                      </td>

                      {/* Note type breakdown */}
                      {Object.entries(NOTE_TYPES).filter(([key]) => key !== 'intervention').map(([key]) => {
                        const count = student.byType[key] || 0;
                        return (
                          <td key={key} className="text-center px-2 py-3">
                            {count > 0 ? (
                              <span className="text-xs text-slate-400">{count}</span>
                            ) : (
                              <span className="text-slate-800">·</span>
                            )}
                          </td>
                        );
                      })}

                      {/* First intervention */}
                      <td className="text-center px-3 py-3 text-slate-500 text-xs">
                        {formatDate(student.firstIntervention)}
                      </td>

                      {/* Last intervention */}
                      <td className="text-center px-3 py-3 text-slate-500 text-xs">
                        {student.lastIntervention ? (
                          <span>
                            {formatDate(student.lastIntervention)}
                            <span className="block text-slate-600 text-[10px]">
                              {student.daysSinceLast}d ago
                            </span>
                          </span>
                        ) : '—'}
                      </td>

                      {/* Open interventions */}
                      <td className="text-center px-3 py-3">
                        {student.openInterventions > 0 ? (
                          <span className="inline-block px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full font-medium">
                            {student.openInterventions}
                          </span>
                        ) : (
                          <span className="text-slate-700">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Results count */}
          <div className="px-4 py-3 border-t border-slate-700/50 bg-slate-800/30">
            <p className="text-slate-500 text-xs">
              Showing {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
              {counselorFilter !== 'all' && ` for ${counselorList.find(c => c.id === counselorFilter)?.name || 'selected counselor'}`}
              {' · '}
              {dateStart && dateEnd && `${formatDate(dateStart)} — ${formatDate(dateEnd)}`}
            </p>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 px-1">
        <span className="text-xs text-slate-500">Note type columns:</span>
        {Object.entries(NOTE_TYPES).filter(([key]) => key !== 'intervention').map(([key, cfg]) => (
          <span key={key} className="text-xs text-slate-500 flex items-center gap-1">
            {cfg.icon} {cfg.label}
          </span>
        ))}
      </div>

      {/* Threshold key */}
      <div className="flex items-center gap-4 text-xs text-slate-500 px-1">
        <span>Intervention counts:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-3 rounded bg-red-500/20"></span> {MTSS_THRESHOLD}+ (MTSS)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-3 rounded bg-amber-500/20"></span> 3-{MTSS_THRESHOLD - 1}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-3 rounded bg-slate-700"></span> 1-2
        </span>
      </div>
    </div>
  );
}
