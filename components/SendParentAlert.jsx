// ============================================
// SendParentAlert.jsx
// GradTrack — Alert Parent: Student Behind in Coursework
// February 2026
// ============================================
// Usage in App.jsx:
//   import SendParentAlert from './components/SendParentAlert';
//
//   // In counselor student detail view (Notes tab):
//   <SendParentAlert
//     isOpen={showParentAlertModal}
//     onClose={() => setShowParentAlertModal(false)}
//     student={selectedStudent}
//     counselorProfile={profile}
//     supabaseClient={supabase}
//     onNoteSaved={() => refetchNotes()}
//   />
// ============================================

import React, { useState, useEffect } from 'react';

export default function SendParentAlert({
  isOpen,
  onClose,
  student,
  counselorProfile,
  supabaseClient,
  onNoteSaved,
}) {
  const [parentEmail, setParentEmail] = useState('');
  const [linkedParentEmail, setLinkedParentEmail] = useState('');
  const [linkedParentName, setLinkedParentName] = useState('');
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loadingParent, setLoadingParent] = useState(false);

  // Fetch linked parent when modal opens
  useEffect(() => {
    if (!isOpen || !student?.id) return;

    async function fetchLinkedParent() {
      setLoadingParent(true);
      try {
        // Look up parent_students link, then get parent profile
        const { data: links } = await supabaseClient
          .from('parent_students')
          .select('parent_id')
          .eq('student_id', student.id);

        if (links && links.length > 0) {
          const { data: parentProfile } = await supabaseClient
            .from('profiles')
            .select('email, full_name')
            .eq('id', links[0].parent_id)
            .single();

          if (parentProfile?.email) {
            setLinkedParentEmail(parentProfile.email);
            setLinkedParentName(parentProfile.full_name || '');
            setParentEmail(parentProfile.email);
          }
        }
      } catch (err) {
        console.error('Error fetching linked parent:', err);
      } finally {
        setLoadingParent(false);
      }
    }

    fetchLinkedParent();
  }, [isOpen, student?.id]);

  // Set default message and subject when modal opens
  useEffect(() => {
    if (!isOpen || !student) return;

    const counselorName = counselorProfile?.full_name || 'Your student\'s advisor';
    const studentName = student.full_name || 'your student';

    setSubject(`Coursework Update — ${studentName}`);
    setMessage(
      `Dear Parent/Guardian,\n\n` +
      `This is ${counselorName} from Summit Learning Charter. I wanted to reach out to let you know that ${studentName} appears to be behind in their current coursework.\n\n` +
      `We want to work together to help them get back on track. Please don't hesitate to reach out if you'd like to discuss this further or schedule a meeting.\n\n` +
      `Thank you for your partnership in your student's education.\n\n` +
      `Best regards,\n${counselorName}`
    );
  }, [isOpen, student?.id]);

  if (!isOpen || !student) return null;

  // Current in-progress courses for reference
  const currentCourses = (student.courses || []).filter(c => c.status === 'in_progress');

  // Build HTML email body from the message text
  function buildAlertHtml() {
    const messageHtml = escapeHtml(message).replace(/\n/g, '<br>');

    let html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #dc2626, #ea580c); color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px; font-weight: 700;">Coursework Update</h2>
          <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">${escapeHtml(student.full_name)} — Summit Learning Charter</p>
        </div>
        <div style="padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none;">
          <div style="font-size: 14px; color: #334155; line-height: 1.7;">
            ${messageHtml}
          </div>
    `;

    // Add current courses table if student has in-progress courses
    if (currentCourses.length > 0) {
      html += `
          <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
            <p style="font-size: 14px; font-weight: 600; color: #1e293b; margin: 0 0 12px 0;">Current Courses (${currentCourses.length})</p>
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
                    <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155; text-align: center;">${c.credits || '—'}</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155; text-align: center;">${c.term || '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
      `;
    }

    // Scheduling link if counselor has one
    if (counselorProfile?.scheduling_link) {
      html += `
          <div style="margin-top: 24px; padding: 16px; background: #eff6ff; border-radius: 8px; text-align: center;">
            <p style="font-size: 13px; color: #1e40af; margin: 0 0 8px 0; font-weight: 600;">Schedule a Meeting</p>
            <a href="${escapeHtml(counselorProfile.scheduling_link)}" style="display: inline-block; background: #3b82f6; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600;">Book a Time</a>
          </div>
      `;
    }

    // FERPA notice + footer
    html += `
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
            <p style="font-size: 11px; color: #94a3b8; line-height: 1.5;">
              CONFIDENTIALITY NOTICE: This email contains educational records protected under FERPA (20 U.S.C. 1232g). 
              It is intended solely for the recipient(s) listed above. If you received this in error, please delete it 
              and notify the sender immediately.
            </p>
          </div>
        </div>
      </div>
    `;

    return html;
  }

  // Send the alert email
  async function handleSend() {
    if (!parentEmail.trim() || !parentEmail.includes('@')) {
      setError('Please enter a valid parent email address.');
      return;
    }
    if (!message.trim()) {
      setError('Please enter a message.');
      return;
    }

    setSending(true);
    setError('');

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) throw new Error('Not authenticated — please log in again');

      const supabaseUrl = supabaseClient.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '';

      // Send via the existing edge function
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
            studentEmail: parentEmail.trim(),
            recipientEmails: [],
            subject: subject,
            contentType: 'plan',
            notesHtml: null,
            planHtml: buildAlertHtml(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details?.message || 'Failed to send email');
      }

      // Auto-log a parent_contact note on the student timeline
      try {
        const token = session.access_token;
        await fetch(
          `${supabaseUrl}/rest/v1/student_notes`,
          {
            method: 'POST',
            headers: {
              'apikey': supabaseClient.supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
              'Authorization': 'Bearer ' + token,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
              student_id: student.id,
              counselor_id: counselorProfile.id,
              note: `Parent alert email sent to ${parentEmail.trim()} — Student behind in coursework.`,
              note_type: 'parent_contact',
              status: 'completed',
              contact_date: new Date().toLocaleDateString('en-CA'),
            }),
          }
        );
        // Trigger notes refresh in parent component
        if (onNoteSaved) onNoteSaved();
      } catch (noteErr) {
        console.error('Failed to auto-log parent contact note:', noteErr);
        // Don't block success — email was sent
      }

      setSent(true);
    } catch (err) {
      console.error('Parent alert send error:', err);
      setError(err.message || 'Something went wrong');
    } finally {
      setSending(false);
    }
  }

  // Reset & Close
  function handleClose() {
    setSent(false);
    setError('');
    setParentEmail(linkedParentEmail || '');
    setMessage('');
    setSubject('');
    onClose();
  }

  // ═══════════════════════════════════
  //  RENDER — Success State
  // ═══════════════════════════════════
  if (sent) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
           onClick={handleClose}>
        <div className="bg-slate-900 rounded-2xl w-full max-w-md border border-slate-700 p-8 text-center"
             onClick={e => e.stopPropagation()}>
          <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">&#x2705;</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Alert Sent!</h2>
          <p className="text-slate-400 text-sm mb-1">
            Parent coursework alert sent to:
          </p>
          <p className="text-amber-400 text-sm font-medium mb-1">{parentEmail}</p>
          <p className="text-slate-500 text-xs mt-2">
            A parent contact note has been added to {student.full_name}'s timeline.
          </p>
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

  // ═══════════════════════════════════
  //  RENDER — Alert Compose Form
  // ═══════════════════════════════════
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
         onClick={handleClose}>
      <div className="bg-slate-900 rounded-2xl w-full max-w-lg border border-slate-700 max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-0">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>&#x26A0;&#xFE0F;</span> Alert Parent
          </h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Student Info */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center text-lg">
                &#x1F468;&#x200D;&#x1F469;&#x200D;&#x1F467;
              </div>
              <div>
                <p className="text-white font-medium text-sm">{student.full_name}</p>
                <p className="text-slate-400 text-xs">
                  Grade {student.grade || 'N/A'} &middot; Class of {student.graduation_year || 'N/A'}
                  {currentCourses.length > 0 && ` \u00B7 ${currentCourses.length} current course${currentCourses.length !== 1 ? 's' : ''}`}
                </p>
              </div>
              <div className="ml-auto flex gap-1">
                {student.has_iep && <span className="bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full text-xs font-medium">IEP</span>}
                {student.has_504 && <span className="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full text-xs font-medium">504</span>}
                {student.is_ell && <span className="bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full text-xs font-medium">ELL</span>}
              </div>
            </div>
          </div>

          {/* Parent Email */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Parent/Guardian Email
            </label>
            {loadingParent ? (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 rounded-xl border border-slate-700">
                <svg className="animate-spin h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-slate-500 text-sm">Looking up linked parent...</span>
              </div>
            ) : (
              <>
                <input
                  type="email"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  placeholder="parent@email.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                />
                {linkedParentName && linkedParentEmail && (
                  <p className="text-emerald-400 text-xs mt-1">
                    &#x2714; Linked parent: {linkedParentName} ({linkedParentEmail})
                  </p>
                )}
                {!linkedParentEmail && !loadingParent && (
                  <p className="text-slate-500 text-xs mt-1">
                    No linked parent found — enter email manually
                  </p>
                )}
              </>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors resize-none leading-relaxed"
            />
            <p className="text-slate-600 text-xs mt-1">
              Edit freely — current courses will be listed below the message automatically
            </p>
          </div>

          {/* Current Courses Preview */}
          {currentCourses.length > 0 && (
            <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
              <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
                &#x1F4DA; Current Courses (auto-included in email)
              </h4>
              <div className="space-y-1">
                {currentCourses.map((c, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-slate-300">{c.name}</span>
                    <span className="text-slate-500">{c.credits} cr &middot; {c.term || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scheduling Link Note */}
          {counselorProfile?.scheduling_link && (
            <div className="bg-blue-500/10 rounded-xl p-3 border border-blue-500/20">
              <p className="text-blue-400/80 text-xs">
                &#x1F4C5; Your scheduling link will be included so the parent can book a meeting.
              </p>
            </div>
          )}

          {/* FERPA Notice */}
          <div className="bg-amber-500/10 rounded-xl p-3 border border-amber-500/20">
            <p className="text-amber-400/80 text-xs">
              &#x1F512; Includes FERPA confidentiality notice. All sends are logged for audit compliance.
              A parent contact note will be auto-added to the student's timeline.
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
              disabled={sending || !parentEmail.trim()}
              className="flex-1 bg-gradient-to-r from-amber-500 to-red-500 text-white font-semibold py-3 rounded-xl hover:from-amber-600 hover:to-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
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
                <>&#x26A0;&#xFE0F; Send Alert</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// — Helper —
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
