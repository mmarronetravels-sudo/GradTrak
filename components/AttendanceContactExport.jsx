// ============================================
// AttendanceContactExport.jsx
// GradTrack — Attendance Contact CSV Export
// February 22, 2026
// ============================================
// Admin-only report showing all notes marked as
// attendance contacts. Preview table + CSV export
// formatted for Engage import.
//
// Usage in App.jsx:
//   import AttendanceContactExport from './components/AttendanceContactExport';
//
//   // In AdminDashboard, add tab + render block:
//   <AttendanceContactExport
//     supabaseClient={supabase}
//     schoolId={profile.school_id}
//   />
// ============================================

import React, { useState, useEffect, useMemo } from 'react';

// — Note type labels (matches StudentNotesLog) —
const NOTE_TYPES = {
  meeting:            { label: 'Meeting',           icon: '🤝' },
  phone_call:         { label: 'Phone Call',        icon: '📞' },
  zoom_meeting:       { label: 'Zoom Meeting',      icon: '💻' },
  email:              { label: 'Email',             icon: '📧' },
  text:               { label: 'Text Message',      icon: '💬' },
  parent_contact:     { label: 'Parent Contact',    icon: '👨‍👩‍👧' },
  intervention:       { label: 'Intervention',      icon: '🎯' },
  follow_up:          { label: 'Follow-Up',         icon: '📋' },
  general:            { label: 'General',           icon: '📝' },
  advising_plan:      { label: 'Advising Plan',     icon: '📊' },
  academic_contract:  { label: 'Academic Contract', icon: '📄' },
};

// — Date helpers —
function getSchoolYearStart() {
  const now = new Date();
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 7, 1); // Aug 1
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateISO(dateStr) {
  if (!dateStr) return '';
  return dateStr.slice(0, 10);
}

function getGradeLevel(graduationYear) {
  if (!graduationYear) return '—';
  const now = new Date();
  const currentYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  const grade = 12 - (graduationYear - currentYear);
  return grade >= 9 && grade <= 12 ? grade : '—';
}

