import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabase';

// ============================================
// AUDIT LOGGING HELPER
// ============================================

async function logAudit(action, tableName, recordId = null, details = null) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    await supabase.from('audit_logs').insert([{
      user_id: user.id,
      action,
      table_name: tableName,
      record_id: recordId,
      details
    }]);
  } catch (e) {
    console.log('Audit log failed:', e);
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function calculateStudentStats(courses, categories) {
  const totalRequired = categories.reduce((sum, cat) => sum + Number(cat.credits_required), 0);
  
  const creditsByCategory = categories.reduce((acc, cat) => {
    acc[cat.id] = courses.filter(c => c.category_id === cat.id).reduce((sum, c) => sum + Number(c.credits), 0);
    return acc;
  }, {});

  const totalEarned = courses.reduce((sum, c) => sum + Number(c.credits), 0);
  const percentage = totalRequired > 0 ? Math.round((totalEarned / totalRequired) * 100) : 0;

  const dualCreditCourses = courses.filter(c => c.is_dual_credit);
  const associateCredits = dualCreditCourses.filter(c => c.dual_credit_type === 'associate' || c.dual_credit_type === 'both').reduce((sum, c) => sum + Number(c.credits), 0);
  const transferCredits = dualCreditCourses.filter(c => c.dual_credit_type === 'transfer' || c.dual_credit_type === 'both').reduce((sum, c) => sum + Number(c.credits), 0);

  const deficiencies = categories.map(cat => {
    const earned = creditsByCategory[cat.id] || 0;
    const required = Number(cat.credits_required);
    if (earned < required) {
      return { category: cat, needed: required - earned, earned, required };
    }
    return null;
  }).filter(Boolean);

  return {
    creditsByCategory,
    totalEarned,
    totalRequired,
    percentage,
    associateCredits,
    transferCredits,
    deficiencies,
    isOnTrack: percentage >= 50,
    totalDualCredits: dualCreditCourses.reduce((sum, c) => sum + Number(c.credits), 0)
  };
}

function calculatePathwayProgress(courses, pathways, coursePathways) {
  return pathways.map(pathway => {
    const linkedCourseIds = coursePathways
      .filter(cp => cp.pathway_id === pathway.id)
      .map(cp => cp.course_id);
    
    const pathwayCourses = courses.filter(c => linkedCourseIds.includes(c.id));
    const earnedCredits = pathwayCourses.reduce((sum, c) => sum + Number(c.credits), 0);
    const requiredCredits = Number(pathway.credits_required);
    const percentage = requiredCredits > 0 ? Math.round((earnedCredits / requiredCredits) * 100) : 0;
    
    return {
      ...pathway,
      earnedCredits,
      requiredCredits,
      percentage: Math.min(percentage, 100),
      isComplete: earnedCredits >= requiredCredits,
      courses: pathwayCourses
    };
  });
}

function generateAlerts(profile, stats) {
  const alerts = [];
  const gradeLevel = profile?.grade || 9;
  
  // Get current month to determine trimester
  const currentMonth = new Date().getMonth() + 1; // 1-12
  
  // Summit Learning Charter Trimesters:
  // Fall: August - November (8-11)
  // Winter: December - February (12, 1, 2)
  // Spring: March - June (3-6), July is summer break
  let currentTrimester;
  if (currentMonth >= 8 && currentMonth <= 11) {
    currentTrimester = 1; // Fall
  } else if (currentMonth === 12 || currentMonth <= 2) {
    currentTrimester = 2; // Winter
  } else {
    currentTrimester = 3; // Spring (or summer - use Spring expectations)
  }
  
  // Trimester-based expected progress (2 credits per trimester, 6 per year, 24 total)
  const expectedProgress = {
    9:  { 1: 0,  2: 8,  3: 17 },
    10: { 1: 25, 2: 33, 3: 42 },
    11: { 1: 50, 2: 58, 3: 67 },
    12: { 1: 75, 2: 83, 3: 92 }
  };
  
  const gradeExpectations = expectedProgress[gradeLevel] || { 1: 0, 2: 50, 3: 100 };
  const expected = gradeExpectations[currentTrimester];
  
  // Determine trimester name for display
  const trimesterName = currentTrimester === 1 ? 'Fall' : currentTrimester === 2 ? 'Winter' : 'Spring';

  // Only show critical alert if more than 15% behind expected
  if (stats.percentage < expected - 15) {
    alerts.push({ 
      type: 'critical', 
      message: `Behind on credits (${stats.percentage}% vs expected ${expected}% for ${trimesterName} of grade ${gradeLevel})`, 
      icon: '🚨' 
    });
  } else if (stats.percentage < expected - 5) {
    alerts.push({ 
      type: 'warning', 
      message: `Slightly behind expected progress for ${trimesterName} trimester`, 
      icon: '⚠️' 
    });
  }

  // Success message if on track with dual credits
  if (stats.percentage >= expected && stats.totalDualCredits >= 3) {
    alerts.push({ 
      type: 'success', 
      message: `On track with ${stats.totalDualCredits} dual credits!`, 
      icon: '🌟' 
    });
  } else if (stats.percentage >= expected + 10) {
    alerts.push({ 
      type: 'success', 
      message: `Ahead of schedule! Great progress!`, 
      icon: '🌟' 
    });
  }

  return alerts;
}
  
// Helper to get display name from profile
function getDisplayName(profile) {
  if (profile?.full_name && profile.full_name !== 'Unknown') {
    return profile.full_name;
  }
  // Fall back to email username if name is missing
  if (profile?.email) {
    return profile.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  return 'Student';
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
  const percentage = required > 0 ? Math.min((earned / required) * 100, 100) : 0;
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
  const style = styles[type] || styles.transfer;
  return <span className={`text-xs px-2 py-1 rounded-full font-medium ${style.bg} ${style.text}`}>{style.label}</span>;
}

function CTEBadge({ pathway }) {
  return (
    <span className="text-xs px-2 py-1 rounded-full font-medium bg-emerald-500/20 text-emerald-400">
      {pathway.icon} {pathway.name}
    </span>
  );
}

function AlertBanner({ alerts }) {
  if (!alerts || alerts.length === 0) return null;
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

function CategoryCard({ category, earnedCredits, onClick }) {
  const required = Number(category.credits_required);
  const isComplete = earnedCredits >= required;

  return (
    <button onClick={onClick}
      className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-4 text-left hover:bg-slate-800/70 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] border border-slate-700/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{category.icon || '📘'}</span>
        {isComplete && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full font-medium">✓</span>}
      </div>
      <h3 className="text-white font-semibold mb-1 text-sm">{category.name}</h3>
      <p className="text-slate-400 text-xs mb-3">{earnedCredits} / {required}</p>
      <ProgressBar earned={earnedCredits} required={required} color={isComplete ? '#10b981' : '#6366f1'} />
    </button>
  );
}

function PathwayCard({ pathway }) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{pathway.icon || '🎯'}</span>
        {pathway.isComplete && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full font-medium">✓ Complete</span>}
      </div>
      <h3 className="text-white font-semibold mb-1">{pathway.name}</h3>
      <p className="text-slate-400 text-xs mb-3">{pathway.earnedCredits} / {pathway.requiredCredits} credits</p>
      <ProgressBar earned={pathway.earnedCredits} required={pathway.requiredCredits} color={pathway.isComplete ? '#10b981' : '#f59e0b'} />
      {pathway.courses.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-700">
          <p className="text-slate-500 text-xs mb-2">Courses:</p>
          <div className="flex flex-wrap gap-1">
            {pathway.courses.map(c => (
              <span key={c.id} className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded">{c.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CourseItem({ course, category, pathways = [], onDelete, showDelete = true }) {
  return (
    <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-white font-medium">{course.name}</h4>
            {course.is_dual_credit && <DualCreditBadge type={course.dual_credit_type} />}
            {course.grade && <span className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-300">{course.grade}</span>}
          </div>
          <div className="flex items-center gap-3 mt-2 text-sm text-slate-400">
            <span>{category?.icon} {category?.name}</span>
            <span>•</span>
            <span>{course.term}</span>
          </div>
          {pathways.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {pathways.map(p => <CTEBadge key={p.id} pathway={p} />)}
            </div>
          )}
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

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );
}

// ============================================
// PRIVACY SETTINGS MODAL (FERPA)
// ============================================

function PrivacySettingsModal({ isOpen, onClose, profile }) {
  const [loading, setLoading] = useState(false);
  const [deletionRequested, setDeletionRequested] = useState(false);
  const [reason, setReason] = useState('');

  const handleRequestDeletion = async () => {
    if (!confirm('Are you sure you want to request deletion of all your data? This cannot be undone once approved.')) return;
    
    setLoading(true);
    const { error } = await supabase.from('deletion_requests').insert([{
      requested_by: profile.id,
      student_id: profile.id,
      reason
    }]);
    
    if (!error) {
      await logAudit('deletion_request', 'deletion_requests', profile.id, { reason });
      setDeletionRequested(true);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-3xl w-full max-w-md border border-slate-700 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">🔒 Privacy Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          {/* FERPA Notice */}
          <div className="bg-indigo-500/10 rounded-xl p-4 border border-indigo-500/20">
            <h3 className="text-indigo-400 font-semibold mb-2">Your FERPA Rights</h3>
            <p className="text-slate-300 text-sm">
              Under FERPA, you have the right to:
            </p>
            <ul className="text-slate-400 text-sm mt-2 space-y-1">
              <li>• Inspect and review your education records</li>
              <li>• Request correction of inaccurate information</li>
              <li>• Consent to disclosure of your records</li>
              <li>• Request deletion of your data</li>
            </ul>
          </div>

          {/* Data We Collect */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <h3 className="text-white font-semibold mb-2">Data We Collect</h3>
            <ul className="text-slate-400 text-sm space-y-1">
              <li>• Name and email address</li>
              <li>• School and grade level</li>
              <li>• Course information and grades</li>
              <li>• Credit progress data</li>
            </ul>
          </div>

          {/* Who Can See Your Data */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <h3 className="text-white font-semibold mb-2">Who Can Access Your Data</h3>
            <ul className="text-slate-400 text-sm space-y-1">
              <li>• <span className="text-white">You</span> — Full access</li>
              <li>• <span className="text-white">School Counselors</span> — View only</li>
              <li>• <span className="text-white">School Admins</span> — View and manage</li>
              <li>• <span className="text-white">Linked Parents</span> — View only</li>
            </ul>
          </div>

          {/* Request Data Deletion */}
          <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20">
            <h3 className="text-red-400 font-semibold mb-2">Request Data Deletion</h3>
            {deletionRequested ? (
              <div className="text-emerald-400 text-sm">
                ✓ Your deletion request has been submitted. A school administrator will review it.
              </div>
            ) : (
              <>
                <p className="text-slate-400 text-sm mb-3">
                  You can request deletion of all your data. This will be reviewed by a school administrator.
                </p>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for deletion (optional)"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 mb-3 text-sm"
                  rows={2}
                />
                <button onClick={handleRequestDeletion} disabled={loading}
                  className="w-full bg-red-500/20 text-red-400 font-medium py-3 rounded-xl hover:bg-red-500/30 transition-all disabled:opacity-50">
                  {loading ? 'Submitting...' : 'Request Data Deletion'}
                </button>
              </>
            )}
          </div>
        </div>

        <button onClick={onClose}
          className="w-full mt-6 bg-slate-800 text-slate-300 font-medium py-3 rounded-xl hover:bg-slate-700 transition-all">
          Close
        </button>
      </div>
    </div>
  );
}

// ============================================
// ADD COURSE MODAL
// ============================================

function AddCourseModal({ isOpen, onClose, onAdd, categories, pathways }) {
  const [formData, setFormData] = useState({
    name: '', credits: 1, category_id: '', term: 'Spring 2025',
    is_dual_credit: false, dual_credit_type: 'transfer', grade: 'A',
    selectedPathways: []
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (categories.length > 0 && !formData.category_id) {
      setFormData(f => ({ ...f, category_id: categories[0].id }));
    }
  }, [categories]);

  const togglePathway = (pathwayId) => {
    setFormData(f => ({
      ...f,
      selectedPathways: f.selectedPathways.includes(pathwayId)
        ? f.selectedPathways.filter(id => id !== pathwayId)
        : [...f.selectedPathways, pathwayId]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await onAdd({
      name: formData.name,
      credits: formData.credits,
      category_id: formData.category_id,
      term: formData.term,
      is_dual_credit: formData.is_dual_credit,
      dual_credit_type: formData.is_dual_credit ? formData.dual_credit_type : null,
      grade: formData.grade,
      selectedPathways: formData.selectedPathways
    });
    setFormData({ name: '', credits: 1, category_id: categories[0]?.id || '', term: 'Spring 2025', is_dual_credit: false, dual_credit_type: 'transfer', grade: 'A', selectedPathways: [] });
    setLoading(false);
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
                {['Fall 2024', 'Winter 2024', 'Spring 2025', 'Fall 2025', 'Winter 2025', 'Spring 2026', 'Fall 2026', 'Winter 2026', 'Spring 2027'].map(t => <option key={t} value={t}>{t}</option>)}
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
            <select value={formData.category_id} onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500">
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>)}
            </select>
          </div>

          {/* Dual Credit Section */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={formData.is_dual_credit} onChange={(e) => setFormData({ ...formData, is_dual_credit: e.target.checked })}
                className="w-5 h-5 rounded bg-slate-700 border-slate-600 text-indigo-500" />
              <div>
                <span className="text-white font-medium">Dual Credit Course</span>
                <p className="text-slate-400 text-sm">This course earns college credit</p>
              </div>
            </label>

            {formData.is_dual_credit && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <label className="block text-sm font-medium text-slate-300 mb-3">Credit applies toward:</label>
                <div className="space-y-2">
                  {[{ value: 'associate', label: 'Associate Degree' }, { value: 'transfer', label: 'Transfer Degree' }, { value: 'both', label: 'Both Degrees' }].map(option => (
                    <label key={option.value} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-slate-700/50">
                      <input type="radio" name="dualCreditType" value={option.value} checked={formData.dual_credit_type === option.value}
                        onChange={(e) => setFormData({ ...formData, dual_credit_type: e.target.value })}
                        className="w-4 h-4 text-indigo-500 bg-slate-700 border-slate-600" />
                      <span className="text-white">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* CTE Pathways Section */}
          {pathways.length > 0 && (
            <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🎯</span>
                <span className="text-white font-medium">CTE Pathways</span>
              </div>
              <p className="text-slate-400 text-sm mb-3">Select if this course counts toward a career pathway:</p>
              <div className="space-y-2">
                {pathways.map(pathway => (
                  <label key={pathway.id} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-slate-700/50">
                    <input 
                      type="checkbox" 
                      checked={formData.selectedPathways.includes(pathway.id)}
                      onChange={() => togglePathway(pathway.id)}
                      className="w-5 h-5 rounded bg-slate-700 border-slate-600 text-emerald-500" 
                    />
                    <span className="text-lg">{pathway.icon}</span>
                    <span className="text-white">{pathway.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-4 rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all active:scale-[0.98] disabled:opacity-50">
            {loading ? 'Adding...' : 'Add Course'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================
// TRANSCRIPT MODAL
// ============================================

function TranscriptModal({ isOpen, onClose, profile, courses, categories, pathways, pathwayProgress, stats }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const displayName = getDisplayName(profile);

  const generatePDF = async () => {
    setIsGenerating(true);
    
    // Log the transcript export for FERPA audit
    await logAudit('export_transcript', 'courses', profile.id, { course_count: courses.length });

    const coursesByTerm = courses.reduce((acc, course) => {
      if (!acc[course.term]) acc[course.term] = [];
      acc[course.term].push(course);
      return acc;
    }, {});

    const getCategoryForCourse = (course) => categories.find(c => c.id === course.category_id) || { name: 'Other', icon: '📘' };

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Transcript - ${displayName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; }
          .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #4f46e5; }
          .header h1 { color: #4f46e5; font-size: 28px; margin-bottom: 5px; }
          .header p { color: #64748b; }
          .student-info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; padding: 20px; background: #f8fafc; border-radius: 8px; }
          .student-info label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
          .student-info p { font-size: 16px; font-weight: 600; color: #1e293b; }
          .progress-section { margin-bottom: 30px; padding: 20px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); border-radius: 8px; color: white; }
          .progress-section h2 { margin-bottom: 15px; }
          .progress-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
          .progress-item { text-align: center; background: rgba(255,255,255,0.1); padding: 10px; border-radius: 6px; }
          .progress-item .number { font-size: 24px; font-weight: bold; }
          .progress-item .label { font-size: 11px; opacity: 0.9; }
          .cte-section { margin-bottom: 30px; padding: 20px; background: #ecfdf5; border-radius: 8px; border: 1px solid #10b981; }
          .cte-section h2 { color: #065f46; margin-bottom: 15px; }
          .cte-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; }
          .cte-item { background: white; padding: 15px; border-radius: 6px; border: 1px solid #d1fae5; }
          .cte-item h3 { color: #065f46; font-size: 14px; margin-bottom: 5px; }
          .cte-item p { color: #64748b; font-size: 12px; }
          .term-section { margin-bottom: 25px; }
          .term-section h3 { color: #4f46e5; font-size: 14px; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 1px solid #e2e8f0; }
          .course-table { width: 100%; border-collapse: collapse; }
          .course-table th { text-align: left; padding: 8px 12px; background: #f1f5f9; font-size: 11px; text-transform: uppercase; color: #64748b; }
          .course-table td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; }
          .badge-transfer { background: #dbeafe; color: #1d4ed8; }
          .badge-associate { background: #fef3c7; color: #b45309; }
          .badge-both { background: #ede9fe; color: #7c3aed; }
          .badge-cte { background: #d1fae5; color: #065f46; }
          .ferpa-notice { margin-top: 30px; padding: 15px; background: #fef3c7; border-radius: 8px; border: 1px solid #f59e0b; }
          .ferpa-notice p { color: #92400e; font-size: 11px; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📚 Official Transcript</h1>
          <p>GradTrack Student Credit Record</p>
        </div>
        <div class="student-info">
          <div><label>Student Name</label><p>${displayName}</p></div>
          <div><label>Email</label><p>${profile.email}</p></div>
          <div><label>Current Grade</label><p>Grade ${profile.grade || 'N/A'}</p></div>
          <div><label>Expected Graduation</label><p>Class of ${profile.graduation_year || 'N/A'}</p></div>
        </div>
        <div class="progress-section">
          <h2>Graduation Progress</h2>
          <div class="progress-grid">
            <div class="progress-item"><div class="number">${stats.percentage}%</div><div class="label">Complete</div></div>
            <div class="progress-item"><div class="number">${stats.totalEarned}</div><div class="label">Credits Earned</div></div>
            <div class="progress-item"><div class="number">${stats.totalRequired}</div><div class="label">Credits Required</div></div>
            <div class="progress-item"><div class="number">${stats.totalRequired - stats.totalEarned}</div><div class="label">Remaining</div></div>
          </div>
        </div>
        ${pathwayProgress && pathwayProgress.length > 0 ? `
        <div class="cte-section">
          <h2>🎯 CTE Pathway Progress</h2>
          <div class="cte-grid">
            ${pathwayProgress.map(p => `
              <div class="cte-item">
                <h3>${p.icon} ${p.name}</h3>
                <p>${p.earnedCredits} / ${p.requiredCredits} credits (${p.percentage}%)</p>
                ${p.isComplete ? '<p style="color: #10b981; font-weight: bold;">✓ Complete</p>' : ''}
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
        ${Object.entries(coursesByTerm).sort((a, b) => b[0].localeCompare(a[0])).map(([term, termCourses]) => `
          <div class="term-section">
            <h3>${term}</h3>
            <table class="course-table">
              <thead><tr><th>Course</th><th>Category</th><th>Credits</th><th>Grade</th><th>Type</th></tr></thead>
              <tbody>
                ${termCourses.map(course => {
                  const cat = getCategoryForCourse(course);
                  return `<tr>
                    <td><strong>${course.name}</strong></td>
                    <td>${cat.name}</td>
                    <td>${course.credits}</td>
                    <td>${course.grade || '-'}</td>
                    <td>${course.is_dual_credit ? `<span class="badge badge-${course.dual_credit_type}">${course.dual_credit_type}</span>` : '-'}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        `).join('')}
        <div class="ferpa-notice">
          <p><strong>FERPA Notice:</strong> This document contains confidential student education records protected under the Family Educational Rights and Privacy Act (FERPA). Unauthorized disclosure is prohibited.</p>
        </div>
        <div class="footer">
          <p>Generated by GradTrack • ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      // Popup blocked - use alternative method
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);
      
      const iframeDoc = iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(printContent);
      iframeDoc.close();
      
      iframe.contentWindow.onload = () => {
        setTimeout(() => {
          iframe.contentWindow.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
            setIsGenerating(false);
          }, 1000);
        }, 250);
      };
      
      // Fallback if onload doesn't fire
      setTimeout(() => {
        try {
          iframe.contentWindow.print();
        } catch (e) {
          console.log('Print error:', e);
        }
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          setIsGenerating(false);
        }, 1000);
      }, 1000);
      
      return;
    }
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => { printWindow.print(); setIsGenerating(false); }, 250);
    };
    
    // Fallback timeout
    setTimeout(() => {
      setIsGenerating(false);
    }, 5000);
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
          <p className="text-slate-400 text-sm">Generate a printable PDF transcript.</p>
        </div>
        <div className="space-y-3">
          <button onClick={generatePDF} disabled={isGenerating}
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-4 rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {isGenerating ? 'Generating...' : '📥 Generate & Print PDF'}
          </button>
          <button onClick={onClose} className="w-full bg-slate-800 text-slate-300 font-medium py-3 rounded-xl hover:bg-slate-700 transition-all">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// LOGIN / SIGNUP SCREEN
// ============================================

function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('student');
  const [grade, setGrade] = useState(9);
  const [graduationYear, setGraduationYear] = useState(2028);
  const [schools, setSchools] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);

  useEffect(() => {
    async function fetchSchools() {
      const { data } = await supabase.from('schools').select('*');
      if (data) {
        setSchools(data);
        if (data.length > 0) setSelectedSchool(data[0].id);
      }
    }
    fetchSchools();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (mode === 'signup' && !agreedToPrivacy) {
      setError('Please agree to the Privacy Policy to continue');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role,
              school_id: selectedSchool,
              grade: role === 'student' ? grade : null,
              graduation_year: role === 'student' ? graduationYear : null
            }
          }
        });
        if (signUpError) throw signUpError;
        if (data.user) {
          await logAudit('signup', 'profiles', data.user.id, { role });
          onLogin(data.user);
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        await logAudit('login', 'profiles', data.user.id);
        onLogin(data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
          <div className="flex mb-6 bg-slate-800 rounded-xl p-1">
            <button onClick={() => setMode('login')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'login' ? 'bg-indigo-500 text-white' : 'text-slate-400'}`}>Sign In</button>
            <button onClick={() => setMode('signup')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'signup' ? 'bg-indigo-500 text-white' : 'text-slate-400'}`}>Sign Up</button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    placeholder="Your full name" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">School</label>
                  <select value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500">
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Role</label>
                  <select value={role} onChange={(e) => setRole(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500">
                    <option value="student">Student</option>
                    <option value="parent">Parent/Guardian</option>
                    <option value="counselor">Counselor</option>
                    <option value="admin">School Admin</option>
                  </select>
                </div>

                {role === 'student' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Grade</label>
                      <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500">
                        {[9, 10, 11, 12].map(g => <option key={g} value={g}>{g}th Grade</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Graduation Year</label>
                      <select value={graduationYear} onChange={(e) => setGraduationYear(Number(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500">
                        {[2025, 2026, 2027, 2028, 2029].map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                placeholder="you@school.edu" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                placeholder="••••••••" />
            </div>

            {/* Privacy Policy Checkbox for Signup */}
            {mode === 'signup' && (
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={agreedToPrivacy} onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                    className="w-5 h-5 mt-0.5 rounded bg-slate-700 border-slate-600 text-indigo-500" />
                  <span className="text-slate-300 text-sm">
                    I agree to the <span className="text-indigo-400">Privacy Policy</span> and understand my data will be handled in accordance with <span className="text-indigo-400">FERPA</span> regulations.
                  </span>
                </label>
              </div>
            )}

            {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm text-center">{error}</div>}

            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-4 rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all disabled:opacity-50">
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        {/* FERPA Badge */}
        <div className="mt-4 text-center">
          <span className="inline-flex items-center gap-2 bg-slate-900/80 px-4 py-2 rounded-full border border-slate-800">
            <span className="text-emerald-400">🔒</span>
            <span className="text-slate-400 text-xs">FERPA Compliant</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// ADMIN DASHBOARD
// ============================================

function AdminDashboard({ user, profile, onLogout }) {
  const [activeTab, setActiveTab] = useState('categories');
  const [categories, setCategories] = useState([]);
  const [pathways, setPathways] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [deletionRequests, setDeletionRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showPathwayModal, setShowPathwayModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const displayName = getDisplayName(profile);

  useEffect(() => {
    fetchData();
  }, [profile]);

  async function fetchData() {
    setLoading(true);
    const { data: catData } = await supabase
      .from('credit_categories')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('display_order');
    
    const { data: pathData } = await supabase
      .from('cte_pathways')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('display_order');

    const { data: logData } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    const { data: delData } = await supabase
      .from('deletion_requests')
      .select('*, requested_by_profile:profiles!deletion_requests_requested_by_fkey(full_name, email)')
      .order('created_at', { ascending: false });

    if (catData) setCategories(catData);
    if (pathData) setPathways(pathData);
    if (logData) setAuditLogs(logData);
    if (delData) setDeletionRequests(delData);
    setLoading(false);
    
    // Log admin dashboard access
    await logAudit('view_admin_dashboard', 'admin', null);
  }

  const handleDeleteCategory = async (id) => {
    if (!confirm('Delete this category? This cannot be undone.')) return;
    await supabase.from('credit_categories').delete().eq('id', id);
    await logAudit('delete_category', 'credit_categories', id);
    setCategories(categories.filter(c => c.id !== id));
  };

  const handleDeletePathway = async (id) => {
    if (!confirm('Delete this pathway? This cannot be undone.')) return;
    await supabase.from('cte_pathways').delete().eq('id', id);
    await logAudit('delete_pathway', 'cte_pathways', id);
    setPathways(pathways.filter(p => p.id !== id));
  };

  const handleSaveCategory = async (data) => {
    if (editingItem) {
      const { data: updated } = await supabase
        .from('credit_categories')
        .update(data)
        .eq('id', editingItem.id)
        .select()
        .single();
      if (updated) {
        await logAudit('update_category', 'credit_categories', updated.id, data);
        setCategories(categories.map(c => c.id === updated.id ? updated : c));
      }
    } else {
      const { data: created } = await supabase
        .from('credit_categories')
        .insert([{ ...data, school_id: profile.school_id }])
        .select()
        .single();
      if (created) {
        await logAudit('create_category', 'credit_categories', created.id, data);
        setCategories([...categories, created]);
      }
    }
    setShowCategoryModal(false);
    setEditingItem(null);
  };

  const handleSavePathway = async (data) => {
    if (editingItem) {
      const { data: updated } = await supabase
        .from('cte_pathways')
        .update(data)
        .eq('id', editingItem.id)
        .select()
        .single();
      if (updated) {
        await logAudit('update_pathway', 'cte_pathways', updated.id, data);
        setPathways(pathways.map(p => p.id === updated.id ? updated : p));
      }
    } else {
      const { data: created } = await supabase
        .from('cte_pathways')
        .insert([{ ...data, school_id: profile.school_id }])
        .select()
        .single();
      if (created) {
        await logAudit('create_pathway', 'cte_pathways', created.id, data);
        setPathways([...pathways, created]);
      }
    }
    setShowPathwayModal(false);
    setEditingItem(null);
  };

  const handleDeletionRequest = async (requestId, action) => {
    const request = deletionRequests.find(r => r.id === requestId);
    
    if (action === 'approve') {
      // Delete all user data
      await supabase.from('courses').delete().eq('student_id', request.student_id);
      await supabase.from('profiles').delete().eq('id', request.student_id);
      
      // Update request status
      await supabase.from('deletion_requests').update({
        status: 'completed',
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      }).eq('id', requestId);
      
      await logAudit('approve_deletion', 'deletion_requests', requestId, { student_id: request.student_id });
    } else {
      await supabase.from('deletion_requests').update({
        status: 'denied',
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString()
      }).eq('id', requestId);
      
      await logAudit('deny_deletion', 'deletion_requests', requestId);
    }
    
    fetchData();
  };

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
      </div>

      <header className="relative sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-white">Admin Panel</h1>
              <p className="text-slate-400 text-sm">{displayName}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowLinkParentModal(true)} className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-2 rounded-xl transition-all text-sm" title="Link Parent">
                👨‍👩‍👧 Link Parent
              </button>
              <button onClick={() => setShowSettingsModal(true)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-xl transition-all" title="Settings">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </button>
              <button onClick={onLogout} className="bg-slate-800 hover:bg-slate-700 text-slate-400 px-4 py-2 rounded-xl transition-all flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Tab Navigation */}
        <div className="flex gap-2 bg-slate-900 p-1 rounded-xl overflow-x-auto">
          <button onClick={() => setActiveTab('categories')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all whitespace-nowrap ${activeTab === 'categories' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'}`}>
            📚 Requirements
          </button>
          <button onClick={() => setActiveTab('pathways')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all whitespace-nowrap ${activeTab === 'pathways' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'}`}>
            🎯 CTE Pathways
          </button>
          <button onClick={() => setActiveTab('privacy')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all whitespace-nowrap ${activeTab === 'privacy' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'}`}>
            🔒 FERPA
          </button>
          <button onClick={() => setActiveTab('audit')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all whitespace-nowrap ${activeTab === 'audit' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'}`}>
            📋 Audit Log
          </button>
        </div>

        {/* Categories Tab */}
        {activeTab === 'categories' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Credit Categories</h2>
              <button onClick={() => { setEditingItem(null); setShowCategoryModal(true); }}
                className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl transition-all flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add Category
              </button>
            </div>

            <div className="space-y-3">
              {categories.map(cat => (
                <div key={cat.id} className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{cat.icon || '📘'}</span>
                    <div>
                      <h3 className="text-white font-semibold">{cat.name}</h3>
                      <p className="text-slate-400 text-sm">{cat.credits_required} credits required</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setEditingItem(cat); setShowCategoryModal(true); }}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-lg transition-all">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => handleDeleteCategory(cat.id)}
                      className="bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 p-2 rounded-lg transition-all">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pathways Tab */}
        {activeTab === 'pathways' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">CTE Pathways</h2>
              <button onClick={() => { setEditingItem(null); setShowPathwayModal(true); }}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl transition-all flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add Pathway
              </button>
            </div>

            <div className="space-y-3">
              {pathways.map(pathway => (
                <div key={pathway.id} className="bg-slate-900/80 rounded-2xl p-5 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{pathway.icon || '🎯'}</span>
                    <div>
                      <h3 className="text-white font-semibold">{pathway.name}</h3>
                      <p className="text-slate-400 text-sm">{pathway.credits_required} credits required</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setEditingItem(pathway); setShowPathwayModal(true); }}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-lg transition-all">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => handleDeletePathway(pathway.id)}
                      className="bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 p-2 rounded-lg transition-all">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Privacy/FERPA Tab */}
        {activeTab === 'privacy' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white">🔒 FERPA Compliance</h2>

            {/* Deletion Requests */}
            <div className="bg-slate-900/80 rounded-2xl p-6 border border-slate-800">
              <h3 className="text-white font-semibold mb-4">Data Deletion Requests</h3>
              {deletionRequests.length === 0 ? (
                <p className="text-slate-400 text-sm">No pending deletion requests.</p>
              ) : (
                <div className="space-y-3">
                  {deletionRequests.map(request => (
                    <div key={request.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white font-medium">{request.requested_by_profile?.full_name || 'Unknown'}</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          request.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                          request.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                          request.status === 'denied' ? 'bg-red-500/20 text-red-400' :
                          'bg-slate-700 text-slate-400'
                        }`}>
                          {request.status}
                        </span>
                      </div>
                      <p className="text-slate-400 text-sm mb-2">{request.requested_by_profile?.email}</p>
                      {request.reason && <p className="text-slate-500 text-sm mb-3">Reason: {request.reason}</p>}
                      <p className="text-slate-500 text-xs mb-3">Requested: {new Date(request.created_at).toLocaleDateString()}</p>
                      
                      {request.status === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleDeletionRequest(request.id, 'approve')}
                            className="flex-1 bg-red-500/20 text-red-400 py-2 rounded-lg hover:bg-red-500/30 text-sm font-medium">
                            Approve & Delete
                          </button>
                          <button onClick={() => handleDeletionRequest(request.id, 'deny')}
                            className="flex-1 bg-slate-700 text-slate-300 py-2 rounded-lg hover:bg-slate-600 text-sm font-medium">
                            Deny
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* FERPA Info */}
            <div className="bg-indigo-500/10 rounded-2xl p-6 border border-indigo-500/20">
              <h3 className="text-indigo-400 font-semibold mb-3">FERPA Compliance Checklist</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-emerald-400">
                  <span>✓</span>
                  <span>Data encryption in transit and at rest</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-400">
                  <span>✓</span>
                  <span>Row-level security enabled</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-400">
                  <span>✓</span>
                  <span>Audit logging active</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-400">
                  <span>✓</span>
                  <span>Data deletion request system</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-400">
                  <span>✓</span>
                  <span>Privacy policy consent at signup</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-400">
                  <span>✓</span>
                  <span>Parent account support</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">📋 Audit Log</h2>
            <p className="text-slate-400 text-sm">Track all data access and changes for FERPA compliance.</p>

            <div className="bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden">
              {auditLogs.length === 0 ? (
                <p className="text-slate-400 text-sm p-6">No audit logs yet.</p>
              ) : (
                <div className="divide-y divide-slate-800">
                  {auditLogs.map(log => (
                    <div key={log.id} className="p-4 hover:bg-slate-800/50">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white font-medium">{log.action}</span>
                        <span className="text-slate-500 text-xs">{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                      <div className="text-slate-400 text-sm">
                        Table: {log.table_name}
                        {log.record_id && <span> • Record: {log.record_id.slice(0, 8)}...</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Category Modal */}
      {showCategoryModal && (
        <CategoryModal
          isOpen={showCategoryModal}
          onClose={() => { setShowCategoryModal(false); setEditingItem(null); }}
          onSave={handleSaveCategory}
          initialData={editingItem}
        />
      )}

      {/* Pathway Modal */}
      {showPathwayModal && (
        <PathwayModal
          isOpen={showPathwayModal}
          onClose={() => { setShowPathwayModal(false); setEditingItem(null); }}
          onSave={handleSavePathway}
          initialData={editingItem}
        />
      )}
    </div>
  );
}

// Category Edit Modal
function CategoryModal({ isOpen, onClose, onSave, initialData }) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    icon: initialData?.icon || '📘',
    credits_required: initialData?.credits_required || 1,
    display_order: initialData?.display_order || 0
  });
  const [loading, setLoading] = useState(false);

  const icons = ['📚', '📐', '🔬', '🌍', '🗣️', '🎨', '⚡', '✨', '💻', '🎵', '🏃', '📖', '🔧', '💼', '🎭'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await onSave(formData);
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-3xl w-full max-w-md border border-slate-700 p-6">
        <h2 className="text-xl font-bold text-white mb-6">{initialData ? 'Edit Category' : 'Add Category'}</h2>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Category Name</label>
            <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
              placeholder="e.g., Mathematics" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Icon</label>
            <div className="flex flex-wrap gap-2">
              {icons.map(icon => (
                <button key={icon} type="button" onClick={() => setFormData({ ...formData, icon })}
                  className={`text-2xl p-2 rounded-lg transition-all ${formData.icon === icon ? 'bg-indigo-500' : 'bg-slate-800 hover:bg-slate-700'}`}>
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Credits Required</label>
            <input type="number" required min="0.5" step="0.5" value={formData.credits_required}
              onChange={(e) => setFormData({ ...formData, credits_required: Number(e.target.value) })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500" />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose}
              className="flex-1 bg-slate-800 text-slate-300 font-medium py-3 rounded-xl hover:bg-slate-700 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-indigo-500 text-white font-semibold py-3 rounded-xl hover:bg-indigo-600 transition-all disabled:opacity-50">
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Pathway Edit Modal
function PathwayModal({ isOpen, onClose, onSave, initialData }) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    icon: initialData?.icon || '🎯',
    credits_required: initialData?.credits_required || 3,
    display_order: initialData?.display_order || 0
  });
  const [loading, setLoading] = useState(false);

  const icons = ['🏥', '💻', '📈', '🔧', '📖', '🎨', '🚗', '🍳', '⚖️', '🌱', '🎬', '✈️', '🔬', '🏗️', '🎯'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await onSave(formData);
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-3xl w-full max-w-md border border-slate-700 p-6">
        <h2 className="text-xl font-bold text-white mb-6">{initialData ? 'Edit Pathway' : 'Add CTE Pathway'}</h2>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Pathway Name</label>
            <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
              placeholder="e.g., Healthcare" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
            <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
              placeholder="e.g., Prepare for careers in medical services" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Icon</label>
            <div className="flex flex-wrap gap-2">
              {icons.map(icon => (
                <button key={icon} type="button" onClick={() => setFormData({ ...formData, icon })}
                  className={`text-2xl p-2 rounded-lg transition-all ${formData.icon === icon ? 'bg-emerald-500' : 'bg-slate-800 hover:bg-slate-700'}`}>
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Credits Required</label>
            <input type="number" required min="0.5" step="0.5" value={formData.credits_required}
              onChange={(e) => setFormData({ ...formData, credits_required: Number(e.target.value) })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500" />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose}
              className="flex-1 bg-slate-800 text-slate-300 font-medium py-3 rounded-xl hover:bg-slate-700 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-emerald-500 text-white font-semibold py-3 rounded-xl hover:bg-emerald-600 transition-all disabled:opacity-50">
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================
// STUDENT DASHBOARD
// ============================================

function StudentDashboard({ user, profile, onLogout }) {
  const [courses, setCourses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pathways, setPathways] = useState([]);
  const [coursePathways, setCoursePathways] = useState([]);
  const [counselors, setCounselors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const displayName = getDisplayName(profile);

  useEffect(() => {
    fetchData();
  }, [profile]);

  async function fetchData() {
    setLoading(true);
    
    // Log dashboard access
    await logAudit('view_dashboard', 'courses', user.id);
    
    const { data: catData } = await supabase
      .from('credit_categories')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('display_order');
    
    const { data: courseData } = await supabase
      .from('courses')
      .select('*')
      .eq('student_id', user.id);

    const { data: pathData } = await supabase
      .from('cte_pathways')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('display_order');

    const { data: cpData } = await supabase
      .from('course_pathways')
      .select('*');

    // Fetch counselors with scheduling links
    const { data: counselorData } = await supabase
      .from('profiles')
      .select('id, full_name, email, scheduling_link')
      .eq('school_id', profile.school_id)
      .eq('role', 'counselor');

    if (catData) setCategories(catData);
    if (courseData) setCourses(courseData);
    if (pathData) setPathways(pathData);
    if (cpData) setCoursePathways(cpData.filter(cp => courseData?.some(c => c.id === cp.course_id)));
    if (counselorData) setCounselors(counselorData.filter(c => c.scheduling_link));
    setLoading(false);
  }

  const stats = useMemo(() => calculateStudentStats(courses, categories), [courses, categories]);
  const alerts = useMemo(() => generateAlerts(profile, stats), [profile, stats]);
  const pathwayProgress = useMemo(() => calculatePathwayProgress(courses, pathways, coursePathways), [courses, pathways, coursePathways]);

  const handleAddCourse = async (courseData) => {
    const { selectedPathways, ...courseFields } = courseData;
    
    const { data, error } = await supabase
      .from('courses')
      .insert([{ ...courseFields, student_id: user.id }])
      .select()
      .single();
    
    if (data) {
      await logAudit('add_course', 'courses', data.id, { name: data.name });
      setCourses([...courses, data]);
      
      if (selectedPathways && selectedPathways.length > 0) {
        const pathwayLinks = selectedPathways.map(pathwayId => ({
          course_id: data.id,
          pathway_id: pathwayId
        }));
        
        const { data: cpData } = await supabase
          .from('course_pathways')
          .insert(pathwayLinks)
          .select();
        
        if (cpData) setCoursePathways([...coursePathways, ...cpData]);
      }
    }
    if (error) console.error('Error adding course:', error);
  };

  const handleDeleteCourse = async (id) => {
    const course = courses.find(c => c.id === id);
    await supabase.from('courses').delete().eq('id', id);
    await logAudit('delete_course', 'courses', id, { name: course?.name });
    setCourses(courses.filter(c => c.id !== id));
    setCoursePathways(coursePathways.filter(cp => cp.course_id !== id));
  };

  const getCategoryForCourse = (course) => categories.find(c => c.id === course.category_id);
  const getPathwaysForCourse = (course) => {
    const pathwayIds = coursePathways.filter(cp => cp.course_id === course.id).map(cp => cp.pathway_id);
    return pathways.filter(p => pathwayIds.includes(p.id));
  };

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
      </div>

      <header className="relative sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-white">{displayName}</h1>
              <p className="text-slate-400 text-sm">Class of {profile.graduation_year || 'N/A'}</p>
            </div>
            <div className="flex items-center gap-2">
              {counselors.length > 0 && (
                <button onClick={() => setShowScheduleModal(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white p-2.5 rounded-xl transition-all" title="Schedule Appointment">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </button>
              )}
              <button onClick={() => setShowPrivacyModal(true)} className="bg-slate-800 hover:bg-slate-700 text-white p-2.5 rounded-xl transition-all" title="Privacy Settings">              
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </button>
              <button onClick={() => setShowTranscriptModal(true)} className="bg-slate-800 hover:bg-slate-700 text-white p-2.5 rounded-xl transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </button>
              <button onClick={onLogout} className="bg-slate-800 hover:bg-slate-700 text-slate-400 p-2.5 rounded-xl transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative max-w-lg mx-auto px-4 pb-24">
        {activeTab === 'dashboard' && (
          <div className="py-6 space-y-6">
            <AlertBanner alerts={alerts} />

            <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 backdrop-blur-sm rounded-3xl p-6 border border-indigo-500/20">
              <div className="flex items-center gap-6">
                <CircularProgress percentage={stats.percentage} size={100} strokeWidth={8} color="#818cf8" bgColor="#334155">
                  <span className="text-2xl font-bold text-white">{stats.percentage}%</span>
                </CircularProgress>
                <div>
                  <h2 className="text-white font-bold text-lg mb-1">Graduation Progress</h2>
                  <p className="text-slate-300">
                    <span className="text-2xl font-bold text-white">{stats.totalEarned}</span>
                    <span className="text-slate-400"> / {stats.totalRequired} credits</span>
                  </p>
                  <p className="text-slate-400 text-sm mt-1">{stats.totalRequired - stats.totalEarned} credits remaining</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Credit Categories</h3>
              <div className="grid grid-cols-2 gap-3">
                {categories.map(cat => (
                  <CategoryCard key={cat.id} category={cat} earnedCredits={stats.creditsByCategory[cat.id] || 0}
                    onClick={() => { setSelectedCategory(cat.id); setActiveTab('courses'); }} />
                ))}
              </div>
            </div>

            {pathways.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">🎯 CTE Pathways</h3>
                <div className="space-y-3">
                  {pathwayProgress.map(pathway => (
                    <PathwayCard key={pathway.id} pathway={pathway} />
                  ))}
                </div>
              </div>
            )}

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
                {selectedCategory ? categories.find(c => c.id === selectedCategory)?.name : 'All Courses'}
              </h2>
              {selectedCategory && <button onClick={() => setSelectedCategory(null)} className="text-indigo-400 text-sm font-medium">View All</button>}
            </div>

            <div className="space-y-3">
              {courses.filter(c => !selectedCategory || c.category_id === selectedCategory).map(course => (
                <CourseItem key={course.id} course={course} category={getCategoryForCourse(course)} pathways={getPathwaysForCourse(course)} onDelete={handleDeleteCourse} />
              ))}
              {courses.filter(c => !selectedCategory || c.category_id === selectedCategory).length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <p>No courses yet</p>
                  <button onClick={() => setShowAddModal(true)} className="mt-4 text-indigo-400 font-medium">Add your first course</button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

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

      <AddCourseModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} onAdd={handleAddCourse} categories={categories} pathways={pathways} />
      <TranscriptModal isOpen={showTranscriptModal} onClose={() => setShowTranscriptModal(false)} profile={profile} courses={courses} categories={categories} pathways={pathways} pathwayProgress={pathwayProgress} stats={stats} />
      <PrivacySettingsModal isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)} profile={profile} />
      
      {/* Schedule Appointment Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-3xl w-full max-w-md border border-slate-700 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">📅 Schedule Appointment</h2>
              <button onClick={() => setShowScheduleModal(false)} className="text-slate-400 hover:text-white p-2">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <p className="text-slate-400 text-sm mb-4">Select a counselor to schedule an appointment:</p>
            
            <div className="space-y-3">
              {counselors.map(counselor => (
                  <a
                  key={counselor.id}
                  href={counselor.scheduling_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-xl p-4 transition-all text-left"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-medium">{counselor.full_name || counselor.email}</h3>
                      <p className="text-slate-400 text-sm">{counselor.email}</p>
                    </div>
                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </div>
                </a>
              ))}
            </div>
            
            <button onClick={() => setShowScheduleModal(false)}
              className="w-full mt-6 bg-slate-800 text-slate-300 font-medium py-3 rounded-xl hover:bg-slate-700 transition-all">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// COUNSELOR DASHBOARD
// ============================================

function CounselorDashboard({ user, profile, onLogout }) {
  const [students, setStudents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pathways, setPathways] = useState([]);
  const [coursePathways, setCoursePathways] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLinkParentModal, setShowLinkParentModal] = useState(false);
  const [showAddCourseModal, setShowAddCourseModal] = useState(false);
  const [parents, setParents] = useState([]);
  const [schedulingLink, setSchedulingLink] = useState(profile.scheduling_link || '');
  const displayName = getDisplayName(profile);

  useEffect(() => {
    fetchData();
  }, [profile]);

  async function fetchData() {
    setLoading(true);
    
    await logAudit('view_counselor_dashboard', 'profiles', null);

    const { data: catData } = await supabase
      .from('credit_categories')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('display_order');

    const { data: pathData } = await supabase
      .from('cte_pathways')
      .select('*')
      .eq('school_id', profile.school_id)
      .order('display_order');

    const { data: studentData } = await supabase
      .from('profiles')
      .select('*')
      .eq('school_id', profile.school_id)
      .eq('role', 'student');

    if (studentData) {
      const studentIds = studentData.map(s => s.id);
      const { data: courseData } = await supabase
        .from('courses')
        .select('*')
        .in('student_id', studentIds);

      const { data: cpData } = await supabase
        .from('course_pathways')
        .select('*');

      const studentsWithCourses = studentData.map(student => {
        const studentCourses = courseData?.filter(c => c.student_id === student.id) || [];
        const stats = calculateStudentStats(studentCourses, catData || []);
        const alerts = generateAlerts(student, stats);
        const studentCoursePathways = cpData?.filter(cp => studentCourses.some(c => c.id === cp.course_id)) || [];
        const pathwayProgress = calculatePathwayProgress(studentCourses, pathData || [], studentCoursePathways);
        return { ...student, courses: studentCourses, stats, alerts, pathwayProgress, coursePathways: studentCoursePathways, displayName: getDisplayName(student) };
      });

     setStudents(studentsWithCourses);
      if (cpData) setCoursePathways(cpData);
    }

    // Fetch parents
    const { data: parentData } = await supabase
      .from('profiles')
      .select('*')
      .eq('school_id', profile.school_id)
      .eq('role', 'parent');

    if (catData) setCategories(catData);
    if (pathData) setPathways(pathData);
    if (parentData) setParents(parentData);
    setLoading(false);
  }

  const getCategoryForCourse = (course) => categories.find(c => c.id === course.category_id);
  const getPathwaysForCourse = (course, studentCoursePathways) => {
    const pathwayIds = studentCoursePathways.filter(cp => cp.course_id === course.id).map(cp => cp.pathway_id);
    return pathways.filter(p => pathwayIds.includes(p.id));
  };

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><LoadingSpinner /></div>;

  const summaryStats = {
    total: students.length,
    atRisk: students.filter(s => s.alerts.some(a => a.type === 'critical')).length,
    onTrack: students.filter(s => s.stats.percentage >= 50).length,
    avgProgress: students.length > 0 ? Math.round(students.reduce((sum, s) => sum + s.stats.percentage, 0) / students.length) : 0
  };

  // Student Detail View
  if (selectedStudent) {
    const student = selectedStudent;
    const coursesByTerm = student.courses.reduce((acc, course) => {
      if (!acc[course.term]) acc[course.term] = [];
      acc[course.term].push(course);
      return acc;
    }, {});

    return (
      <div className="min-h-screen bg-slate-950 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
        </div>

        <header className="relative sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button onClick={() => setSelectedStudent(null)} 
                  className="bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-xl transition-all">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div>
                  <h1 className="text-lg font-bold text-white">{student.displayName}</h1>
                  <p className="text-slate-400 text-sm">Grade {student.grade} • Class of {student.graduation_year}</p>
                </div>
              </div>
            </div>
            <button onClick={() => setShowAddCourseModal(true)} className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl transition-all flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Course
            </button>
          </div>
        </header>

        <main className="relative max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* Alerts */}
          <AlertBanner alerts={student.alerts} />

          {/* Progress Overview */}
          <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 backdrop-blur-sm rounded-3xl p-6 border border-indigo-500/20">
            <div className="flex items-center gap-6">
              <CircularProgress percentage={student.stats.percentage} size={100} strokeWidth={8} color="#818cf8" bgColor="#334155">
                <span className="text-2xl font-bold text-white">{student.stats.percentage}%</span>
              </CircularProgress>
              <div>
                <h2 className="text-white font-bold text-lg mb-1">Graduation Progress</h2>
                <p className="text-slate-300">
                  <span className="text-2xl font-bold text-white">{student.stats.totalEarned}</span>
                  <span className="text-slate-400"> / {student.stats.totalRequired} credits</span>
                </p>
                <p className="text-slate-400 text-sm mt-1">{student.stats.totalRequired - student.stats.totalEarned} credits remaining</p>
              </div>
            </div>
          </div>

          {/* Credit Categories */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Credit Categories</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {categories.map(cat => {
                const earned = student.stats.creditsByCategory[cat.id] || 0;
                const required = Number(cat.credits_required);
                const isComplete = earned >= required;
                return (
                  <div key={cat.id} className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">{cat.icon || '📘'}</span>
                      {isComplete && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full font-medium">✓</span>}
                    </div>
                    <h4 className="text-white font-semibold text-sm mb-1">{cat.name}</h4>
                    <p className="text-slate-400 text-xs mb-2">{earned} / {required}</p>
                    <ProgressBar earned={earned} required={required} color={isComplete ? '#10b981' : '#6366f1'} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* CTE Pathways */}
          {student.pathwayProgress && student.pathwayProgress.length > 0 && student.pathwayProgress.some(p => p.earnedCredits > 0) && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">🎯 CTE Pathways</h3>
              <div className="space-y-3">
                {student.pathwayProgress.filter(p => p.earnedCredits > 0).map(pathway => (
                  <PathwayCard key={pathway.id} pathway={pathway} />
                ))}
              </div>
            </div>
          )}

          {/* Dual Credit Summary */}
          {student.stats.totalDualCredits > 0 && (
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-3xl p-6 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">🎓</span>
                <h2 className="text-lg font-bold text-white">Dual Credit Summary</h2>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{student.stats.totalDualCredits}</p>
                  <p className="text-slate-400 text-xs">Total</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-400">{student.stats.associateCredits}</p>
                  <p className="text-slate-400 text-xs">Associate</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-sky-400">{student.stats.transferCredits}</p>
                  <p className="text-slate-400 text-xs">Transfer</p>
                </div>
              </div>
            </div>
          )}

          {/* Courses by Term */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">📚 Course History</h3>
            {Object.entries(coursesByTerm).sort((a, b) => b[0].localeCompare(a[0])).map(([term, termCourses]) => (
              <div key={term} className="mb-4">
                <h4 className="text-slate-400 text-sm font-medium mb-2 px-1">{term}</h4>
                <div className="space-y-2">
                  {termCourses.map(course => (
                    <CourseItem 
                      key={course.id} 
                      course={course} 
                      category={getCategoryForCourse(course)} 
                      pathways={getPathwaysForCourse(course, student.coursePathways)}
                      showDelete={false}
                    />
                  ))}
                </div>
              </div>
            ))}
            {student.courses.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <p>No courses recorded yet.</p>
              </div>
            )}
          </div>
        </main>

        {/* Add Course Modal for Counselors */}
        {showAddCourseModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 rounded-3xl w-full max-w-md border border-slate-700 p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Add Course for {student.displayName}</h2>
                <button onClick={() => setShowAddCourseModal(false)} className="text-slate-400 hover:text-white p-2">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target;
                const courseData = {
                  name: form.courseName.value,
                  credits: parseFloat(form.credits.value),
                  category_id: form.category.value,
                  term: form.term.value,
                  grade: form.grade.value || null,
                  student_id: student.id
                };
                const { error } = await supabase.from('courses').insert([courseData]);
                if (!error) {
                  alert('Course added!');
                  setShowAddCourseModal(false);
                  fetchData();
                } else {
                  alert('Error: ' + error.message);
                }
              }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Course Name</label>
                    <input name="courseName" required className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white" placeholder="e.g. Algebra 1" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Credits</label>
                    <input name="credits" type="number" step="0.25" min="0.25" max="4" defaultValue="1" required className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Category</label>
                    <select name="category" required className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white">
                      <option value="">Select category...</option>
                      {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Term</label>
                    <select name="term" required className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white">
                      {['Fall 2024', 'Winter 2024', 'Spring 2025', 'Fall 2025', 'Winter 2025', 'Spring 2026', 'Fall 2026', 'Winter 2026', 'Spring 2027'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Grade (optional)</label>
                    <select name="grade" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white">
                      <option value="">No grade yet</option>
                      {['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'P', 'NP'].map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button type="button" onClick={() => setShowAddCourseModal(false)} className="flex-1 bg-slate-800 text-slate-300 font-medium py-3 rounded-xl hover:bg-slate-700 transition-all">Cancel</button>
                  <button type="submit" className="flex-1 bg-indigo-500 text-white font-semibold py-3 rounded-xl hover:bg-indigo-600 transition-all">Add Course</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Main Student List View
  return (
    <div className="min-h-screen bg-slate-950 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
      </div>

      <header className="relative sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-white">{displayName}</h1>
              <p className="text-slate-400 text-sm">School Counselor</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowLinkParentModal(true)} className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-2 rounded-xl transition-all text-sm" title="Link Parent">
                👨‍👩‍👧 Link Parent
              </button>
              <button onClick={() => setShowSettingsModal(true)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-xl transition-all" title="Settings">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </button>
              <button onClick={onLogout} className="bg-slate-800 hover:bg-slate-700 text-slate-400 px-4 py-2 rounded-xl transition-all flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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

        <div className="space-y-3">
          <h2 className="text-xl font-bold text-white">Students</h2>
          {students.length === 0 ? (
            <div className="text-center py-12 text-slate-400">No students have signed up yet.</div>
          ) : (
            students.map(student => (
              <button 
                key={student.id} 
                onClick={() => setSelectedStudent(student)}
                className="w-full bg-slate-900/80 rounded-2xl p-5 border border-slate-800 hover:bg-slate-800/80 hover:border-indigo-500/30 transition-all text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-white font-semibold">{student.displayName}</h3>
                      {student.alerts.some(a => a.type === 'critical') && (
                        <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full text-xs font-medium">At Risk</span>
                      )}
                    </div>
                    <p className="text-slate-400 text-sm">Grade {student.grade || 'N/A'} • Class of {student.graduation_year || 'N/A'}</p>
                    <p className="text-slate-500 text-xs mt-1">{student.courses.length} courses • {student.stats.totalEarned} credits earned</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <CircularProgress percentage={student.stats.percentage} size={50} strokeWidth={4}
                      color={student.stats.percentage >= 75 ? '#10b981' : student.stats.percentage >= 50 ? '#818cf8' : '#f59e0b'} bgColor="#334155">
                      <span className="text-xs font-bold text-white">{student.stats.percentage}%</span>
                    </CircularProgress>
                    <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </main>

      {/* Link Parent Modal */}
      {showLinkParentModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-3xl w-full max-w-md border border-slate-700 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">👨‍👩‍👧 Link Parent to Student</h2>
              <button onClick={() => setShowLinkParentModal(false)} className="text-slate-400 hover:text-white p-2">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {parents.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <p>No parent accounts found.</p>
                <p className="text-sm mt-2">Parents need to sign up first with the "Parent/Guardian" role.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-slate-400 text-sm">Select a parent and student to link:</p>
                {parents.map(parent => (
                  <div key={parent.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                    <h3 className="text-white font-medium mb-2">{parent.full_name || parent.email}</h3>
                    <p className="text-slate-400 text-sm mb-3">{parent.email}</p>
                    <div className="space-y-2">
                      {students.map(student => (
                        <button
                          key={student.id}
                          onClick={async () => {
                            const { error } = await supabase.from('parent_students').insert([{ parent_id: parent.id, student_id: student.id, created_by: profile.id }]);
                            if (!error) { alert('Parent linked successfully!'); }
                            else if (error.code === '23505') { alert('Already linked.'); }
                            else { alert('Error: ' + error.message); }
                          }}
                          className="w-full flex items-center justify-between bg-slate-700/50 hover:bg-slate-700 px-3 py-2 rounded-lg transition-all text-left"
                        >
                          <span className="text-white text-sm">{student.displayName}</span>
                          <span className="text-slate-400 text-xs">Grade {student.grade}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <button onClick={() => setShowLinkParentModal(false)}
              className="w-full mt-6 bg-slate-800 text-slate-300 font-medium py-3 rounded-xl hover:bg-slate-700 transition-all">
              Close
            </button>
          </div>
        </div>
      )}

    
      {/* Settings Modal */}

      {/* Settings Modal */}
      {/* Settings Modal */}
      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-3xl w-full max-w-md border border-slate-700 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">⚙️ Settings</h2>
              <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-white p-2">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">📅 Scheduling Link (Zoom Calendar)</label>
                <input
                  type="url"
                  value={schedulingLink}
                  onChange={(e) => setSchedulingLink(e.target.value)}
                  placeholder="https://zoom.us/schedule/..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <p className="text-slate-500 text-xs mt-2">Students will see a "Schedule Appointment" button that opens this link.</p>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowSettingsModal(false)}
                className="flex-1 bg-slate-800 text-slate-300 font-medium py-3 rounded-xl hover:bg-slate-700 transition-all">
                Cancel
              </button>
             <button onClick={async () => { alert('Saving...'); await supabase.from('profiles').update({ scheduling_link: schedulingLink }).eq('id', profile.id); alert('Saved!'); setShowSettingsModal(false); }}
                className="flex-1 bg-indigo-500 text-white font-semibold py-3 rounded-xl hover:bg-indigo-600 transition-all">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// PARENT DASHBOARD
function ParentDashboard({ user, profile, onLogout }) {
  const [linkedStudents, setLinkedStudents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const displayName = getDisplayName(profile);

  useEffect(() => {
    fetchLinkedStudents();
  }, [profile]);

  async function fetchLinkedStudents() {
    setLoading(true);
    
    const { data: links } = await supabase
      .from('parent_students')
      .select('student_id')
      .eq('parent_id', profile.id);

    if (links && links.length > 0) {
      const studentIds = links.map(l => l.student_id);
      
      const { data: studentData } = await supabase
        .from('profiles')
        .select('*')
        .in('id', studentIds);

      const { data: catData } = await supabase
        .from('credit_categories')
        .select('*')
        .eq('school_id', profile.school_id)
        .order('display_order');

      const { data: courseData } = await supabase
        .from('courses')
        .select('*')
        .in('student_id', studentIds);

      if (studentData) {
        const studentsWithStats = studentData.map(student => {
          const studentCourses = courseData?.filter(c => c.student_id === student.id) || [];
          const stats = calculateStudentStats(studentCourses, catData || []);
          const alerts = generateAlerts(student, stats);
          return { ...student, courses: studentCourses, stats, alerts, displayName: getDisplayName(student) };
        });
        setLinkedStudents(studentsWithStats);
      }
      if (catData) setCategories(catData);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (linkedStudents.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
        <div className="text-center p-8">
          <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">👨‍👩‍👧</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Parent Portal</h1>
          <p className="text-slate-400 mb-6">Welcome, {displayName}</p>
          <p className="text-slate-500 text-sm mb-6">
            No students linked to your account yet.<br />
            Contact your school counselor to link your student.
          </p>
          <button onClick={onLogout} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-6 py-3 rounded-xl transition-all">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (selectedStudent) {
    const student = selectedStudent;
    return (
      <div className="min-h-screen bg-slate-950 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
        <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => setSelectedStudent(null)} className="bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-xl">
                ← Back
              </button>
              <div>
                <h1 className="text-lg font-bold text-white">{student.displayName}</h1>
                <p className="text-slate-400 text-sm">Grade {student.grade} • Class of {student.graduation_year}</p>
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {student.alerts.length > 0 && student.alerts.map((alert, i) => (
            <div key={i} className={`p-4 rounded-xl ${alert.type === 'critical' ? 'bg-red-500/20 border border-red-500/30' : alert.type === 'warning' ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-emerald-500/20 border border-emerald-500/30'}`}>
              <span className="mr-2">{alert.icon}</span>{alert.message}
            </div>
          ))}
          <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 rounded-3xl p-6 border border-indigo-500/20">
            <div className="flex items-center gap-6">
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 transform -rotate-90"><circle cx="48" cy="48" r="40" stroke="#334155" strokeWidth="8" fill="none" /><circle cx="48" cy="48" r="40" stroke="#818cf8" strokeWidth="8" fill="none" strokeDasharray={251.2} strokeDashoffset={251.2 - (251.2 * student.stats.percentage / 100)} strokeLinecap="round" /></svg>
                <div className="absolute inset-0 flex items-center justify-center"><span className="text-2xl font-bold text-white">{student.stats.percentage}%</span></div>
              </div>
              <div>
                <h2 className="text-white font-bold text-lg mb-1">Graduation Progress</h2>
                <p className="text-slate-300"><span className="text-2xl font-bold text-white">{student.stats.totalEarned}</span><span className="text-slate-400"> / {student.stats.totalRequired} credits</span></p>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Credit Categories</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {categories.map(cat => {
                const earned = student.stats.creditsByCategory[cat.id] || 0;
                const required = Number(cat.credits_required);
                return (
                  <div key={cat.id} className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
                    <span className="text-2xl">{cat.icon}</span>
                    <h4 className="text-white font-semibold text-sm mt-2">{cat.name}</h4>
                    <p className="text-slate-400 text-xs">{earned} / {required} credits</p>
                    <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, (earned/required)*100)}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">📚 Courses ({student.courses.length})</h3>
            <div className="space-y-2">
              {student.courses.map(course => {
                const cat = categories.find(c => c.id === course.category_id);
                return (
                  <div key={course.id} className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-white font-medium">{course.name}</h4>
                        <p className="text-slate-400 text-sm">{cat?.icon} {cat?.name} • {course.credits} credits • {course.term}</p>
                      </div>
                      {course.grade && <span className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-300">{course.grade}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">👨‍👩‍👧 Parent Portal</h1>
            <p className="text-slate-400 text-sm">{displayName}</p>
          </div>
          <button onClick={onLogout} className="bg-slate-800 hover:bg-slate-700 text-slate-400 px-4 py-2 rounded-xl transition-all">
            Sign Out
          </button>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">
        <h2 className="text-xl font-bold text-white mb-4">My Students</h2>
        <div className="space-y-3">
          {linkedStudents.map(student => (
            <button key={student.id} onClick={() => setSelectedStudent(student)}
              className="w-full bg-slate-900/80 rounded-2xl p-5 border border-slate-800 hover:bg-slate-800/80 hover:border-indigo-500/30 transition-all text-left">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-white font-semibold">{student.displayName}</h3>
                    {student.alerts.some(a => a.type === 'critical') && (
                      <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full text-xs font-medium">At Risk</span>
                    )}
                  </div>
                  <p className="text-slate-400 text-sm">Grade {student.grade} • Class of {student.graduation_year}</p>
                  <p className="text-slate-500 text-xs mt-1">{student.courses.length} courses • {student.stats.totalEarned} credits earned</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-white">{student.stats.percentage}%</div>
                  <p className="text-slate-400 text-xs">complete</p>
                </div>
              </div>
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
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user || !profile) {
    return <AuthScreen onLogin={(user) => { setUser(user); fetchProfile(user.id); }} />;
  }

  if (profile.role === 'admin') {
    return <AdminDashboard user={user} profile={profile} onLogout={handleLogout} />;
  }

  if (profile.role === 'counselor') {
    return <CounselorDashboard user={user} profile={profile} onLogout={handleLogout} />;
  }

  if (profile.role === 'parent') {
    return <ParentDashboard user={user} profile={profile} onLogout={handleLogout} />;
  }

  return <StudentDashboard user={user} profile={profile} onLogout={handleLogout} />;
}
