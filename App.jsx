import React, { useState, useEffect, useMemo } from 'react';

// ============================================
// DATA & CONSTANTS
// ============================================

const GRADUATION_REQUIREMENTS = {
  english: { required: 4, label: 'English', icon: '📚' },
  math: { required: 4, label: 'Mathematics', icon: '📐' },
  science: { required: 3, label: 'Science', icon: '🔬' },
  history: { required: 3, label: 'Social Studies', icon: '🌍' },
  language: { required: 2, label: 'World Language', icon: '🗣️' },
  arts: { required: 1, label: 'Fine Arts', icon: '🎨' },
  pe: { required: 1, label: 'PE/Health', icon: '⚡' },
  electives: { required: 6, label: 'Electives', icon: '✨' }
};

const TOTAL_REQUIRED = Object.values(GRADUATION_REQUIREMENTS).reduce((sum, cat) => sum + cat.required, 0);

// Mock users database
const USERS_DB = {
  students: [
    { id: 's1', email: 'emma@school.edu', password: 'demo123', name: 'Emma Rodriguez', grade: 11, graduationYear: 2026, avatar: '👩🏽‍🎓' },
    { id: 's2', email: 'james@school.edu', password: 'demo123', name: 'James Chen', grade: 12, graduationYear: 2025, avatar: '👨🏻‍🎓' },
    { id: 's3', email: 'aisha@school.edu', password: 'demo123', name: 'Aisha Johnson', grade: 10, graduationYear: 2027, avatar: '👩🏿‍🎓' },
    { id: 's4', email: 'miguel@school.edu', password: 'demo123', name: 'Miguel Santos', grade: 11, graduationYear: 2026, avatar: '👨🏽‍🎓' },
    { id: 's5', email: 'sarah@school.edu', password: 'demo123', name: 'Sarah Kim', grade: 12, graduationYear: 2025, avatar: '👩🏻‍🎓' },
  ],
  counselors: [
    { id: 'c1', email: 'counselor@school.edu', password: 'admin123', name: 'Dr. Patricia Williams', role: 'counselor', avatar: '👩🏾‍💼' },
  ]
};

