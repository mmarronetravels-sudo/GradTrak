// ============================================
// ContactSnapshotReport.jsx
// GradTrack — Contact Snapshot Report
// February 2026
// ============================================
// Shows # of contacts (notes) per counselor per month,
// with breakdown by note type. Admin sees all counselors,
// counselors see only their own data.
//
// CHANGELOG:
//   Feb 8  — Initial version
//   Feb 10 — Fixed school year to Aug–June (removed July)
//   Feb 10 — Fixed timezone bug: dateStringToKey() extracts YYYY-MM
//            from date strings instead of using new Date()
//   Feb 10 — Always show all 11 months (Aug–June)
//   Feb 20 — Added CSV export for counselor × month grid
//   Feb 20 — Added per-student contact breakdown view
//   Feb 20 — Added PDF export for per-student report
//   Feb 20 — FIX: Student view empty for counselors — RLS on profiles
//            blocks counselor from querying all students by school_id.
//            Now fetches counselor_assignments first, then fetches only
//            assigned student profiles. Eliminates race condition between
//            steps 3 and 4.
//
// Usage in App.jsx:
//   <ContactSnapshotReport
//     supabaseClient={supabase}
//     schoolId={profile.school_id}
//     userRole={profile.role}
//     userId={profile.id}
//   />
// ============================================

import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';

// —— Note type config ——
const NOTE_TYPES = {
  meeting:        { label: 'Meeting',        icon: '👥', color: '#6366f1' },
  phone_call:     { label: 'Phone Call',     icon: '📞', color: '#8b5cf6' },
  zoom_meeting:   { label: 'Zoom Meeting',   icon: '📹', color: '#14b8a6' },
  email:          { label: 'Email',          icon: '📧', color: '#3b82f6' },
  parent_contact: { label: 'Parent Contact', icon: '👨‍👩‍👧', color: '#f59e0b' },
  intervention:   { label: 'Intervention',   icon: '⚠️', color: '#ef4444' },
  follow_up:      { label: 'Follow-Up',      icon: '📋', color: '#10b981' },
  general:        { label: 'General',        icon: '📝', color: '#64748b' },
  advising_plan:  { label: 'Advising Plan',  icon: '📊', color: '#0ea5e9' },
};

// —— Month helpers ——
function getSchoolYearMonths() {
  // School year: August → June (11 months, no July)
  // Always show all 11 months so the grid is stable all year.
  const now = new Date();
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;

  const months = [];
  for (let m = 7; m <= 17; m++) {
    const actualMonth = m % 12;
    const actualYear = m >= 12 ? year + 1 : year;
    months.push(new Date(actualYear, actualMonth, 1));
  }
  return months;
}

function formatMonthShort(date) {
  return date.toLocaleDateString('en-US', { month: 'short' });
}

