import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';

function getSchoolYearStart(graduationYear) {
  return new Date(graduationYear - 4, 7, 1); // Aug 1 of freshman year
}

function getSchoolYearEnd(graduationYear) {
  return new Date(graduationYear, 5, 30); // Jun 30 of senior year
}

function formatMonth(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function CreditProgressTimeline({ courses, totalRequired, graduationYear }) {
  const chartData = useMemo(() => {
    if (!courses || courses.length === 0 || !totalRequired) return [];

    const completed = courses
      .filter(c => c.status === 'completed' && c.grade !== 'F' && c.grade !== 'NP' && c.completed_at)
      .map(c => ({
        date: new Date(c.completed_at),
        credits: Number(c.credits) || 0,
      }))
      .sort((a, b) => a.date - b.date);

    if (completed.length === 0) return [];

    const startDate = getSchoolYearStart(parseInt(graduationYear) || new Date().getFullYear() + 1);
    const endDate = getSchoolYearEnd(parseInt(graduationYear) || new Date().getFullYear() + 1);
    const totalMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());

    const monthBuckets = {};
    let cumulative = 0;

    // Add credits from courses completed BEFORE the timeline starts
    completed.forEach(c => {
      if (c.date < startDate) {
        cumulative += c.credits;
      }
    });

    // Build monthly data points
    for (let i = 0; i <= totalMonths; i++) {
      const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const pace = totalRequired * (i / totalMonths);
      monthBuckets[key] = { month: key, earned: cumulative, pace: Math.round(pace * 100) / 100 };
    }

    // Accumulate credits into their completion months
    completed.forEach(c => {
      if (c.date < startDate) return;
      const key = `${c.date.getFullYear()}-${String(c.date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthBuckets[key]) return;
      cumulative += c.credits;
      // Update this month and all future months
      const keys = Object.keys(monthBuckets).sort();
      const idx = keys.indexOf(key);
      for (let j = idx; j < keys.length; j++) {
        monthBuckets[keys[j]].earned = Math.round(
          (j === idx ? cumulative : monthBuckets[keys[j]].earned + c.credits) * 1000
        ) / 1000;
      }
    });

    // Simpler approach: just re-walk and compute cumulative
    const keys = Object.keys(monthBuckets).sort();
    let runningTotal = 0;

    // Count pre-start credits
    completed.forEach(c => {
      if (c.date < startDate) runningTotal += c.credits;
    });

    keys.forEach(key => {
      const monthCredits = completed
        .filter(c => {
          const ck = `${c.date.getFullYear()}-${String(c.date.getMonth() + 1).padStart(2, '0')}`;
          return ck === key && c.date >= startDate;
        })
        .reduce((sum, c) => sum + c.credits, 0);
      runningTotal += monthCredits;
      monthBuckets[key].earned = Math.round(runningTotal * 1000) / 1000;
    });

    return keys.map(k => monthBuckets[k]);
  }, [courses, totalRequired, graduationYear]);

  if (chartData.length === 0) {
    return (
      <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-3xl p-6 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">📊</span>
          <h2 className="text-lg font-bold text-white">Credit Progress Timeline</h2>
        </div>
        <p className="text-slate-500 text-sm">No completed courses with dates to chart yet.</p>
      </div>
    );
  }

  const latest = chartData[chartData.length - 1];
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
              type="monotone"
              dataKey="pace"
              stroke="#475569"
              strokeDasharray="6 3"
              fill="none"
              dot={false}
              name="Expected Pace"
            />
            <Area
              type="monotone"
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
