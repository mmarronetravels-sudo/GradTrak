// ============================================
// SendAdvisingEmail.jsx
// GradTrack - Send Notes/Plan via Email
// February 2026
// ============================================
// Usage in App.jsx:
//   import SendAdvisingEmail from './SendAdvisingEmail';
//   
//   // In counselor student detail view:
//   <SendAdvisingEmail
//     isOpen={showEmailModal}
//     onClose={() => setShowEmailModal(false)}
//     student={selectedStudent}
//     notes={studentNotes}
//     categories={categories}
//     counselorProfile={profile}
//     supabaseClient={supabase}
//   />
// ============================================

import React, { useState, useMemo } from 'react';

export default function SendAdvisingEmail({
  isOpen,
  onClose,
  student,
  notes = [],
  categories = [],
  counselorProfile,
  supabaseClient,
}) {
  const [contentType, setContentType] = useState('both');
  const [ccEmails, setCcEmails] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [includeStudent, setIncludeStudent] = useState(false);

  // -- Default Subject --
  const defaultSubject = useMemo(() => {
    if (!student) return 'Advising Summary';
    const name = student.full_name || 'Student';
    if (contentType === 'notes') return `Advising Notes - ${name}`;
    if (contentType === 'plan') return `Graduation Progress - ${name}`;
    return `Advising Summary - ${name}`;
  }, [contentType, student]);

  const subject = customSubject || defaultSubject;

  // -- Guard AFTER all hooks --
  if (!isOpen || !student) return null;

  // -- Build Notes HTML --
  function buildNotesHtml() {
    if (!notes || notes.length === 0) {
      return '<p style="color: #94a3b8; font-style: italic;">No advising notes on record.</p>';
    }

    // Show up to 10 most recent notes
    return notes.slice(0, 10).map(note => {
      const noteDate = new Date(note.created_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
      const typeLabel = note.note_type
        ? note.note_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : '';
      const statusColor = note.status === 'completed' ? '#16a34a' : '#ea580c';
      const statusBg = note.status === 'completed' ? '#d1fae5' : '#fef3c7';
      const statusLabel = note.status === 'completed' ? 'Completed' : 'Open';

      return `
        <div style="padding: 12px 16px; margin-bottom: 8px; background: #f8fafc; border-radius: 8px; border-left: 3px solid #4f46e5;">
          <div style="font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 6px;">
            ${noteDate}${typeLabel ? ` - ${typeLabel}` : ''}
            ${note.status ? ` <span style="background: ${statusBg}; color: ${statusColor}; padding: 1px 8px; border-radius: 12px; font-size: 10px; font-weight: 600;">${statusLabel}</span>` : ''}
          </div>
          <div style="font-size: 13px; color: #334155; line-height: 1.6;">
            ${escapeHtml(note.note || note.content || note.note_text || '').replace(/\n/g, '<br>')}
          </div>
          ${note.follow_up_date ? `
            <div style="font-size: 12px; color: #4f46e5; font-style: italic; margin-top: 8px;">
              Follow-up: ${new Date(note.follow_up_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  // -- Build Plan HTML --
  function buildPlanHtml() {
    const studentCourses = student.courses || [];
    const completedCourses = studentCourses.filter(c => c.status === 'completed');
    const currentCourses = studentCourses.filter(c => c.status === 'in_progress');

    // Category progress
    const categoryProgress = (categories || []).map(cat => {
      const earned = Math.round(
        completedCourses
          .filter(c => c.category_id === cat.id)
          .reduce((sum, c) => sum + Number(c.credits || 0), 0) * 10
      ) / 10;
      const required = Number(cat.credits_required) || 0;
      return { name: cat.name, earned, required };
    }).filter(c => c.required > 0);

    const totalEarned = Math.round(
      categoryProgress.reduce((sum, c) => sum + c.earned, 0) * 10
    ) / 10;
    const totalRequired = categoryProgress.reduce((sum, c) => sum + c.required, 0);
    const progressPercent = totalRequired > 0 ? Math.round((totalEarned / totalRequired) * 100) : 0;

    // Flags
    const flags = [];
    if (student.has_iep) flags.push('<span style="background: #f3e8ff; color: #7c3aed; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; display: inline-block; margin-left: 4px;">IEP</span>');
    if (student.has_504) flags.push('<span style="background: #fff7ed; color: #ea580c; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; display: inline-block; margin-left: 4px;">504</span>');
    if (student.is_ell) flags.push('<span style="background: #ecfeff; color: #0891b2; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; display: inline-block; margin-left: 4px;">ELL</span>');

    let html = `
      <!-- Student Info Row -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
        <tr>
          <td style="padding: 8px 0;">
            <strong style="font-size: 15px; color: #1e293b;">${escapeHtml(student.full_name)}</strong>
            ${flags.join('')}
          </td>
        </tr>
        <tr>
          <td style="font-size: 13px; color: #64748b;">
            Grade ${student.grade || 'N/A'} | Class of ${student.graduation_year || 'N/A'}
            ${student.diploma_type_name ? ` | ${escapeHtml(student.diploma_type_name)} Diploma` : ''}
          </td>
        </tr>
      </table>

      <!-- Progress Bar -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
        <tr>
          <td style="background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 16px 20px; border-radius: 8px; font-size: 18px; font-weight: 700; text-align: center;">
            ${totalEarned} / ${totalRequired} credits earned (${progressPercent}%)
          </td>
        </tr>
      </table>

      <!-- Credit Category Table -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background: #f1f5f9;">
            <th style="text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0;">Category</th>
            <th style="text-align: center; padding: 8px 12px; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0;">Earned</th>
            <th style="text-align: center; padding: 8px 12px; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0;">Required</th>
            <th style="text-align: center; padding: 8px 12px; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${categoryProgress.map(cat => {
            const met = cat.earned >= cat.required;
            return `
            <tr>
              <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155;">${escapeHtml(cat.name)}</td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155; text-align: center;">${cat.earned}</td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155; text-align: center;">${cat.required}</td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: center; color: ${met ? '#16a34a' : '#ea580c'}; font-weight: 600;">
                ${met ? 'Complete' : `${Math.round((cat.required - cat.earned) * 10) / 10} needed`}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;

    // Current courses
    if (currentCourses.length > 0) {
      html += `
        <p style="font-size: 14px; font-weight: 600; color: #1e293b; margin: 20px 0 8px 0;">Current Courses (${currentCourses.length})</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0;">Course</th>
              <th style="text-align: center; padding: 8px 12px; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0;">Credits</th>
              <th style="text-align: center; padding: 8px 12px; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0;">Term</th>
            </tr>
          </thead>
          <tbody>
            ${currentCourses.map(c => `
              <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155;">${escapeHtml(c.name || '')}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155; text-align: center;">${c.credits || '-'}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155; text-align: center;">${c.term || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    return html;
  }

  // -- Send Handler --
  async function handleSend() {
    setSending(true);
    setError('');

    try {
      const ccList = ccEmails
        .split(/[,;\n]+/)
        .map(e => e.trim())
        .filter(e => e && e.includes('@'));

      if (!includeStudent && ccList.length === 0) {
        setError('Please select the student or add at least one CC recipient.');
        setSending(false);
        return;
      }

      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) throw new Error('Not authenticated - please log in again');

      // Determine Supabase URL from the client
      const supabaseUrl = supabaseClient.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '';

      const response = await fetch(
        `${supabaseUrl}/functions/v1/send-advising-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            studentId: student.id,
            studentName: student.full_name,
            studentEmail: includeStudent ? student.email : null,
            recipientEmails: ccList,
            subject,
            contentType,
            notesHtml: (contentType === 'notes' || contentType === 'both') ? buildNotesHtml() : null,
            planHtml: (contentType === 'plan' || contentType === 'both') ? buildPlanHtml() : null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details?.message || 'Failed to send email');
      }

      setSent(true);
    } catch (err) {
      console.error('Email send error:', err);
      setError(err.message || 'Something went wrong');
    } finally {
      setSending(false);
    }
  }

  // -- Reset & Close --
  function handleClose() {
    setSent(false);
    setError('');
    setCcEmails('');
    setCustomSubject('');
    setContentType('both');
    onClose();
  }

  // ===================================
  //  RENDER - Success State
  // ===================================
  if (sent) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
           onClick={handleClose}>
        <div className="bg-slate-900 rounded-2xl w-full max-w-md border border-slate-700 p-8 text-center"
             onClick={e => e.stopPropagation()}>
          <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">&#x2705;</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Email Sent!</h2>
          <p className="text-slate-400 text-sm mb-1">
            {contentType === 'notes' ? 'Advising notes' : contentType === 'plan' ? 'Graduation progress' : 'Advising summary'} sent to:
          </p>
          <p className="text-indigo-400 text-sm font-medium mb-1">{student.email}</p>
          {ccEmails && (
            <p className="text-slate-500 text-xs">
              CC: {ccEmails.split(/[,;\n]+/).filter(e => e.trim()).join(', ')}
            </p>
          )}
          <p className="text-slate-600 text-xs mt-3 mb-6">This email has been logged for FERPA audit compliance.</p>
          <button
            onClick={handleClose}
            className="w-full bg-slate-800 text-slate-300 font-medium py-3 rounded-xl hover:bg-slate-700 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ===================================
  //  RENDER - Email Compose Form
  // ===================================
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
         onClick={handleClose}>
      <div className="bg-slate-900 rounded-2xl w-full max-w-lg border border-slate-700 max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-0">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>&#x1F4E7;</span> Send Advising Email
          </h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* — Student / To — */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center text-lg">
                👤
              </div>
              <div>
                <p className="text-white font-medium text-sm">{student.full_name}</p>
                <p className="text-slate-400 text-xs">{student.email}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {student.has_iep && <span className="bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full text-xs font-medium">IEP</span>}
                {student.has_504 && <span className="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full text-xs font-medium">504</span>}
                {student.is_ell && <span className="bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full text-xs font-medium">ELL</span>}
                <label className="flex items-center gap-1.5 cursor-pointer ml-2">
                  <input
                    type="checkbox"
                    checked={includeStudent}
                    onChange={(e) => setIncludeStudent(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 text-indigo-500 focus:ring-indigo-500 bg-slate-700"
                  />
                  <span className="text-xs text-slate-300">Send to student</span>
                </label>
              </div>
            </div>
          </div>

          {/* Content Type Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Include in email:</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'notes', icon: '\u{1F4DD}', label: 'Notes', desc: 'Recent notes' },
                { value: 'plan', icon: '\u{1F4CB}', label: 'Plan', desc: 'Credit progress' },
                { value: 'both', icon: '\u{1F4CB}\u{1F4DD}', label: 'Both', desc: 'Full summary' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setContentType(opt.value)}
                  className={`p-3 rounded-xl text-center transition-all border ${
                    contentType === opt.value
                      ? 'bg-indigo-500/20 border-indigo-500/50 text-white'
                      : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-lg block">{opt.icon}</span>
                  <span className="text-xs font-medium block mt-1">{opt.label}</span>
                  <span className="text-xs opacity-60 block">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Subject</label>
            <input
              type="text"
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              placeholder={defaultSubject}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* CC Recipients */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              CC - Teachers, Family, Others
            </label>
            <textarea
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
              placeholder={"teacher@summitlc.org, parent@email.com\n(separate with commas or new lines)"}
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            />
            <p className="text-slate-600 text-xs mt-1">
              Separate multiple emails with commas, semicolons, or new lines
            </p>
          </div>

          {/* Preview Summary */}
          <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
            <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">&#x1F4AC; Preview</h4>
            <div className="text-sm space-y-1">
              <p className="text-slate-400"><span className="text-slate-600 inline-block w-16">From:</span> GradTrack ({counselorProfile?.email})</p>
              <p className="text-slate-400"><span className="text-slate-600 inline-block w-16">To:</span> {includeStudent ? student.email : '(CC recipients only)'}</p>
              {ccEmails.trim() && <p className="text-slate-400"><span className="text-slate-600 inline-block w-16">CC:</span> {ccEmails.split(/[,;\n]+/).filter(e => e.trim()).join(', ')}</p>}
              <p className="text-slate-400"><span className="text-slate-600 inline-block w-16">Subject:</span> {subject}</p>
              <p className="text-slate-400"><span className="text-slate-600 inline-block w-16">Content:</span> {
                contentType === 'notes' ? `${Math.min(notes.length, 10)} recent notes` :
                contentType === 'plan' ? 'Credit progress, current courses' :
                `Credit progress + ${Math.min(notes.length, 10)} recent notes`
              }</p>
            </div>
          </div>

          {/* FERPA Notice */}
          <div className="bg-amber-500/10 rounded-xl p-3 border border-amber-500/20">
            <p className="text-amber-400/80 text-xs">
              &#x1F512; Includes FERPA confidentiality notice. All sends are logged for audit compliance.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleClose}
              className="flex-1 bg-slate-800 text-slate-300 font-medium py-3 rounded-xl hover:bg-slate-700 transition-all text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-3 rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              {sending ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending...
                </>
              ) : (
                <>&#x1F4E7; Send Email</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -- Helper --
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