function formatMonthLong(date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function dateToKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// FIX (Feb 10): Extract YYYY-MM directly from date string to avoid timezone shift.
// "2026-02-01T00:00:00Z" → "2026-02" (not Jan 31 in Pacific time)
function dateStringToKey(dateStr) {
  if (!dateStr) return null;
  const match = String(dateStr).match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : null;
}

export default function ContactSnapshotReport({
  supabaseClient,
  schoolId,
  userRole,
  userId,
}) {
  const [rawData, setRawData] = useState([]);
  const [studentNotes, setStudentNotes] = useState([]);
  const [studentProfiles, setStudentProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedCounselor, setExpandedCounselor] = useState(null);
  const [activeView, setActiveView] = useState('grid'); // 'grid' or 'students'
  const [studentSortBy, setStudentSortBy] = useState('days_since'); // 'days_since', 'name', 'total', 'counselor'
  const [studentSortDir, setStudentSortDir] = useState('desc');
  const [studentFilter, setStudentFilter] = useState('all'); // 'all', 'no_contact', '30_days', '14_days'

  const months = useMemo(() => getSchoolYearMonths(), []);
  const isAdmin = userRole === 'admin';

  // —— Fetch data ——
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError('');
      try {
        // 1. Fetch counselor × month aggregated data (for grid view)
        const { data, error: rpcError } = await supabaseClient.rpc('get_contact_snapshot', {
          p_school_id: schoolId,
        });

        if (rpcError) {
          console.warn('RPC failed, falling back to direct query:', rpcError.message);
          const { data: fallbackData, error: fallbackError } = await supabaseClient
            .from('student_notes')
            .select(`
              id,
              counselor_id,
              note_type,
              created_at,
              profiles!student_notes_counselor_id_fkey (full_name)
            `)
            .gte('created_at', months[0]?.toISOString() || '2025-08-01');

          if (fallbackError) throw fallbackError;

          const aggregated = {};
          (fallbackData || []).forEach(row => {
            const monthKey = dateStringToKey(row.created_at);
            if (!monthKey) return;
            const key = `${row.counselor_id}|${monthKey}|${row.note_type || 'general'}`;
            if (!aggregated[key]) {
              aggregated[key] = {
                counselor_id: row.counselor_id,
                counselor_name: row.profiles?.full_name || 'Unknown',
                month_start: `${monthKey}-01`,
                note_type: row.note_type || 'general',
                contact_count: 0,
              };
            }
            aggregated[key].contact_count++;
          });
          setRawData(Object.values(aggregated));
        } else {
          setRawData(data || []);
        }

        // 2. Fetch per-student note data (for student breakdown view)
        const { data: notesData, error: notesError } = await supabaseClient
          .from('student_notes')
          .select('id, student_id, counselor_id, note_type, created_at, status');

        if (notesError) {
          console.warn('Student notes fetch error:', notesError.message);
        } else {
          setStudentNotes(notesData || []);
        }

        // ============================================
        // FIX (Feb 20): Fetch student profiles + assignments
        // ============================================
        // Previous bug: For counselors, querying profiles with .eq('school_id', schoolId)
        // returned 0 rows because the RLS policy on profiles only allows counselors to see
        // students they're assigned to — not all students at the school. The assignment
        // merge in step 4 then had nothing to map over → 0 students in the "By Student" view.
        //
        // Fix: Fetch counselor_assignments FIRST to get student IDs and counselor names,
        // then fetch only those student profiles. This works with RLS because counselors
        // CAN see their own assigned students' profiles.
        // ============================================

        // 3. Fetch counselor assignments (with counselor name)
        let assignmentsQuery = supabaseClient
          .from('counselor_assignments')
          .select('student_id, counselor_id, profiles!counselor_assignments_counselor_id_fkey (full_name)');

        // For non-admin, only fetch this counselor's assignments
        if (!isAdmin) {
          assignmentsQuery = assignmentsQuery.eq('counselor_id', userId);
        }

        const { data: assignmentsData, error: assignmentsError } = await assignmentsQuery;

        if (assignmentsError) {
          console.warn('Assignments fetch error:', assignmentsError.message);
        }

        // Build assignment lookup: student_id → { counselor_id, counselor_name }
        const assignmentMap = {};
        (assignmentsData || []).forEach(a => {
          // If a student has multiple assignments, keep the first one for display
          if (!assignmentMap[a.student_id]) {
            assignmentMap[a.student_id] = {
              counselor_id: a.counselor_id,
              counselor_name: a.profiles?.full_name || 'Unassigned',
            };
          }
        });

        // 4. Fetch student profiles — only the students we have assignments for
        const studentIds = Object.keys(assignmentMap);

        let profiles = [];
        if (studentIds.length > 0) {
          // Batch in groups of 100 to avoid URL length limits
          const batchSize = 100;
          for (let i = 0; i < studentIds.length; i += batchSize) {
            const batch = studentIds.slice(i, i + batchSize);
            const { data: profilesBatch, error: profilesError } = await supabaseClient
              .from('profiles')
              .select('id, full_name, grade_level')
              .in('id', batch)
              .eq('is_active', true);

            if (profilesError) {
              console.warn('Profiles batch fetch error:', profilesError.message);
            } else {
              profiles = profiles.concat(profilesBatch || []);
            }
          }
        }

        // Merge counselor info into profiles
        const mergedProfiles = profiles.map(s => ({
          ...s,
          counselor_id: assignmentMap[s.id]?.counselor_id || null,
          counselor_name: assignmentMap[s.id]?.counselor_name || 'Unassigned',
        }));

        setStudentProfiles(mergedProfiles);

      } catch (err) {
        console.error('Contact snapshot fetch error:', err);
        setError(err.message || 'Failed to load contact data');
      } finally {
        setLoading(false);
      }
    }
    if (schoolId) fetchData();
  }, [schoolId, supabaseClient]);

  // —— Process grid data (counselor × month) ——
  const { counselors, monthTotals, grandTotal, counselorData } = useMemo(() => {
    let filtered = rawData;
    if (!isAdmin) {
      filtered = rawData.filter(r => r.counselor_id === userId);
    }

    const counselorMap = {};
    filtered.forEach(r => {
      if (!counselorMap[r.counselor_id]) {
        counselorMap[r.counselor_id] = { id: r.counselor_id, name: r.counselor_name };
      }
    });
    const counselorList = Object.values(counselorMap).sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    );

    const cData = {};
    const mTotals = {};
    let gTotal = 0;

    filtered.forEach(r => {
      const mKey = dateStringToKey(r.month_start) || dateToKey(new Date(r.month_start));
      const cId = r.counselor_id;
      const count = Number(r.contact_count);

      if (!cData[cId]) cData[cId] = {};
      if (!cData[cId][mKey]) cData[cId][mKey] = { total: 0, byType: {} };
      cData[cId][mKey].total += count;
      cData[cId][mKey].byType[r.note_type] = (cData[cId][mKey].byType[r.note_type] || 0) + count;

      mTotals[mKey] = (mTotals[mKey] || 0) + count;
      gTotal += count;
    });

    return { counselors: counselorList, monthTotals: mTotals, grandTotal: gTotal, counselorData: cData };
  }, [rawData, isAdmin, userId]);

  // —— Process per-student data ——
  const studentContactData = useMemo(() => {
    const now = new Date();

    // Build per-student note summary
    const studentMap = {};
    studentNotes.forEach(note => {
      const sid = note.student_id;
      if (!studentMap[sid]) {
        studentMap[sid] = {
          studentId: sid,
          total: 0,
          lastContactDate: null,
          byType: {},
          byCounselor: {},
          openCount: 0,
        };
      }
      studentMap[sid].total++;
      if (note.status === 'open') studentMap[sid].openCount++;

      const noteDate = new Date(note.created_at);
      if (!studentMap[sid].lastContactDate || noteDate > studentMap[sid].lastContactDate) {
        studentMap[sid].lastContactDate = noteDate;
      }

      const type = note.note_type || 'general';
      studentMap[sid].byType[type] = (studentMap[sid].byType[type] || 0) + 1;
      studentMap[sid].byCounselor[note.counselor_id] = (studentMap[sid].byCounselor[note.counselor_id] || 0) + 1;
    });

    // Merge with student profiles
    // NOTE: studentProfiles is already filtered to assigned students for counselors
    // (the fetch query handles this), so we don't need to re-filter by counselor_id here.
    return studentProfiles.map(student => {
      const noteData = studentMap[student.id] || {
        total: 0, lastContactDate: null, byType: {}, byCounselor: {}, openCount: 0,
      };
      const daysSinceContact = noteData.lastContactDate
        ? Math.floor((now - noteData.lastContactDate) / 86400000)
        : 999;

      return {
        ...student,
        ...noteData,
        daysSinceContact,
      };
    });
    // No need for .filter() here — the fetch already scoped to this counselor's students
  }, [studentNotes, studentProfiles]);

  // —— Filtered + sorted student list ——
  const filteredStudents = useMemo(() => {
    let list = [...studentContactData];

    // Apply filter
    if (studentFilter === 'no_contact') {
      list = list.filter(s => s.total === 0);
    } else if (studentFilter === '30_days') {
      list = list.filter(s => s.daysSinceContact >= 30);
    } else if (studentFilter === '14_days') {
      list = list.filter(s => s.daysSinceContact >= 14);
    }

    // Apply sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (studentSortBy) {
        case 'name':
          cmp = (a.full_name || '').localeCompare(b.full_name || '');
          break;
        case 'total':
          cmp = a.total - b.total;
          break;
        case 'counselor':
          cmp = (a.counselor_name || '').localeCompare(b.counselor_name || '');
          break;
        case 'days_since':
        default:
          cmp = a.daysSinceContact - b.daysSinceContact;
          break;
      }
      return studentSortDir === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [studentContactData, studentFilter, studentSortBy, studentSortDir]);

  // —— Helpers ——
  function getCounselorTotal(counselorId) {
    const mData = counselorData[counselorId] || {};
    return Object.values(mData).reduce((sum, m) => sum + m.total, 0);
  }

  function toggleStudentSort(column) {
    if (studentSortBy === column) {
      setStudentSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setStudentSortBy(column);
      setStudentSortDir(column === 'name' || column === 'counselor' ? 'asc' : 'desc');
    }
  }

  function getSortIndicator(column) {
    if (studentSortBy !== column) return '';
    return studentSortDir === 'asc' ? ' ↑' : ' ↓';
  }

  // —— CSV Export (grid view) ——
  function exportGridCSV() {
    const headers = ['Counselor', ...months.map(m => formatMonthShort(m) + ' ' + m.getFullYear()), 'Total'];
    const rows = counselors.map(c => {
      const cMonths = counselorData[c.id] || {};
      const monthValues = months.map(m => {
        const mKey = dateToKey(m);
        return cMonths[mKey]?.total || 0;
      });
      return [c.name, ...monthValues, getCounselorTotal(c.id)];
    });

    // Totals row
    if (counselors.length > 1) {
      const totalsRow = ['ALL COUNSELORS', ...months.map(m => monthTotals[dateToKey(m)] || 0), grandTotal];
      rows.push(totalsRow);
    }

    const csvContent = [headers, ...rows].map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    downloadFile(csvContent, `Contact_Snapshot_Grid_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
  }

  // —— CSV Export (student view) ——
  function exportStudentCSV() {
    const headers = ['Student Name', 'Grade', 'Counselor', 'Total Contacts', 'Open Items', 'Last Contact', 'Days Since Contact',
      ...Object.values(NOTE_TYPES).map(t => t.label)
    ];

    const rows = filteredStudents.map(s => [
      s.full_name,
      s.grade_level || '',
      s.counselor_name || 'Unassigned',
      s.total,
      s.openCount,
      s.lastContactDate ? s.lastContactDate.toLocaleDateString('en-US') : 'Never',
      s.total === 0 ? 'N/A' : s.daysSinceContact,
      ...Object.keys(NOTE_TYPES).map(key => s.byType[key] || 0),
    ]);

    const csvContent = [headers, ...rows].map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    downloadFile(csvContent, `Contact_Snapshot_Students_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
  }

  // —— PDF Export (student view) ——
  function exportStudentPDF() {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let yPos = margin;

    const checkNewPage = (space = 20) => {
      if (yPos + space > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
        return true;
      }
      return false;
    };

    // Header
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Student Contact Report', pageWidth / 2, yPos, { align: 'center' });
    yPos += 7;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    const subtitle = isAdmin ? 'All Counselors' : 'My Caseload';
    const filterLabel = studentFilter === 'all' ? 'All Students'
      : studentFilter === 'no_contact' ? 'No Contact'
      : studentFilter === '30_days' ? '30+ Days Since Contact'
      : '14+ Days Since Contact';
    doc.text(`${subtitle} · ${filterLabel} · Generated ${new Date().toLocaleDateString('en-US')}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 10;

    // Summary stats
    const noContactCount = studentContactData.filter(s => s.total === 0).length;
    const over30Count = studentContactData.filter(s => s.daysSinceContact >= 30 && s.total > 0).length;
    const over14Count = studentContactData.filter(s => s.daysSinceContact >= 14 && s.daysSinceContact < 30 && s.total > 0).length;
    const activeCount = studentContactData.filter(s => s.daysSinceContact < 14).length;

    doc.setTextColor(0);
    doc.setFontSize(9);
    doc.text(`Total Students: ${studentContactData.length}    No Contact: ${noContactCount}    30+ Days: ${over30Count}    14-29 Days: ${over14Count}    Active (<14 Days): ${activeCount}`, margin, yPos);
    yPos += 10;

    // Table header
    const cols = isAdmin
      ? [{ label: 'Student', w: 55 }, { label: 'Gr', w: 15 }, { label: 'Counselor', w: 50 }, { label: 'Contacts', w: 25 }, { label: 'Open', w: 20 }, { label: 'Last Contact', w: 35 }, { label: 'Days', w: 20 }, { label: 'Status', w: 35 }]
      : [{ label: 'Student', w: 70 }, { label: 'Gr', w: 15 }, { label: 'Contacts', w: 30 }, { label: 'Open', w: 25 }, { label: 'Last Contact', w: 40 }, { label: 'Days', w: 25 }, { label: 'Status', w: 40 }];

    doc.setFillColor(30, 41, 59);
    doc.setTextColor(255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    let xPos = margin;
    cols.forEach(col => {
      doc.rect(xPos, yPos, col.w, 7, 'F');
      doc.text(col.label, xPos + 2, yPos + 5);
      xPos += col.w;
    });
    yPos += 7;

    // Table rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    filteredStudents.forEach((s, idx) => {
      checkNewPage(8);

      const bgColor = idx % 2 === 0 ? [255, 255, 255] : [248, 250, 252];
      doc.setFillColor(...bgColor);

      // Determine status label and color
      let statusLabel, statusColor;
      if (s.total === 0) {
        statusLabel = 'No Contact';
        statusColor = [239, 68, 68]; // red
      } else if (s.daysSinceContact >= 30) {
        statusLabel = '30+ Days';
        statusColor = [239, 68, 68]; // red
      } else if (s.daysSinceContact >= 14) {
        statusLabel = '14+ Days';
        statusColor = [245, 158, 11]; // amber
      } else {
        statusLabel = 'Active';
        statusColor = [16, 185, 129]; // green
      }

      xPos = margin;
      const rowData = isAdmin
        ? [
            s.full_name || 'Unknown',
            String(s.grade_level || ''),
            s.counselor_name || 'Unassigned',
            String(s.total),
            String(s.openCount),
            s.lastContactDate ? s.lastContactDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never',
            s.total === 0 ? '—' : String(s.daysSinceContact),
            statusLabel,
          ]
        : [
            s.full_name || 'Unknown',
            String(s.grade_level || ''),
            String(s.total),
            String(s.openCount),
            s.lastContactDate ? s.lastContactDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never',
            s.total === 0 ? '—' : String(s.daysSinceContact),
            statusLabel,
          ];

      cols.forEach((col, colIdx) => {
        doc.rect(xPos, yPos, col.w, 7, 'F');
        // Color the status cell
        if (colIdx === cols.length - 1) {
          doc.setTextColor(...statusColor);
          doc.setFont('helvetica', 'bold');
        } else {
          doc.setTextColor(0);
          doc.setFont('helvetica', 'normal');
        }
        const text = doc.splitTextToSize(rowData[colIdx], col.w - 4)[0] || '';
        doc.text(text, xPos + 2, yPos + 5);
        xPos += col.w;
      });
      yPos += 7;
    });

    // Footer
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Page ${i} of ${totalPages} | GradTrack Contact Report | ${new Date().toLocaleDateString()}`,
        pageWidth / 2, pageHeight - 8, { align: 'center' }
      );
    }

    doc.save(`Student_Contact_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  // —— Download helper ——
  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ========================================
  // RENDER
  // ========================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-indigo-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-slate-400 text-sm">Loading contact data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 m-4">
        <p className="text-red-400 text-sm">⚠️ {error}</p>
      </div>
    );
  }

  // —— Student stats for summary cards ——
  const noContactCount = studentContactData.filter(s => s.total === 0).length;
  const over30Count = studentContactData.filter(s => s.daysSinceContact >= 30 && s.total > 0).length;
  const recentCount = studentContactData.filter(s => s.daysSinceContact < 14).length;

  return (
    <div className="space-y-6">
      {/* —— Header —— */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>📊</span> Contact Snapshot
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            {isAdmin ? 'All counselors' : 'Your contacts'} · {months[0] && formatMonthLong(months[0])} – {months[months.length - 1] && formatMonthLong(months[months.length - 1])}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Export buttons */}
          <div className="flex items-center gap-2">
            {activeView === 'grid' ? (
              <button
                onClick={exportGridCSV}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded-lg transition-colors"
                title="Export grid as CSV"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                CSV
              </button>
            ) : (
              <>
                <button
                  onClick={exportStudentCSV}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded-lg transition-colors"
                  title="Export student data as CSV"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  CSV
                </button>
                <button
                  onClick={exportStudentPDF}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
                  title="Export student report as PDF"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  PDF
                </button>
              </>
            )}
          </div>
          {/* Total contacts badge */}
          <div className="bg-indigo-500/20 border border-indigo-500/30 rounded-xl px-4 py-2 text-center">
            <p className="text-2xl font-bold text-indigo-400">{grandTotal}</p>
            <p className="text-xs text-slate-400">Total Contacts</p>
          </div>
        </div>
      </div>

      {/* —— View Toggle —— */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveView('grid')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeView === 'grid'
              ? 'bg-cyan-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
          }`}
        >
          📅 Monthly Grid
        </button>
        <button
          onClick={() => setActiveView('students')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeView === 'students'
              ? 'bg-cyan-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
          }`}
        >
          👤 By Student
          {noContactCount > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs bg-red-500/20 text-red-400">
              {noContactCount} no contact
            </span>
          )}
        </button>
      </div>

      {/* ============================================ */}
      {/* GRID VIEW (existing, with timezone fix)     */}
      {/* ============================================ */}
      {activeView === 'grid' && (
        <>
          {/* Summary Cards (admin only) */}
          {isAdmin && counselors.length > 1 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {counselors.map(c => {
                const total = getCounselorTotal(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => setExpandedCounselor(expandedCounselor === c.id ? null : c.id)}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      expandedCounselor === c.id
                        ? 'bg-indigo-500/15 border-indigo-500/40'
                        : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800'
                    }`}
                  >
                    <p className="text-white font-medium text-sm truncate">{c.name}</p>
                    <p className="text-2xl font-bold text-indigo-400 mt-1">{total}</p>
                    <p className="text-slate-500 text-xs">contacts</p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Main Grid Table */}
          <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/80">
                    <th className="text-left px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider sticky left-0 bg-slate-800/80 z-10 min-w-[160px]">
                      Counselor
                    </th>
                    {months.map(m => (
                      <th key={dateToKey(m)} className="text-center px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider min-w-[60px]">
                        {formatMonthShort(m)}
                      </th>
                    ))}
                    <th className="text-center px-4 py-3 text-indigo-400 font-semibold text-xs uppercase tracking-wider min-w-[70px]">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {counselors.map((c) => {
                    const cMonths = counselorData[c.id] || {};
                    const cTotal = getCounselorTotal(c.id);
                    const isExpanded = expandedCounselor === c.id;

                    return (
                      <React.Fragment key={c.id}>
                        <tr
                          className={`border-t border-slate-700/50 cursor-pointer transition-colors ${
                            isExpanded ? 'bg-indigo-500/10' : 'hover:bg-slate-800/50'
                          }`}
                          onClick={() => setExpandedCounselor(isExpanded ? null : c.id)}
                        >
                          <td className="px-4 py-3 sticky left-0 bg-inherit z-10">
                            <div className="flex items-center gap-2">
                              <svg className={`w-3 h-3 text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                              </svg>
                              <span className="text-white font-medium">{c.name}</span>
                            </div>
                          </td>
                          {months.map(m => {
                            const mKey = dateToKey(m);
                            const count = cMonths[mKey]?.total || 0;
                            return (
                              <td key={mKey} className="text-center px-3 py-3">
                                {count > 0 ? (
                                  <span className={`inline-block min-w-[28px] px-2 py-0.5 rounded-lg text-xs font-semibold ${
                                    count >= 20 ? 'bg-green-500/20 text-green-400' :
                                    count >= 10 ? 'bg-indigo-500/20 text-indigo-400' :
                                    count >= 5 ? 'bg-slate-700 text-slate-300' :
                                    'text-slate-500'
                                  }`}>
                                    {count}
                                  </span>
                                ) : (
                                  <span className="text-slate-700">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="text-center px-4 py-3">
                            <span className="text-indigo-400 font-bold">{cTotal}</span>
                          </td>
                        </tr>

                        {/* Expanded: note type breakdown */}
                        {isExpanded && (
                          <>
                            {Object.entries(NOTE_TYPES).map(([typeKey, typeCfg]) => {
                              const hasAny = months.some(m => (cMonths[dateToKey(m)]?.byType?.[typeKey] || 0) > 0);
                              if (!hasAny) return null;

                              const typeTotal = months.reduce((sum, m) => sum + (cMonths[dateToKey(m)]?.byType?.[typeKey] || 0), 0);

                              return (
                                <tr key={`${c.id}-${typeKey}`} className="bg-slate-800/20 border-t border-slate-800/50">
                                  <td className="px-4 py-2 pl-10 sticky left-0 bg-inherit z-10">
                                    <span className="text-xs text-slate-400">{typeCfg.icon} {typeCfg.label}</span>
                                  </td>
                                  {months.map(m => {
                                    const count = cMonths[dateToKey(m)]?.byType?.[typeKey] || 0;
                                    return (
                                      <td key={dateToKey(m)} className="text-center px-3 py-2">
                                        {count > 0 ? <span className="text-xs text-slate-400">{count}</span> : <span className="text-slate-800">·</span>}
                                      </td>
                                    );
                                  })}
                                  <td className="text-center px-4 py-2">
                                    <span className="text-xs text-slate-400 font-medium">{typeTotal}</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Totals row */}
                  {counselors.length > 1 && (
                    <tr className="border-t-2 border-slate-600 bg-slate-800/60">
                      <td className="px-4 py-3 sticky left-0 bg-slate-800/60 z-10">
                        <span className="text-white font-semibold text-xs uppercase tracking-wider">All Counselors</span>
                      </td>
                      {months.map(m => {
                        const total = monthTotals[dateToKey(m)] || 0;
                        return (
                          <td key={dateToKey(m)} className="text-center px-3 py-3">
                            <span className="text-white font-semibold text-sm">{total || '—'}</span>
                          </td>
                        );
                      })}
                      <td className="text-center px-4 py-3">
                        <span className="text-indigo-400 font-bold text-base">{grandTotal}</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend + Color key */}
          <div className="flex flex-wrap justify-between gap-4 px-1">
            <div className="flex flex-wrap gap-3">
              {Object.entries(NOTE_TYPES).map(([key, cfg]) => (
                <span key={key} className="text-xs text-slate-500 flex items-center gap-1">
                  <span>{cfg.icon}</span> {cfg.label}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>Cell shading:</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-3 rounded bg-green-500/20"></span> 20+</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-3 rounded bg-indigo-500/20"></span> 10-19</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-3 rounded bg-slate-700"></span> 5-9</span>
              <span className="flex items-center gap-1"><span className="text-slate-500">4</span> 1-4</span>
            </div>
          </div>
        </>
      )}

      {/* ============================================ */}
      {/* STUDENT VIEW (new)                          */}
      {/* ============================================ */}
      {activeView === 'students' && (
        <>
          {/* Summary stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={() => setStudentFilter('all')}
              className={`text-left p-3 rounded-xl border transition-all ${
                studentFilter === 'all' ? 'bg-indigo-500/15 border-indigo-500/40' : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800'
              }`}
            >
              <p className="text-2xl font-bold text-indigo-400">{studentContactData.length}</p>
              <p className="text-xs text-slate-400">Total Students</p>
            </button>
            <button
              onClick={() => setStudentFilter('no_contact')}
              className={`text-left p-3 rounded-xl border transition-all ${
                studentFilter === 'no_contact' ? 'bg-red-500/15 border-red-500/40' : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800'
              }`}
            >
              <p className={`text-2xl font-bold ${noContactCount > 0 ? 'text-red-400' : 'text-slate-600'}`}>{noContactCount}</p>
              <p className="text-xs text-slate-400">No Contact</p>
            </button>
            <button
              onClick={() => setStudentFilter('30_days')}
              className={`text-left p-3 rounded-xl border transition-all ${
                studentFilter === '30_days' ? 'bg-amber-500/15 border-amber-500/40' : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800'
              }`}
            >
              <p className={`text-2xl font-bold ${over30Count > 0 ? 'text-amber-400' : 'text-slate-600'}`}>{over30Count}</p>
              <p className="text-xs text-slate-400">30+ Days Ago</p>
            </button>
            <button
              onClick={() => setStudentFilter(studentFilter === 'all' ? '14_days' : 'all')}
              className={`text-left p-3 rounded-xl border transition-all ${
                studentFilter === '14_days' ? 'bg-cyan-500/15 border-cyan-500/40' : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800'
              }`}
            >
              <p className="text-2xl font-bold text-emerald-400">{recentCount}</p>
              <p className="text-xs text-slate-400">Active (&lt;14 Days)</p>
            </button>
          </div>

          {/* Student table */}
          <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/80">
                    <th
                      className="text-left px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-slate-300 sticky left-0 bg-slate-800/80 z-10 min-w-[180px]"
                      onClick={() => toggleStudentSort('name')}
                    >
                      Student{getSortIndicator('name')}
                    </th>
                    {isAdmin && (
                      <th
                        className="text-left px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-slate-300 min-w-[140px]"
                        onClick={() => toggleStudentSort('counselor')}
                      >
                        Counselor{getSortIndicator('counselor')}
                      </th>
                    )}
                    <th
                      className="text-center px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-slate-300 min-w-[80px]"
                      onClick={() => toggleStudentSort('total')}
                    >
                      Contacts{getSortIndicator('total')}
                    </th>
                    <th className="text-center px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider min-w-[60px]">
                      Open
                    </th>
                    <th className="text-center px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider min-w-[100px]">
                      Last Contact
                    </th>
                    <th
                      className="text-center px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-slate-300 min-w-[80px]"
                      onClick={() => toggleStudentSort('days_since')}
                    >
                      Days{getSortIndicator('days_since')}
                    </th>
                    <th className="text-center px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider min-w-[90px]">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-slate-500">
                        No students match the current filter
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((s, idx) => {
                      let statusBadge;
                      if (s.total === 0) {
                        statusBadge = <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">No Contact</span>;
                      } else if (s.daysSinceContact >= 30) {
                        statusBadge = <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">30+ Days</span>;
                      } else if (s.daysSinceContact >= 14) {
                        statusBadge = <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">14+ Days</span>;
                      } else {
                        statusBadge = <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Active</span>;
                      }

                      return (
                        <tr key={s.id} className={`border-t border-slate-700/50 hover:bg-slate-800/50 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-800/20'}`}>
                          <td className="px-4 py-3 sticky left-0 bg-inherit z-10">
                            <div>
                              <span className="text-white font-medium">{s.full_name}</span>
                              {s.grade_level && <span className="text-slate-500 text-xs ml-2">Gr {s.grade_level}</span>}
                            </div>
                          </td>
                          {isAdmin && (
                            <td className="px-3 py-3 text-slate-400 text-xs">{s.counselor_name || 'Unassigned'}</td>
                          )}
                          <td className="text-center px-3 py-3">
                            {s.total > 0 ? (
                              <span className={`inline-block min-w-[28px] px-2 py-0.5 rounded-lg text-xs font-semibold ${
                                s.total >= 20 ? 'bg-green-500/20 text-green-400' :
                                s.total >= 10 ? 'bg-indigo-500/20 text-indigo-400' :
                                s.total >= 5 ? 'bg-slate-700 text-slate-300' :
                                'text-slate-500'
                              }`}>
                                {s.total}
                              </span>
                            ) : (
                              <span className="text-slate-700">0</span>
                            )}
                          </td>
                          <td className="text-center px-3 py-3">
                            {s.openCount > 0 ? (
                              <span className="text-amber-400 text-xs font-medium">{s.openCount}</span>
                            ) : (
                              <span className="text-slate-700">—</span>
                            )}
                          </td>
                          <td className="text-center px-3 py-3 text-xs text-slate-400">
                            {s.lastContactDate
                              ? s.lastContactDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              : <span className="text-slate-600">Never</span>
                            }
                          </td>
                          <td className="text-center px-3 py-3">
                            {s.total === 0 ? (
                              <span className="text-slate-700">—</span>
                            ) : (
                              <span className={`text-xs font-medium ${
                                s.daysSinceContact >= 30 ? 'text-red-400' :
                                s.daysSinceContact >= 14 ? 'text-amber-400' :
                                'text-slate-400'
                              }`}>
                                {s.daysSinceContact}
                              </span>
                            )}
                          </td>
                          <td className="text-center px-3 py-3">{statusBadge}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Student count footer */}
          <p className="text-xs text-slate-500 px-1">
            Showing {filteredStudents.length} of {studentContactData.length} students
          </p>
        </>
      )}

      {/* —— Empty state —— */}
      {counselors.length === 0 && studentContactData.length === 0 && !loading && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-slate-400 text-sm">No contact records found for this period.</p>
          <p className="text-slate-600 text-xs mt-1">Notes added from the student detail view will appear here.</p>
        </div>
      )}
    </div>
  );
}