// Mock courses database per student
const COURSES_DB = {
  's1': [
    { id: 1, name: 'English Composition I', credits: 1, category: 'english', term: 'Fall 2024', isDualCredit: true, dualCreditType: 'transfer', grade: 'A' },
    { id: 2, name: 'Algebra II', credits: 1, category: 'math', term: 'Fall 2024', isDualCredit: false, dualCreditType: null, grade: 'B+' },
    { id: 3, name: 'Biology', credits: 1, category: 'science', term: 'Fall 2024', isDualCredit: true, dualCreditType: 'both', grade: 'A-' },
    { id: 4, name: 'US History', credits: 1, category: 'history', term: 'Fall 2024', isDualCredit: false, dualCreditType: null, grade: 'B' },
    { id: 5, name: 'Spanish II', credits: 1, category: 'language', term: 'Spring 2024', isDualCredit: false, dualCreditType: null, grade: 'A' },
    { id: 6, name: 'Pre-Calculus', credits: 1, category: 'math', term: 'Spring 2024', isDualCredit: true, dualCreditType: 'transfer', grade: 'B+' },
    { id: 7, name: 'Chemistry', credits: 1, category: 'science', term: 'Spring 2024', isDualCredit: true, dualCreditType: 'associate', grade: 'A' },
    { id: 8, name: 'Art History', credits: 1, category: 'arts', term: 'Fall 2023', isDualCredit: false, dualCreditType: null, grade: 'A' },
    { id: 9, name: 'World Literature', credits: 1, category: 'english', term: 'Fall 2023', isDualCredit: false, dualCreditType: null, grade: 'B+' },
    { id: 10, name: 'Intro to Business', credits: 1, category: 'electives', term: 'Fall 2023', isDualCredit: true, dualCreditType: 'associate', grade: 'A-' },
  ],
  's2': [
    { id: 1, name: 'AP English Literature', credits: 1, category: 'english', term: 'Fall 2024', isDualCredit: true, dualCreditType: 'transfer', grade: 'A' },
    { id: 2, name: 'Calculus', credits: 1, category: 'math', term: 'Fall 2024', isDualCredit: true, dualCreditType: 'transfer', grade: 'A-' },
    { id: 3, name: 'Physics', credits: 1, category: 'science', term: 'Fall 2024', isDualCredit: true, dualCreditType: 'transfer', grade: 'B+' },
    { id: 4, name: 'Economics', credits: 1, category: 'history', term: 'Fall 2024', isDualCredit: true, dualCreditType: 'both', grade: 'A' },
    { id: 5, name: 'French III', credits: 1, category: 'language', term: 'Spring 2024', isDualCredit: false, dualCreditType: null, grade: 'A' },
    { id: 6, name: 'English III', credits: 1, category: 'english', term: 'Fall 2023', isDualCredit: false, dualCreditType: null, grade: 'A-' },
    { id: 7, name: 'Algebra II', credits: 1, category: 'math', term: 'Fall 2023', isDualCredit: false, dualCreditType: null, grade: 'B+' },
    { id: 8, name: 'Chemistry', credits: 1, category: 'science', term: 'Fall 2023', isDualCredit: false, dualCreditType: null, grade: 'A' },
    { id: 9, name: 'World History', credits: 1, category: 'history', term: 'Spring 2023', isDualCredit: false, dualCreditType: null, grade: 'B' },
    { id: 10, name: 'French II', credits: 1, category: 'language', term: 'Spring 2023', isDualCredit: false, dualCreditType: null, grade: 'A' },
    { id: 11, name: 'Band', credits: 1, category: 'arts', term: 'Fall 2022', isDualCredit: false, dualCreditType: null, grade: 'A' },
    { id: 12, name: 'PE', credits: 1, category: 'pe', term: 'Fall 2022', isDualCredit: false, dualCreditType: null, grade: 'A' },
    { id: 13, name: 'Computer Science', credits: 1, category: 'electives', term: 'Spring 2024', isDualCredit: true, dualCreditType: 'both', grade: 'A' },
    { id: 14, name: 'Statistics', credits: 1, category: 'math', term: 'Spring 2024', isDualCredit: true, dualCreditType: 'transfer', grade: 'A-' },
    { id: 15, name: 'Journalism', credits: 1, category: 'electives', term: 'Fall 2023', isDualCredit: false, dualCreditType: null, grade: 'B+' },
    { id: 16, name: 'Psychology', credits: 1, category: 'electives', term: 'Spring 2024', isDualCredit: true, dualCreditType: 'transfer', grade: 'A' },
  ],
  's3': [
    { id: 1, name: 'English I', credits: 1, category: 'english', term: 'Fall 2024', isDualCredit: false, dualCreditType: null, grade: 'B' },
    { id: 2, name: 'Geometry', credits: 1, category: 'math', term: 'Fall 2024', isDualCredit: false, dualCreditType: null, grade: 'C+' },
    { id: 3, name: 'Biology', credits: 1, category: 'science', term: 'Fall 2024', isDualCredit: false, dualCreditType: null, grade: 'B-' },
    { id: 4, name: 'World Geography', credits: 1, category: 'history', term: 'Fall 2024', isDualCredit: false, dualCreditType: null, grade: 'B' },
  ],
  's4': [
    { id: 1, name: 'English II', credits: 1, category: 'english', term: 'Fall 2024', isDualCredit: false, dualCreditType: null, grade: 'C' },
    { id: 2, name: 'Algebra I', credits: 1, category: 'math', term: 'Fall 2024', isDualCredit: false, dualCreditType: null, grade: 'D+' },
    { id: 3, name: 'Earth Science', credits: 1, category: 'science', term: 'Fall 2024', isDualCredit: false, dualCreditType: null, grade: 'C-' },
    { id: 4, name: 'US History', credits: 1, category: 'history', term: 'Fall 2024', isDualCredit: false, dualCreditType: null, grade: 'C' },
    { id: 5, name: 'Spanish I', credits: 1, category: 'language', term: 'Spring 2024', isDualCredit: false, dualCreditType: null, grade: 'D' },
  ],
  's5': [
    { id: 1, name: 'AP English', credits: 1, category: 'english', term: 'Fall 2024', isDualCredit: true, dualCreditType: 'transfer', grade: 'A' },
    { id: 2, name: 'AP Calculus', credits: 1, category: 'math', term: 'Fall 2024', isDualCredit: true, dualCreditType: 'transfer', grade: 'A' },
    { id: 3, name: 'AP Chemistry', credits: 1, category: 'science', term: 'Fall 2024', isDualCredit: true, dualCreditType: 'transfer', grade: 'A-' },
    { id: 4, name: 'AP US History', credits: 1, category: 'history', term: 'Fall 2024', isDualCredit: true, dualCreditType: 'transfer', grade: 'A' },
    { id: 5, name: 'Korean III', credits: 1, category: 'language', term: 'Spring 2024', isDualCredit: false, dualCreditType: null, grade: 'A' },
    { id: 6, name: 'English III', credits: 1, category: 'english', term: 'Fall 2023', isDualCredit: false, dualCreditType: null, grade: 'A' },
    { id: 7, name: 'Pre-Calculus', credits: 1, category: 'math', term: 'Fall 2023', isDualCredit: false, dualCreditType: null, grade: 'A' },
    { id: 8, name: 'Biology', credits: 1, category: 'science', term: 'Fall 2023', isDualCredit: false, dualCreditType: null, grade: 'A' },
    { id: 9, name: 'World History', credits: 1, category: 'history', term: 'Spring 2023', isDualCredit: false, dualCreditType: null, grade: 'A' },
    { id: 10, name: 'Korean II', credits: 1, category: 'language', term: 'Spring 2023', isDualCredit: false, dualCreditType: null, grade: 'A' },
    { id: 11, name: 'Orchestra', credits: 1, category: 'arts', term: 'Fall 2022', isDualCredit: false, dualCreditType: null, grade: 'A' },
    { id: 12, name: 'PE', credits: 1, category: 'pe', term: 'Fall 2022', isDualCredit: false, dualCreditType: null, grade: 'A' },
    { id: 13, name: 'Robotics', credits: 1, category: 'electives', term: 'Spring 2024', isDualCredit: true, dualCreditType: 'both', grade: 'A' },
    { id: 14, name: 'Economics', credits: 1, category: 'electives', term: 'Fall 2023', isDualCredit: true, dualCreditType: 'transfer', grade: 'A' },
    { id: 15, name: 'Speech', credits: 1, category: 'electives', term: 'Spring 2023', isDualCredit: false, dualCreditType: null, grade: 'A' },
  ],
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function calculateStudentStats(courses) {
  const creditsByCategory = Object.keys(GRADUATION_REQUIREMENTS).reduce((acc, cat) => {
    acc[cat] = courses.filter(c => c.category === cat).reduce((sum, c) => sum + c.credits, 0);
    return acc;
  }, {});

  const totalEarned = courses.reduce((sum, c) => sum + c.credits, 0);
  const percentage = Math.round((totalEarned / TOTAL_REQUIRED) * 100);

  const dualCreditCourses = courses.filter(c => c.isDualCredit);
  const associateCredits = dualCreditCourses.filter(c => c.dualCreditType === 'associate' || c.dualCreditType === 'both').reduce((sum, c) => sum + c.credits, 0);
  const transferCredits = dualCreditCourses.filter(c => c.dualCreditType === 'transfer' || c.dualCreditType === 'both').reduce((sum, c) => sum + c.credits, 0);

  // Calculate deficiencies
  const deficiencies = [];
  Object.entries(GRADUATION_REQUIREMENTS).forEach(([key, req]) => {
    const earned = creditsByCategory[key];
    if (earned < req.required) {
      deficiencies.push({
        category: key,
        label: req.label,
        needed: req.required - earned,
        earned,
        required: req.required
      });
    }
  });

  return {
    creditsByCategory,
    totalEarned,
    percentage,
    associateCredits,
    transferCredits,
    deficiencies,
    isOnTrack: percentage >= 50,
    totalDualCredits: dualCreditCourses.reduce((sum, c) => sum + c.credits, 0)
  };
}

function generateAlerts(student, stats) {
  const alerts = [];
  const gradeLevel = student.grade;

  // Expected progress by grade
  const expectedProgress = { 9: 25, 10: 50, 11: 75, 12: 100 };
  const expected = expectedProgress[gradeLevel] || 100;

  if (stats.percentage < expected - 15) {
    alerts.push({
      type: 'critical',
      message: `Significantly behind on credits (${stats.percentage}% vs expected ${expected}%)`,
      icon: '🚨'
    });
  } else if (stats.percentage < expected - 5) {
    alerts.push({
      type: 'warning',
      message: `Slightly behind expected progress for grade ${gradeLevel}`,
      icon: '⚠️'
    });
  }

  // Check for missing required categories
  stats.deficiencies.forEach(def => {
    if (def.earned === 0 && gradeLevel >= 10) {
      alerts.push({
        type: 'warning',
        message: `No credits yet in ${def.label}`,
        icon: '📋'
      });
    }
  });

  // Positive alerts
  if (stats.percentage >= expected && stats.totalDualCredits >= 3) {
    alerts.push({
      type: 'success',
      message: `On track with ${stats.totalDualCredits} dual credits!`,
      icon: '🌟'
    });
  }

  return alerts;
}

// ============================================
// UI COMPONENTS
// ============================================

function CircularProgress({ percentage, size = 120, strokeWidth = 10, color = '#10b981', bgColor = '#1e293b', children }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={bgColor} strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

function ProgressBar({ earned, required, color }) {
  const percentage = Math.min((earned / required) * 100, 100);
  return (
    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percentage}%`, backgroundColor: color }} />
    </div>
  );
}

function DualCreditBadge({ type }) {
  const styles = {
    associate: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Associate' },
    transfer: { bg: 'bg-sky-500/20', text: 'text-sky-400', label: 'Transfer' },
    both: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Both' }
  };
  const style = styles[type];
  return <span className={`text-xs px-2 py-1 rounded-full font-medium ${style.bg} ${style.text}`}>{style.label}</span>;
}

function AlertBanner({ alerts }) {
  if (alerts.length === 0) return null;

  const typeColors = {
    critical: 'bg-red-500/10 border-red-500/30 text-red-400',
    warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
  };

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => (
        <div key={i} className={`rounded-xl p-3 border ${typeColors[alert.type]} flex items-center gap-3`}>
          <span className="text-lg">{alert.icon}</span>
          <span className="text-sm font-medium">{alert.message}</span>
        </div>
      ))}
    </div>
  );
}

function CategoryCard({ category, data, earnedCredits, onClick }) {
  const percentage = Math.min((earnedCredits / data.required) * 100, 100);
  const isComplete = earnedCredits >= data.required;

  return (
    <button onClick={onClick}
      className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-4 text-left hover:bg-slate-800/70 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] border border-slate-700/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{data.icon}</span>
        {isComplete && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full font-medium">✓</span>}
      </div>
      <h3 className="text-white font-semibold mb-1 text-sm">{data.label}</h3>
      <p className="text-slate-400 text-xs mb-3">{earnedCredits} / {data.required}</p>
      <ProgressBar earned={earnedCredits} required={data.required} color={isComplete ? '#10b981' : '#6366f1'} />
    </button>
  );
}

function CourseItem({ course, onDelete, showDelete = true }) {
  return (
    <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-white font-medium">{course.name}</h4>
            {course.isDualCredit && <DualCreditBadge type={course.dualCreditType} />}
            {course.grade && <span className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-300">{course.grade}</span>}
          </div>
          <div className="flex items-center gap-3 mt-2 text-sm text-slate-400">
            <span>{GRADUATION_REQUIREMENTS[course.category]?.label}</span>
            <span>•</span>
            <span>{course.term}</span>
          </div>
        </div>
        {showDelete && onDelete && (
          <button onClick={() => onDelete(course.id)} className="text-slate-500 hover:text-red-400 transition-colors p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================
// MODALS
// ============================================

function AddCourseModal({ isOpen, onClose, onAdd }) {
  const [formData, setFormData] = useState({
    name: '', credits: 1, category: 'english', term: 'Spring 2025',
    isDualCredit: false, dualCreditType: 'transfer', grade: 'A'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd({ ...formData, id: Date.now(), dualCreditType: formData.isDualCredit ? formData.dualCreditType : null });
    setFormData({ name: '', credits: 1, category: 'english', term: 'Spring 2025', isDualCredit: false, dualCreditType: 'transfer', grade: 'A' });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-slate-700">
        <div className="sticky top-0 bg-slate-900 p-6 pb-4 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Add Course</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-2">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Course Name</label>
            <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              placeholder="e.g., English Literature" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Credits</label>
              <select value={formData.credits} onChange={(e) => setFormData({ ...formData, credits: Number(e.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500">
                {[0.5, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Term</label>
              <select value={formData.term} onChange={(e) => setFormData({ ...formData, term: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500">
                {['Fall 2024', 'Spring 2025', 'Fall 2025', 'Spring 2026'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Grade</label>
              <select value={formData.grade} onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500">
                {['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
            <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500">
              {Object.entries(GRADUATION_REQUIREMENTS).map(([key, val]) => <option key={key} value={key}>{val.icon} {val.label}</option>)}
            </select>
          </div>

          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={formData.isDualCredit} onChange={(e) => setFormData({ ...formData, isDualCredit: e.target.checked })}
                className="w-5 h-5 rounded bg-slate-700 border-slate-600 text-indigo-500" />
              <div>
                <span className="text-white font-medium">Dual Credit Course</span>
                <p className="text-slate-400 text-sm">This course earns college credit</p>
              </div>
            </label>

            {formData.isDualCredit && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <label className="block text-sm font-medium text-slate-300 mb-3">Credit applies toward:</label>
                <div className="space-y-2">
                  {[{ value: 'associate', label: 'Associate Degree' }, { value: 'transfer', label: 'Transfer Degree' }, { value: 'both', label: 'Both Degrees' }].map(option => (
                    <label key={option.value} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-slate-700/50">
                      <input type="radio" name="dualCreditType" value={option.value} checked={formData.dualCreditType === option.value}
                        onChange={(e) => setFormData({ ...formData, dualCreditType: e.target.value })}
                        className="w-4 h-4 text-indigo-500 bg-slate-700 border-slate-600" />
                      <span className="text-white">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button type="submit"
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-4 rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all active:scale-[0.98]">
            Add Course
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================
// PDF TRANSCRIPT EXPORT
// ============================================

function TranscriptModal({ isOpen, onClose, student, courses, stats }) {
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePDF = () => {
    setIsGenerating(true);

    // Group courses by term
    const coursesByTerm = courses.reduce((acc, course) => {
      if (!acc[course.term]) acc[course.term] = [];
      acc[course.term].push(course);
      return acc;
    }, {});

    // Build HTML content for PDF
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Transcript - ${student.name}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; }
          .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #4f46e5; }
          .header h1 { color: #4f46e5; font-size: 28px; margin-bottom: 5px; }
          .header p { color: #64748b; }
          .student-info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; padding: 20px; background: #f8fafc; border-radius: 8px; }
          .student-info div { }
          .student-info label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
          .student-info p { font-size: 16px; font-weight: 600; color: #1e293b; }
          .progress-section { margin-bottom: 30px; padding: 20px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); border-radius: 8px; color: white; }
          .progress-section h2 { margin-bottom: 15px; }
          .progress-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
          .progress-item { text-align: center; background: rgba(255,255,255,0.1); padding: 10px; border-radius: 6px; }
          .progress-item .number { font-size: 24px; font-weight: bold; }
          .progress-item .label { font-size: 11px; opacity: 0.9; }
          .term-section { margin-bottom: 25px; }
          .term-section h3 { color: #4f46e5; font-size: 14px; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 1px solid #e2e8f0; }
          .course-table { width: 100%; border-collapse: collapse; }
          .course-table th { text-align: left; padding: 8px 12px; background: #f1f5f9; font-size: 11px; text-transform: uppercase; color: #64748b; }
          .course-table td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
          .course-table tr:last-child td { border-bottom: none; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; }
          .badge-transfer { background: #dbeafe; color: #1d4ed8; }
          .badge-associate { background: #fef3c7; color: #b45309; }
          .badge-both { background: #ede9fe; color: #7c3aed; }
          .dual-credit-section { margin-top: 30px; padding: 20px; background: #fefce8; border-radius: 8px; border: 1px solid #fde047; }
          .dual-credit-section h3 { color: #a16207; margin-bottom: 15px; }
          .dual-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
          .dual-item { text-align: center; }
          .dual-item .number { font-size: 28px; font-weight: bold; color: #1e293b; }
          .dual-item .label { font-size: 12px; color: #64748b; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📚 Official Transcript</h1>
          <p>GradTrack Student Credit Record</p>
        </div>

        <div class="student-info">
          <div>
            <label>Student Name</label>
            <p>${student.name}</p>
          </div>
          <div>
            <label>Student ID</label>
            <p>${student.id.toUpperCase()}</p>
          </div>
          <div>
            <label>Current Grade</label>
            <p>Grade ${student.grade}</p>
          </div>
          <div>
            <label>Expected Graduation</label>
            <p>Class of ${student.graduationYear}</p>
          </div>
        </div>

        <div class="progress-section">
          <h2>Graduation Progress</h2>
          <div class="progress-grid">
            <div class="progress-item">
              <div class="number">${stats.percentage}%</div>
              <div class="label">Complete</div>
            </div>
            <div class="progress-item">
              <div class="number">${stats.totalEarned}</div>
              <div class="label">Credits Earned</div>
            </div>
            <div class="progress-item">
              <div class="number">${TOTAL_REQUIRED}</div>
              <div class="label">Credits Required</div>
            </div>
            <div class="progress-item">
              <div class="number">${TOTAL_REQUIRED - stats.totalEarned}</div>
              <div class="label">Remaining</div>
            </div>
          </div>
        </div>

        ${Object.entries(coursesByTerm).sort((a, b) => b[0].localeCompare(a[0])).map(([term, termCourses]) => `
          <div class="term-section">
            <h3>${term}</h3>
            <table class="course-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Category</th>
                  <th>Credits</th>
                  <th>Grade</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                ${termCourses.map(course => `
                  <tr>
                    <td><strong>${course.name}</strong></td>
                    <td>${GRADUATION_REQUIREMENTS[course.category]?.label || course.category}</td>
                    <td>${course.credits}</td>
                    <td>${course.grade || '-'}</td>
                    <td>
                      ${course.isDualCredit
                        ? `<span class="badge badge-${course.dualCreditType}">${course.dualCreditType === 'both' ? 'Both' : course.dualCreditType === 'transfer' ? 'Transfer' : 'Associate'}</span>`
                        : '-'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `).join('')}

        ${stats.totalDualCredits > 0 ? `
          <div class="dual-credit-section">
            <h3>🎓 Dual Credit Summary</h3>
            <div class="dual-grid">
              <div class="dual-item">
                <div class="number">${stats.totalDualCredits}</div>
                <div class="label">Total College Credits</div>
              </div>
              <div class="dual-item">
                <div class="number">${stats.associateCredits}</div>
                <div class="label">Associate Degree</div>
              </div>
              <div class="dual-item">
                <div class="number">${stats.transferCredits}</div>
                <div class="label">Transfer Degree</div>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="footer">
          <p>Generated by GradTrack • ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p>This is an unofficial transcript for planning purposes only.</p>
        </div>
      </body>
      </html>
    `;

    // Open print dialog
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        setIsGenerating(false);
      }, 250);
    };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-3xl w-full max-w-md border border-slate-700 p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📄</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Export Transcript</h2>
          <p className="text-slate-400 text-sm">Generate a printable PDF transcript with all your courses and progress.</p>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-slate-400 text-sm">Student</span>
            <span className="text-white font-medium">{student.name}</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-slate-400 text-sm">Total Courses</span>
            <span className="text-white font-medium">{courses.length}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-sm">Progress</span>
            <span className="text-indigo-400 font-medium">{stats.percentage}% Complete</span>
          </div>
        </div>

        <div className="space-y-3">
          <button onClick={generatePDF} disabled={isGenerating}
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-4 rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2">
            {isGenerating ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating...
              </>
            ) : (
              <>📥 Generate & Print PDF</>
            )}
          </button>
          <button onClick={onClose}
            className="w-full bg-slate-800 text-slate-300 font-medium py-3 rounded-xl hover:bg-slate-700 transition-all">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// LOGIN SCREEN
