import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';

function termToDate(term) {
  if (!term) return null;
  const parts = term.trim().split(' ');
  if (parts.length < 2) return null;

  const trimester = parts[0].toUpperCase();
  const yearPart = parts[1];

  let year;
  if (yearPart.includes('/')) {
    const [startYr, endYr] = yearPart.split('/');
    const s = parseInt(startYr);
    const e = parseInt(endYr);
    year = s < 100 ? 2000 + s : s;
    const endYear = e < 100 ? 2000 + e : e;
    if (trimester === 'T1' || trimester === 'S1') year = year;
    else year = endYear;
  } else {
    year = parseInt(yearPart);
    if (year < 100) year += 2000;
  }

  // Map trimester/semester to approximate completion month
  switch (trimester) {
    case 'T1': return new Date(year, 10, 1);  // Nov
    case 'T2': return new Date(year, 1, 1);   // Feb
    case 'T3': return new Date(year, 5, 1);   // Jun
    case 'SU': return new Date(year, 6, 1);   // Jul
    case 'S1': return new Date(year, 0, 1);   // Jan
    case 'S2': return new Date(year, 5, 1);   // Jun
    default:   return new Date(year, 5, 1);   // Default to Jun
  }
}

function formatMonth(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function CreditProgressTimeline({ courses, totalRequired, graduationYear }) {
  const chartData = useMemo(() => {
    if (!courses || courses.length === 0 || !totalRequired) return [];

    const gradYear = parseInt(graduationYear) || new Date().getFullYear() + 1;
    const startDate = new Date(gradYear - 4, 7, 1);  // Aug 1 of freshman year
    const endDate = new Date(gradYear, 5, 30);        // Jun 30 of senior year
    const totalMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
                        (endDate.getMonth() - startDate.getMonth());

    const completed = courses
      .filter(c => c.status === 'completed' && c.grade !== 'F' && c.grade !== 'NP')
      .map(c => {
        const date = termToDate(c.term);
        return date ? { date, credits: Number(c.credits) || 0 } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.date - b.date);

    if (completed.length === 0) return [];

    // Build monthly buckets across the full 4-year span
    const monthBuckets = {};
    for (let i = 0; i <= totalMonths; i++) {
      const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const pace = totalRequired * (i / totalMonths);
      monthBuckets[key] = { month: key, earned: 0, pace: Math.round(pace * 100) / 100 };
    }

    // Place credits into their term-derived month
    completed.forEach(c => {
      const key = `${c.date.getFullYear()}-${String(c.date.getMonth() + 1).padStart(2, '0')}`;
      if (monthBuckets[key]) {
        monthBuckets[key].earned += c.credits;
      }
    });

    // Convert to cumulative
    const keys = Object.keys(monthBuckets).sort();
    let runningTotal = 0;

    // Credits earned before the timeline starts
    completed.forEach(c => {
      const key = `${c.date.getFullYear()}-${String(c.date.getMonth() + 1).padStart(2, '0')}`;
      if (key < keys[0]) runningTotal += c.credits;
    });

    keys.forEach(key => {
      runningTotal += monthBuckets[key].earned;
      monthBuckets[key].earned = Math.round(runningTotal * 1000) / 1000;
    });

    // Only show months up to current month (don't project future earned)
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return keys
      .filter(k => k <= currentKey || monthBuckets[k].pace > 0)
      .map(k => monthBuckets[k]);
  }, [courses, totalRequired, graduationYear]);

  if (chartData.length === 0) {
    return (
      <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-3xl p-6 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">📊</span>
          <h2 className="text-lg font-bold text-white">Credit Progress Timeline</h2>
        </div>
        <p className="text-slate-500 text-sm">No completed courses to chart yet.</p>
      </div>
    );
  }

  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const currentData = chartData.find(d => d.month === currentMonth);
  const isAhead = currentData && currentData.earned >= currentData.pace;

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;
    const diff = data.earned - data.pace;
    return (
      <div className="bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 shadow-xl">
        <p className="text-slate-300 text-xs font-medium mb-1">{formatMonth(data.month + '-01')}</p>
        <p className="text-white text-sm">
          <span className="text-indigo-400 font-bold">{data.earned}</span> credits earned
        </p>
        <p className="text-slate-400 text-xs">
          {data.pace.toFixed(1)} expected · {' '}
          <span className={diff >= 0 ? 'text-emerald-400' : 'text-amber-400'}>
            {diff >= 0 ? '+' : ''}{diff.toFixed(1)} {diff >= 0 ? 'ahead' : 'behind'}
          </span>
        </p>
      </div>
    );
  };

  return (
    <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-3xl p-6 border border-slate-700/50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📊</span>
          <h2 className="text-lg font-bold text-white">Credit Progress Timeline</h2>
        </div>
        {currentData && (
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${
            isAhead ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
          }`}>
            {isAhead ? 'On Pace' : 'Behind Pace'}
          </span>
        )}
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="earnedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              tickFormatter={(v) => formatMonth(v + '-01')}
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={{ stroke: '#334155' }}
              tickLine={false}
              interval={5}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              domain={[0, totalRequired]}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={totalRequired}
              stroke="#334155"
              strokeDasharray="4 4"
              label={{ value: `${totalRequired} required`, position: 'right', fill: '#64748b', fontSize: 10 }}
            />
            <Area
              type="stepAfter"
              dataKey="pace"
              stroke="#475569"
              strokeDasharray="6 3"
              fill="none"
              dot={false}
              name="Expected Pace"
            />
            <Area
              type="stepAfter"
              dataKey="earned"
              stroke="#818cf8"
              strokeWidth={2}
              fill="url(#earnedGradient)"
              dot={false}
              name="Credits Earned"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-center gap-6 mt-3 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-indigo-400 rounded" /> Earned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 border-t-2 border-dashed border-slate-500" /> Expected Pace
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 border-t border-dashed border-slate-600" /> Graduation Requirement
        </span>
      </div>
    </div>
  );
}