export default function AttendanceContactExport({ supabaseClient, schoolId }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [counselorFilter, setCounselorFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  // Initialize date range to current school year → today
  useEffect(() => {
    const start = getSchoolYearStart();
    const today = new Date();
    setDateStart(start.toISOString().slice(0, 10));
    setDateEnd(today.toISOString().slice(0, 10));
  }, []);

  // — Fetch data —
  useEffect(() => {
    async function fetchData() {
      if (!schoolId || !dateStart || !dateEnd) return;
      setLoading(true);
      setError('');

      try {
        // 1. Fetch attendance contact notes in date range
        //    Use contact_date if set, otherwise fall back to created_at for range filtering
        const { data: notesData, error: notesErr } = await supabaseClient
          .from('student_notes')
          .select('id, student_id, counselor_id, note, note_type, status, created_at, contact_date, is_attendance_contact')
          .eq('is_attendance_contact', true)
          .gte('created_at', dateStart + 'T00:00:00')
          .lte('created_at', dateEnd + 'T23:59:59')
          .order('created_at', { ascending: false });

        if (notesErr) throw notesErr;

        // 2. Get unique student IDs and counselor IDs from notes
        const studentIds = [...new Set((notesData || []).map(n => n.student_id))];
        const counselorIds = [...new Set((notesData || []).map(n => n.counselor_id))];

        // 3. Fetch student profiles (with student_id_local for Engage matching)
        let studentMap = {};
        if (studentIds.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < studentIds.length; i += batchSize) {
            const batch = studentIds.slice(i, i + batchSize);
            const { data: profiles } = await supabaseClient
              .from('profiles')
              .select('id, full_name, student_id_local, graduation_year')
              .in('id', batch);
            (profiles || []).forEach(p => {
              studentMap[p.id] = {
                full_name: p.full_name || 'Unknown',
                student_id_local: p.student_id_local || '',
                grade: getGradeLevel(p.graduation_year),
              };
            });
          }
        }

        // 4. Fetch counselor names
        let counselorMap = {};
        if (counselorIds.length > 0) {
          const { data: counselors } = await supabaseClient
            .from('profiles')
            .select('id, full_name')
            .in('id', counselorIds);
          (counselors || []).forEach(c => {
            counselorMap[c.id] = c.full_name || 'Unknown';
          });
        }

        // 5. Merge everything into enriched note records
        const enriched = (notesData || []).map(note => ({
          ...note,
          student_name: studentMap[note.student_id]?.full_name || 'Unknown',
          student_id_local: studentMap[note.student_id]?.student_id_local || '',
          grade: studentMap[note.student_id]?.grade || '—',
          counselor_name: counselorMap[note.counselor_id] || 'Unknown',
          effective_date: note.contact_date || note.created_at?.slice(0, 10),
        }));

        setNotes(enriched);
      } catch (err) {
        console.error('Attendance export fetch error:', err);
        setError(err.message || 'Failed to load attendance contacts');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [schoolId, supabaseClient, dateStart, dateEnd]);

  // — Counselor list from loaded notes —
  const counselorList = useMemo(() => {
    const map = {};
    notes.forEach(n => {
      if (n.counselor_id && n.counselor_name && !map[n.counselor_id]) {
        map[n.counselor_id] = n.counselor_name;
      }
    });
    return Object.entries(map)
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [notes]);

  // — Filtered + sorted —
  const filteredNotes = useMemo(() => {
    let list = [...notes];

    if (counselorFilter !== 'all') {
      list = list.filter(n => n.counselor_id === counselorFilter);
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'date':
          cmp = (a.effective_date || '').localeCompare(b.effective_date || '');
          break;
        case 'student':
          cmp = (a.student_name || '').localeCompare(b.student_name || '');
          break;
        case 'grade':
          cmp = String(a.grade).localeCompare(String(b.grade));
          break;
        case 'counselor':
          cmp = (a.counselor_name || '').localeCompare(b.counselor_name || '');
          break;
        case 'type':
          cmp = (a.note_type || '').localeCompare(b.note_type || '');
          break;
        default:
          cmp = (a.effective_date || '').localeCompare(b.effective_date || '');
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [notes, counselorFilter, sortBy, sortDir]);

  // — Summary stats —
  const stats = useMemo(() => {
    const uniqueStudents = new Set(filteredNotes.map(n => n.student_id));
    const uniqueCounselors = new Set(filteredNotes.map(n => n.counselor_id));
    return {
      totalContacts: filteredNotes.length,
      uniqueStudents: uniqueStudents.size,
      uniqueCounselors: uniqueCounselors.size,
    };
  }, [filteredNotes]);

  // — Sort toggle —
  function toggleSort(column) {
    if (sortBy === column) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDir(column === 'student' ? 'asc' : 'desc');
    }
  }

  function getSortIndicator(column) {
    if (sortBy !== column) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  // — CSV Export —
  function exportCSV() {
    const headers = [
      'Student_ID',
      'Student_Name',
      'Grade',
      'Contact_Date',
      'Contact_Type',
      'Counselor_Name',
      'Note',
      'Status',
    ];

    const rows = filteredNotes.map(n => [
      n.student_id_local,
      n.student_name,
      n.grade,
      formatDateISO(n.effective_date),
      NOTE_TYPES[n.note_type]?.label || n.note_type || '',
      n.counselor_name,
      (n.note || '').replace(/[\r\n]+/g, ' '),
      n.status || '',
    ]);

    const csv = [headers, ...rows].map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Attendance_Contacts_${dateStart}_to_${dateEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // — Render —
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            📋 Attendance Contact Export
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Attendance contacts logged in GradTrack · Export CSV for Engage import
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportCSV}
            disabled={filteredNotes.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export CSV ({filteredNotes.length})
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">From</label>
          <input
            type="date"
            value={dateStart}
            onChange={e => setDateStart(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">To</label>
          <input
            type="date"
            value={dateEnd}
            onChange={e => setDateEnd(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5"
          />
        </div>
        {counselorList.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Counselor</label>
            <select
              value={counselorFilter}
              onChange={e => setCounselorFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5"
            >
              <option value="all">All Counselors</option>
              {counselorList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{stats.totalContacts}</p>
          <p className="text-xs text-slate-400 mt-1">Attendance Contacts</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-indigo-400">{stats.uniqueStudents}</p>
          <p className="text-xs text-slate-400 mt-1">Students Contacted</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-slate-300">{stats.uniqueCounselors}</p>
          <p className="text-xs text-slate-400 mt-1">Counselors</p>
        </div>
      </div>

      {/* Loading / Error states */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-3"></div>
            <p className="text-slate-400 text-sm">Loading attendance contacts...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Data table */}
      {!loading && !error && (
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-800/80">
                  <th
                    onClick={() => toggleSort('student')}
                    className="text-left px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-white"
                  >
                    Student{getSortIndicator('student')}
                  </th>
                  <th className="text-center px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                    ID
                  </th>
                  <th
                    onClick={() => toggleSort('grade')}
                    className="text-center px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-white"
                  >
                    Grade{getSortIndicator('grade')}
                  </th>
                  <th
                    onClick={() => toggleSort('date')}
                    className="text-left px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-white"
                  >
                    Contact Date{getSortIndicator('date')}
                  </th>
                  <th
                    onClick={() => toggleSort('type')}
                    className="text-left px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-white"
                  >
                    Type{getSortIndicator('type')}
                  </th>
                  <th
                    onClick={() => toggleSort('counselor')}
                    className="text-left px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-white"
                  >
                    Counselor{getSortIndicator('counselor')}
                  </th>
                  <th className="text-left px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                    Note
                  </th>
                  <th className="text-center px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredNotes.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center py-12 text-slate-500">
                      No attendance contacts found for this date range.
                    </td>
                  </tr>
                ) : (
                  filteredNotes.map((note, idx) => (
                    <tr
                      key={note.id}
                      className={`border-t border-slate-700/50 transition-colors hover:bg-slate-800/50 ${
                        idx % 2 === 0 ? '' : 'bg-slate-800/20'
                      }`}
                    >
                      {/* Student name */}
                      <td className="px-4 py-3">
                        <span className="text-white font-medium text-sm">{note.student_name}</span>
                      </td>

                      {/* Student ID */}
                      <td className="text-center px-3 py-3">
                        <span className="text-slate-400 text-xs font-mono">{note.student_id_local || '—'}</span>
                      </td>

                      {/* Grade */}
                      <td className="text-center px-3 py-3 text-slate-400 text-sm">{note.grade}</td>

                      {/* Contact date */}
                      <td className="px-3 py-3 text-slate-300 text-sm">{formatDate(note.effective_date)}</td>

                      {/* Contact type */}
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1 text-sm text-slate-300">
                          <span>{NOTE_TYPES[note.note_type]?.icon || '📝'}</span>
                          <span>{NOTE_TYPES[note.note_type]?.label || note.note_type || 'General'}</span>
                        </span>
                      </td>

                      {/* Counselor */}
                      <td className="px-3 py-3 text-slate-400 text-xs">{note.counselor_name}</td>

                      {/* Note text */}
                      <td className="px-3 py-3">
                        <span className="text-slate-400 text-xs line-clamp-2 max-w-[300px] block">
                          {note.note || '—'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="text-center px-3 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          note.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {note.status || 'open'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-slate-700/50 bg-slate-800/30">
            <p className="text-slate-500 text-xs">
              Showing {filteredNotes.length} attendance contact{filteredNotes.length !== 1 ? 's' : ''}
              {counselorFilter !== 'all' && ` for ${counselorList.find(c => c.id === counselorFilter)?.name || 'selected counselor'}`}
              {' · '}
              {dateStart && dateEnd && `${formatDate(dateStart)} — ${formatDate(dateEnd)}`}
            </p>
          </div>
        </div>
      )}

      {/* CSV column reference */}
      <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4">
        <p className="text-xs text-slate-500 font-medium mb-2">CSV Export Columns</p>
        <p className="text-xs text-slate-600">
          Student_ID · Student_Name · Grade · Contact_Date · Contact_Type · Counselor_Name · Note · Status
        </p>
        <p className="text-xs text-slate-600 mt-1">
          Student_ID matches the Engage local ID for import matching.
          Columns can be adjusted if Engage requires a different format.
        </p>
      </div>
    </div>
  );
}
