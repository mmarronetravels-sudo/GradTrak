
import React, { useState, useEffect, useMemo } from 'react';

// ── Note type config ──
const NOTE_TYPES = {
  meeting:        { label: 'Meeting',        icon: '🤝', color: '#6366f1' },
  phone_call:     { label: 'Phone Call',     icon: '📞', color: '#8b5cf6' },
  email:          { label: 'Email',          icon: '📧', color: '#3b82f6' },
  parent_contact: { label: 'Parent Contact', icon: '👨‍👩‍👧', color: '#f59e0b' },
  intervention:   { label: 'Intervention',   icon: '🎯', color: '#ef4444' },
  follow_up:      { label: 'Follow-Up',      icon: '📋', color: '#10b981' },
  general:        { label: 'General',        icon: '📝', color: '#64748b' },
  advising_plan:  { label: 'Advising Plan',  icon: '📊', color: '#0ea5e9' },
};

// ── Month helpers ──
function getSchoolYearMonths() {
  // School year: August → June (11 months, no July)
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

export default function ContactSnapshotReport({
  supabaseClient,
  schoolId,
  userRole,
  userId,
}) {
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedCounselor, setExpandedCounselor] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null); // for mobile drill-down

  const months = useMemo(() => getSchoolYearMonths(), []);
  const isAdmin = userRole === 'admin';

  // ── Fetch data ──
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError('');
      try {
        // Use the SQL function if available, otherwise fall back to direct query
        const { data, error: rpcError } = await supabaseClient.rpc('get_contact_snapshot', {
          p_school_id: schoolId,
        });

        if (rpcError) {
          // Fallback: direct query if function doesn't exist yet
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
            .gte('created_at', months[0]?.toISOString() || '2025-07-01');

          if (fallbackError) throw fallbackError;

          // Transform fallback data to match RPC shape
          const aggregated = {};
          (fallbackData || []).forEach(row => {
            const monthKey = dateToKey(new Date(row.created_at));
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
      } catch (err) {
        console.error('Contact snapshot fetch error:', err);
        setError(err.message || 'Failed to load contact data');
      } finally {
        setLoading(false);
      }
    }
    if (schoolId) fetchData();
  }, [schoolId, supabaseClient]);

  // ── Process data ──
  const { counselors, monthTotals, grandTotal, counselorData } = useMemo(() => {
    // Filter to just this user if not admin
    let filtered = rawData;
    if (!isAdmin) {
      filtered = rawData.filter(r => r.counselor_id === userId);
    }

    // Build unique counselor list
    const counselorMap = {};
    filtered.forEach(r => {
      if (!counselorMap[r.counselor_id]) {
        counselorMap[r.counselor_id] = {
          id: r.counselor_id,
          name: r.counselor_name,
        };
      }
    });
    const counselorList = Object.values(counselorMap).sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    );

    // Build per-counselor, per-month, per-type lookup
    // counselorData[counselorId][monthKey] = { total, byType: { meeting: 3, ... } }
    const cData = {};
    const mTotals = {};
    let gTotal = 0;

    filtered.forEach(r => {
      const mKey = dateToKey(new Date(r.month_start));
      const cId = r.counselor_id;
      const count = Number(r.contact_count);

      if (!cData[cId]) cData[cId] = {};
      if (!cData[cId][mKey]) cData[cId][mKey] = { total: 0, byType: {} };
      cData[cId][mKey].total += count;
      cData[cId][mKey].byType[r.note_type] = (cData[cId][mKey].byType[r.note_type] || 0) + count;

      mTotals[mKey] = (mTotals[mKey] || 0) + count;
      gTotal += count;
    });

    return {
      counselors: counselorList,
      monthTotals: mTotals,
      grandTotal: gTotal,
      counselorData: cData,
    };
  }, [rawData, isAdmin, userId]);

  // ── Counselor total across all months ──
  function getCounselorTotal(counselorId) {
    const mData = counselorData[counselorId] || {};
    return Object.values(mData).reduce((sum, m) => sum + m.total, 0);
  }

  // ── Render ──
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

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>📊</span> Contact Snapshot
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            {isAdmin ? 'All counselors' : 'Your contacts'} · {months[0] && formatMonthLong(months[0])} – {months[months.length - 1] && formatMonthLong(months[months.length - 1])}
          </p>
        </div>
        <div className="bg-indigo-500/20 border border-indigo-500/30 rounded-xl px-4 py-2 text-center">
          <p className="text-2xl font-bold text-indigo-400">{grandTotal}</p>
          <p className="text-xs text-slate-400">Total Contacts</p>
        </div>
      </div>

      {/* ── Summary Cards (admin only) ── */}
      {isAdmin && counselors.length > 1 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {counselors.map(c => {
            const total = getCounselorTotal(c.id);
            const lastName = (c.name || '').split(' ').pop();
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

      {/* ── Main Grid Table ── */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80">
                <th className="text-left px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider sticky left-0 bg-slate-800/80 z-10 min-w-[160px]">
                  Counselor
                </th>
                {months.map(m => (
                  <th
                    key={dateToKey(m)}
                    className="text-center px-3 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wider min-w-[60px]"
                  >
                    {formatMonthShort(m)}
                  </th>
                ))}
                <th className="text-center px-4 py-3 text-indigo-400 font-semibold text-xs uppercase tracking-wider min-w-[70px]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {counselors.map((c, idx) => {
                const cMonths = counselorData[c.id] || {};
                const cTotal = getCounselorTotal(c.id);
                const isExpanded = expandedCounselor === c.id;

                return (
                  <React.Fragment key={c.id}>
                    {/* ── Counselor row ── */}
                    <tr
                      className={`border-t border-slate-700/50 cursor-pointer transition-colors ${
                        isExpanded ? 'bg-indigo-500/10' : 'hover:bg-slate-800/50'
                      }`}
                      onClick={() => setExpandedCounselor(isExpanded ? null : c.id)}
                    >
                      <td className="px-4 py-3 sticky left-0 bg-inherit z-10">
                        <div className="flex items-center gap-2">
                          <svg
                            className={`w-3 h-3 text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            fill="currentColor" viewBox="0 0 20 20"
                          >
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

                    {/* ── Expanded: note type breakdown ── */}
                    {isExpanded && (
                      <>
                        {Object.entries(NOTE_TYPES).map(([typeKey, typeCfg]) => {
                          // Check if this counselor has any of this type
                          const hasAny = months.some(m => {
                            const mKey = dateToKey(m);
                            return (cMonths[mKey]?.byType?.[typeKey] || 0) > 0;
                          });
                          if (!hasAny) return null;

                          const typeTotal = months.reduce((sum, m) => {
                            const mKey = dateToKey(m);
                            return sum + (cMonths[mKey]?.byType?.[typeKey] || 0);
                          }, 0);

                          return (
                            <tr key={`${c.id}-${typeKey}`} className="bg-slate-800/20 border-t border-slate-800/50">
                              <td className="px-4 py-2 pl-10 sticky left-0 bg-inherit z-10">
                                <span className="text-xs text-slate-400">
                                  {typeCfg.icon} {typeCfg.label}
                                </span>
                              </td>
                              {months.map(m => {
                                const mKey = dateToKey(m);
                                const count = cMonths[mKey]?.byType?.[typeKey] || 0;
                                return (
                                  <td key={mKey} className="text-center px-3 py-2">
                                    {count > 0 ? (
                                      <span className="text-xs text-slate-400">{count}</span>
                                    ) : (
                                      <span className="text-slate-800">·</span>
                                    )}
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

              {/* ── Totals row ── */}
              {counselors.length > 1 && (
                <tr className="border-t-2 border-slate-600 bg-slate-800/60">
                  <td className="px-4 py-3 sticky left-0 bg-slate-800/60 z-10">
                    <span className="text-white font-semibold text-xs uppercase tracking-wider">All Counselors</span>
                  </td>
                  {months.map(m => {
                    const mKey = dateToKey(m);
                    const total = monthTotals[mKey] || 0;
                    return (
                      <td key={mKey} className="text-center px-3 py-3">
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

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-3 px-1">
        {Object.entries(NOTE_TYPES).map(([key, cfg]) => (
          <span key={key} className="text-xs text-slate-500 flex items-center gap-1">
            <span>{cfg.icon}</span> {cfg.label}
          </span>
        ))}
      </div>

      {/* ── Empty state ── */}
      {counselors.length === 0 && !loading && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-slate-400 text-sm">No contact records found for this period.</p>
          <p className="text-slate-600 text-xs mt-1">Notes added from the student detail view will appear here.</p>
        </div>
      )}

      {/* ── Color key ── */}
      <div className="flex items-center gap-4 text-xs text-slate-500 px-1">
        <span>Cell shading:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-3 rounded bg-green-500/20"></span> 20+
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-3 rounded bg-indigo-500/20"></span> 10-19
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-3 rounded bg-slate-700"></span> 5-9
        </span>
        <span className="flex items-center gap-1">
          <span className="text-slate-500">4</span> 1-4
        </span>
      </div>
    </div>
  );
}