// ============================================

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    setTimeout(() => {
      // Check students
      const student = USERS_DB.students.find(s => s.email === email && s.password === password);
      if (student) {
        onLogin({ ...student, role: 'student' });
        return;
      }

      // Check counselors
      const counselor = USERS_DB.counselors.find(c => c.email === email && c.password === password);
      if (counselor) {
        onLogin({ ...counselor, role: 'counselor' });
        return;
      }

      setError('Invalid email or password');
      setIsLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/25">
            <span className="text-4xl">🎓</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">GradTrack</h1>
          <p className="text-slate-400">Track your path to graduation</p>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-800 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="you@school.edu" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="••••••••" />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            <button type="submit" disabled={isLoading}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-4 rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2">
              {isLoading ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-800">
            <p className="text-slate-500 text-sm text-center mb-4">Demo Accounts</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-indigo-400 font-medium mb-1">👩🏽‍🎓 Student</p>
                <p className="text-slate-400">emma@school.edu</p>
                <p className="text-slate-500">demo123</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-purple-400 font-medium mb-1">👩🏾‍💼 Counselor</p>
                <p className="text-slate-400">counselor@school.edu</p>
                <p className="text-slate-500">admin123</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// STUDENT DASHBOARD
// ============================================

function StudentDashboard({ user, onLogout }) {
  const [courses, setCourses] = useState(COURSES_DB[user.id] || []);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);

  const stats = useMemo(() => calculateStudentStats(courses), [courses]);
  const alerts = useMemo(() => generateAlerts(user, stats), [user, stats]);

  const handleDeleteCourse = (id) => setCourses(courses.filter(c => c.id !== id));
  const handleAddCourse = (course) => setCourses([...courses, course]);

  return (
    <div className="min-h-screen bg-slate-950 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{user.avatar}</span>
              <div>
                <h1 className="text-lg font-bold text-white">{user.name}</h1>
                <p className="text-slate-400 text-sm">Class of {user.graduationYear}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowTranscriptModal(true)}
                className="bg-slate-800 hover:bg-slate-700 text-white p-2.5 rounded-xl transition-all" title="Export Transcript">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
              <button onClick={() => setShowAddModal(true)}
                className="bg-indigo-500 hover:bg-indigo-600 text-white p-2.5 rounded-xl transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button onClick={onLogout}
                className="bg-slate-800 hover:bg-slate-700 text-slate-400 p-2.5 rounded-xl transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-lg mx-auto px-4 pb-24">
        {activeTab === 'dashboard' && (
          <div className="py-6 space-y-6">
            {/* Alerts */}
            <AlertBanner alerts={alerts} />

            {/* Progress Card */}
            <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 backdrop-blur-sm rounded-3xl p-6 border border-indigo-500/20">
              <div className="flex items-center gap-6">
                <CircularProgress percentage={stats.percentage} size={100} strokeWidth={8} color="#818cf8" bgColor="#334155">
                  <div className="text-center">
                    <span className="text-2xl font-bold text-white">{stats.percentage}%</span>
                  </div>
                </CircularProgress>
                <div>
                  <h2 className="text-white font-bold text-lg mb-1">Graduation Progress</h2>
                  <p className="text-slate-300">
                    <span className="text-2xl font-bold text-white">{stats.totalEarned}</span>
                    <span className="text-slate-400"> / {TOTAL_REQUIRED} credits</span>
                  </p>
                  <p className="text-slate-400 text-sm mt-1">{TOTAL_REQUIRED - stats.totalEarned} credits remaining</p>
                </div>
              </div>
            </div>

            {/* Categories Grid */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Credit Categories</h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(GRADUATION_REQUIREMENTS).map(([key, data]) => (
                  <CategoryCard key={key} category={key} data={data} earnedCredits={stats.creditsByCategory[key]}
                    onClick={() => { setSelectedCategory(key); setActiveTab('courses'); }} />
                ))}
              </div>
            </div>

            {/* Dual Credit Summary */}
            {stats.totalDualCredits > 0 && (
              <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-3xl p-6 border border-slate-700/50">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">🎓</span>
                  <h2 className="text-lg font-bold text-white">Dual Credit Summary</h2>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white">{stats.totalDualCredits}</p>
                    <p className="text-slate-400 text-xs">Total</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-amber-400">{stats.associateCredits}</p>
                    <p className="text-slate-400 text-xs">Associate</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-sky-400">{stats.transferCredits}</p>
                    <p className="text-slate-400 text-xs">Transfer</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'courses' && (
          <div className="py-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">
                {selectedCategory ? GRADUATION_REQUIREMENTS[selectedCategory].label : 'All Courses'}
              </h2>
              {selectedCategory && (
                <button onClick={() => setSelectedCategory(null)} className="text-indigo-400 text-sm font-medium">View All</button>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
              <button onClick={() => setSelectedCategory(null)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${!selectedCategory ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300'}`}>
                All
              </button>
              {Object.entries(GRADUATION_REQUIREMENTS).map(([key, data]) => (
                <button key={key} onClick={() => setSelectedCategory(key)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${selectedCategory === key ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300'}`}>
                  {data.icon}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {courses.filter(c => !selectedCategory || c.category === selectedCategory).map(course => (
                <CourseItem key={course.id} course={course} onDelete={handleDeleteCourse} />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800">
        <div className="max-w-lg mx-auto px-6 py-3">
          <div className="flex justify-around">
            {[{ id: 'dashboard', icon: '📊', label: 'Dashboard' }, { id: 'courses', icon: '📝', label: 'Courses' }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${activeTab === tab.id ? 'text-indigo-400' : 'text-slate-500'}`}>
                <span className="text-xl">{tab.icon}</span>
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      <AddCourseModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} onAdd={handleAddCourse} />
      <TranscriptModal isOpen={showTranscriptModal} onClose={() => setShowTranscriptModal(false)} student={user} courses={courses} stats={stats} />
    </div>
  );
}

// ============================================
// COUNSELOR DASHBOARD
// ============================================

function CounselorDashboard({ user, onLogout }) {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);

  const studentsWithStats = useMemo(() => {
    return USERS_DB.students.map(student => {
      const courses = COURSES_DB[student.id] || [];
      const stats = calculateStudentStats(courses);
      const alerts = generateAlerts(student, stats);
      return { ...student, courses, stats, alerts };
    });
  }, []);

  const filteredStudents = useMemo(() => {
    switch (filterStatus) {
      case 'at-risk': return studentsWithStats.filter(s => s.alerts.some(a => a.type === 'critical' || a.type === 'warning'));
      case 'on-track': return studentsWithStats.filter(s => !s.alerts.some(a => a.type === 'critical' || a.type === 'warning'));
      default: return studentsWithStats;
    }
  }, [studentsWithStats, filterStatus]);

  const summaryStats = useMemo(() => {
    const total = studentsWithStats.length;
    const atRisk = studentsWithStats.filter(s => s.alerts.some(a => a.type === 'critical')).length;
    const onTrack = studentsWithStats.filter(s => s.stats.percentage >= 50).length;
    const avgProgress = Math.round(studentsWithStats.reduce((sum, s) => sum + s.stats.percentage, 0) / total);
    return { total, atRisk, onTrack, avgProgress };
  }, [studentsWithStats]);

  if (selectedStudent) {
    const student = studentsWithStats.find(s => s.id === selectedStudent);
    return (
      <div className="min-h-screen bg-slate-950 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
        </div>

        <header className="relative sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setSelectedStudent(null)} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Students
              </button>
              <button onClick={() => setShowTranscriptModal(true)}
                className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl transition-all flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export Transcript
              </button>
            </div>
          </div>
        </header>

        <main className="relative max-w-2xl mx-auto px-4 py-6 space-y-6">
          {/* Student Header */}
          <div className="bg-slate-900/80 rounded-3xl p-6 border border-slate-800">
            <div className="flex items-center gap-4 mb-6">
              <span className="text-5xl">{student.avatar}</span>
              <div>
                <h1 className="text-2xl font-bold text-white">{student.name}</h1>
                <p className="text-slate-400">Grade {student.grade} • Class of {student.graduationYear}</p>
                <p className="text-slate-500 text-sm">{student.email}</p>
              </div>
            </div>

            <AlertBanner alerts={student.alerts} />
          </div>

          {/* Progress Overview */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 rounded-2xl p-6 border border-indigo-500/20">
              <CircularProgress percentage={student.stats.percentage} size={80} strokeWidth={6} color="#818cf8" bgColor="#334155">
                <span className="text-xl font-bold text-white">{student.stats.percentage}%</span>
              </CircularProgress>
              <p className="text-white font-semibold mt-4">Graduation Progress</p>
              <p className="text-slate-400 text-sm">{student.stats.totalEarned} / {TOTAL_REQUIRED} credits</p>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
              <div className="text-3xl font-bold text-white mb-2">{student.stats.totalDualCredits}</div>
              <p className="text-white font-semibold">Dual Credits</p>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Associate</span>
                  <span className="text-amber-400">{student.stats.associateCredits}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Transfer</span>
                  <span className="text-sky-400">{student.stats.transferCredits}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Deficiencies */}
          {student.stats.deficiencies.length > 0 && (
            <div className="bg-amber-500/10 rounded-2xl p-6 border border-amber-500/20">
              <h3 className="text-amber-400 font-semibold mb-4 flex items-center gap-2">
                <span>⚠️</span> Credit Deficiencies
              </h3>
              <div className="space-y-3">
                {student.stats.deficiencies.map(def => (
                  <div key={def.category} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{GRADUATION_REQUIREMENTS[def.category].icon}</span>
                      <span className="text-white">{def.label}</span>
                    </div>
                    <span className="text-amber-400 font-medium">Needs {def.needed} more</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Course List */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Course History ({student.courses.length} courses)</h3>
            <div className="space-y-3">
              {student.courses.map(course => (
                <CourseItem key={course.id} course={course} showDelete={false} />
              ))}
            </div>
          </div>
        </main>

        <TranscriptModal isOpen={showTranscriptModal} onClose={() => setShowTranscriptModal(false)}
          student={student} courses={student.courses} stats={student.stats} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{user.avatar}</span>
              <div>
                <h1 className="text-lg font-bold text-white">{user.name}</h1>
                <p className="text-slate-400 text-sm">School Counselor</p>
              </div>
            </div>
            <button onClick={onLogout} className="bg-slate-800 hover:bg-slate-700 text-slate-400 px-4 py-2 rounded-xl transition-all flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800">
            <p className="text-3xl font-bold text-white">{summaryStats.total}</p>
            <p className="text-slate-400 text-sm">Total Students</p>
          </div>
          <div className="bg-red-500/10 rounded-2xl p-5 border border-red-500/20">
            <p className="text-3xl font-bold text-red-400">{summaryStats.atRisk}</p>
            <p className="text-slate-400 text-sm">At Risk</p>
          </div>
          <div className="bg-emerald-500/10 rounded-2xl p-5 border border-emerald-500/20">
            <p className="text-3xl font-bold text-emerald-400">{summaryStats.onTrack}</p>
            <p className="text-slate-400 text-sm">On Track</p>
          </div>
          <div className="bg-indigo-500/10 rounded-2xl p-5 border border-indigo-500/20">
            <p className="text-3xl font-bold text-indigo-400">{summaryStats.avgProgress}%</p>
            <p className="text-slate-400 text-sm">Avg Progress</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {[{ id: 'all', label: 'All Students' }, { id: 'at-risk', label: '⚠️ At Risk' }, { id: 'on-track', label: '✓ On Track' }].map(filter => (
            <button key={filter.id} onClick={() => setFilterStatus(filter.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filterStatus === filter.id ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
              {filter.label}
            </button>
          ))}
        </div>

        {/* Students List */}
        <div className="space-y-3">
          {filteredStudents.map(student => (
            <button key={student.id} onClick={() => setSelectedStudent(student.id)}
              className="w-full bg-slate-900/80 rounded-2xl p-5 border border-slate-800 hover:border-slate-700 transition-all text-left">
              <div className="flex items-center gap-4">
                <span className="text-4xl">{student.avatar}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-white font-semibold">{student.name}</h3>
                    {student.alerts.some(a => a.type === 'critical') && (
                      <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full text-xs font-medium">At Risk</span>
                    )}
                    {student.alerts.some(a => a.type === 'success') && (
                      <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full text-xs font-medium">Excellent</span>
                    )}
                  </div>
                  <p className="text-slate-400 text-sm">Grade {student.grade} • Class of {student.graduationYear}</p>
                </div>
                <div className="text-right">
                  <CircularProgress percentage={student.stats.percentage} size={50} strokeWidth={4}
                    color={student.stats.percentage >= 75 ? '#10b981' : student.stats.percentage >= 50 ? '#818cf8' : '#f59e0b'} bgColor="#334155">
                    <span className="text-xs font-bold text-white">{student.stats.percentage}%</span>
                  </CircularProgress>
                </div>
                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>

              {student.alerts.filter(a => a.type !== 'success').length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap gap-2">
                  {student.alerts.filter(a => a.type !== 'success').slice(0, 2).map((alert, i) => (
                    <span key={i} className={`text-xs px-2 py-1 rounded-full ${alert.type === 'critical' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                      {alert.icon} {alert.message}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

// ============================================
// MAIN APP
// ============================================

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);

  const handleLogin = (user) => setCurrentUser(user);
  const handleLogout = () => setCurrentUser(null);

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (currentUser.role === 'counselor') {
    return <CounselorDashboard user={currentUser} onLogout={handleLogout} />;
  }

  return <StudentDashboard user={currentUser} onLogout={handleLogout} />;
}
