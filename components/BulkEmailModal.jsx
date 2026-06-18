// ============================================
// BulkEmailModal.jsx
// GradTrack - Email a filtered group of students at once
// June 2026
// ============================================
// Lets an advisor (counselor / case_manager / admin) email a defined group
// of students in one action, and logs one `student_notes` contact per
// recipient (note_type = 'bulk_email', status = 'completed').
//
// Usage in App.jsx (CounselorDashboard roster view):
//   import BulkEmailModal from './components/BulkEmailModal';
//
//   <BulkEmailModal
//     isOpen={showBulkEmailModal}
//     onClose={() => setShowBulkEmailModal(false)}
//     students={filteredStudents}      // in-scope list (already caseload/roster filtered)
//     pathways={pathways}
//     categories={categories}
//     counselorProfile={profile}
//     supabaseClient={supabase}
//     getRiskLevel={getStudentRiskLevel}
//     onSent={() => setNotesRefreshKey(k => k + 1)}
//   />
// ============================================

import React, { useState, useMemo } from 'react';

// Supabase project ref (matches the hardcoded auth-token key used elsewhere
// in this codebase for the localStorage token fallback).
const SUPABASE_PROJECT_REF = 'vstiweftxjaszhnjwggb';
const AUTH_TOKEN_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

export default function BulkEmailModal({
  isOpen,
  onClose,
  students = [],
  pathways = [],
  categories = [],
  counselorProfile,
  supabaseClient,
  getRiskLevel,
  onSent,
}) {
  const [groupBy, setGroupBy] = useState('all');
  const [groupValue, setGroupValue] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [includeProgress, setIncludeProgress] = useState(false);
  const [deselected, setDeselected] = useState(() => new Set());
  const [phase, setPhase] = useState('compose'); // 'compose' | 'sending' | 'done'
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState([]); // [{ id, name, email, status, error }]
  const [error, setError] = useState('');

  // --- Available grade / pathway options derived from the in-scope students ---
  const gradeOptions = useMemo(() => {
    return [...new Set(students.map(s => s.grade).filter(g => g != null))].sort(
      (a, b) => Number(a) - Number(b)
    );
  }, [students]);

  // Only show pathways that at least one in-scope student is actually enrolled in.
  const pathwayOptions = useMemo(() => {
    const ids = new Set();
    students.forEach(s => {
      (s.pathwayProgress || []).forEach(p => {
        if ((p.courses?.length || 0) > 0) ids.add(p.id);
      });
    });
    return (pathways || []).filter(p => ids.has(p.id));
  }, [students, pathways]);

  // --- Compute the group based on the selected filter ---
  const groupStudents = useMemo(() => {
    const active = students.filter(s => s.is_active !== false);
    switch (groupBy) {
      case 'grade':
        return groupValue ? active.filter(s => String(s.grade) === String(groupValue)) : [];
      case 'risk':
        if (!groupValue || typeof getRiskLevel !== 'function') return [];
        return active.filter(s => getRiskLevel(s) === groupValue);
      case 'pathway':
        return groupValue
          ? active.filter(s =>
              (s.pathwayProgress || []).some(
                p => String(p.id) === String(groupValue) && (p.courses?.length || 0) > 0
              )
            )
          : [];
      case 'flag':
        return groupValue
          ? active.filter(s => {
              if (groupValue === 'iep') return !!s.has_iep;
              if (groupValue === '504') return !!s.has_504;
              if (groupValue === 'ell') return !!s.is_ell;
              if (groupValue === 'ged') return !!s.is_ged;
              return false;
            })
          : [];
      case 'all':
      default:
        return active;
    }
  }, [students, groupBy, groupValue, getRiskLevel]);

  // Split into those we can email vs. those missing an address.
  const withEmail = useMemo(
    () => groupStudents.filter(s => s.email && s.email.includes('@')),
    [groupStudents]
  );
  const withoutEmail = useMemo(
    () => groupStudents.filter(s => !s.email || !s.email.includes('@')),
    [groupStudents]
  );
  const recipients = useMemo(
    () => withEmail.filter(s => !deselected.has(s.id)),
    [withEmail, deselected]
  );

  function toggleRecipient(id) {
    setDeselected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetGroup(nextGroupBy) {
    setGroupBy(nextGroupBy);
    setGroupValue('');
    setDeselected(new Set());
  }

  // -- Guard AFTER hooks --
  if (!isOpen) return null;

  // ── Auth token (mirrors SendAdvisingEmail's resilient lookup) ──
  async function getAccessToken() {
    let token = null;
    try {
      const raceTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getSession timeout')), 3000)
      );
      const { data: { session } } = await Promise.race([
        supabaseClient.auth.getSession(),
        raceTimeout,
      ]);
      if (session?.access_token) token = session.access_token;
    } catch (e) {
      // fall through to localStorage
    }
    if (!token) {
      try {
        const stored = JSON.parse(localStorage.getItem(AUTH_TOKEN_KEY) || '{}');
        token = stored?.access_token || null;
      } catch (e) { /* ignore */ }
    }
    return token;
  }

  // ── Compact per-student graduation-progress block (optional attachment) ──
  function buildPlanHtml(student) {
    const studentCourses = student.courses || [];
    const completed = studentCourses.filter(c => c.status === 'completed');
    const current = studentCourses.filter(c => c.status === 'in_progress');

    const categoryProgress = (categories || [])
      .map(cat => {
        const earned =
          Math.round(
            completed
              .filter(c => c.category_id === cat.id)
              .reduce((sum, c) => sum + Number(c.credits || 0), 0) * 10
          ) / 10;
        const required = Number(cat.credits_required) || 0;
        return { name: cat.name, earned, required };
      })
      .filter(c => c.required > 0);

    const totalEarned =
      Math.round(categoryProgress.reduce((sum, c) => sum + c.earned, 0) * 10) / 10;
    const totalRequired = categoryProgress.reduce((sum, c) => sum + c.required, 0);
    const pct = totalRequired > 0 ? Math.round((totalEarned / totalRequired) * 100) : 0;

    let html = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
        <tr><td style="background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 14px 18px; border-radius: 8px; font-size: 16px; font-weight: 700; text-align: center;">
          ${totalEarned} / ${totalRequired} credits earned (${pct}%)
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 16px;">
        <thead><tr style="background: #f1f5f9;">
          <th style="text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0;">Category</th>
          <th style="text-align:center;padding:8px 12px;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0;">Earned</th>
          <th style="text-align:center;padding:8px 12px;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0;">Required</th>
          <th style="text-align:center;padding:8px 12px;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0;">Status</th>
        </tr></thead>
        <tbody>
          ${categoryProgress
            .map(cat => {
              const met = cat.earned >= cat.required;
              return `<tr>
                <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155;">${escapeHtml(cat.name)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155;text-align:center;">${cat.earned}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155;text-align:center;">${cat.required}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:center;color:${met ? '#16a34a' : '#ea580c'};font-weight:600;">${met ? 'Complete' : `${Math.round((cat.required - cat.earned) * 10) / 10} needed`}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    `;

    if (current.length > 0) {
      html += `<p style="font-size:13px;color:#475569;margin:0;">Current courses: ${current
        .map(c => escapeHtml(c.name || ''))
        .filter(Boolean)
        .join(', ')}</p>`;
    }
    return html;
  }

  // ── Turn the plain-text message into safe HTML paragraphs ──
  function buildMessageHtml() {
    const safe = escapeHtml(message.trim()).replace(/\n/g, '<br>');
    return `<div style="font-size:14px;color:#334155;line-height:1.6;">${safe}</div>`;
  }

  // ── Send loop ──
  async function handleSend() {
    setError('');
    if (!subject.trim()) { setError('Please enter a subject.'); return; }
    if (!message.trim()) { setError('Please enter a message.'); return; }
    if (recipients.length === 0) { setError('No recipients selected.'); return; }

    const token = await getAccessToken();
    if (!token) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      window.location.replace(window.location.origin);
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const messageHtml = buildMessageHtml();
    const contentType = includeProgress ? 'message_plan' : 'message';
    const contactDate = new Date().toLocaleDateString('en-CA');

    setPhase('sending');
    setProgress({ done: 0, total: recipients.length });
    const runResults = [];

    for (let i = 0; i < recipients.length; i++) {
      const student = recipients[i];
      let status = 'sent';
      let errMsg = '';
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-advising-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            studentId: student.id,
            studentName: student.full_name,
            studentEmail: student.email,
            recipientEmails: [],
            subject: subject.trim(),
            contentType,
            messageHtml,
            notesHtml: null,
            planHtml: includeProgress ? buildPlanHtml(student) : null,
          }),
        });

        if (res.status === 401) {
          // Session expired mid-run. If nothing has gone out yet, recover the
          // session app-wide (full reload). If some emails already sent, don't
          // wipe that progress — stop here and show partial results so the
          // advisor knows exactly who was (and wasn't) reached and contacted.
          if (runResults.length === 0) {
            localStorage.removeItem(AUTH_TOKEN_KEY);
            window.location.replace(window.location.origin);
            return;
          }
          setError('Your session expired partway through. Remaining students were not emailed — sign in again and resend to the rest.');
          break;
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          status = 'failed';
          errMsg = data.error || data.details?.message || `HTTP ${res.status}`;
        }
      } catch (e) {
        status = 'failed';
        errMsg = e.message || 'Network error';
      }

      // Log one contact note per recipient — only on a successful send.
      if (status === 'sent') {
        try {
          await fetch(`${supabaseUrl}/rest/v1/student_notes`, {
            method: 'POST',
            headers: {
              'apikey': anonKey,
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
              student_id: student.id,
              counselor_id: counselorProfile.id,
              school_id: counselorProfile.school_id,
              note: `Bulk email sent: "${subject.trim()}"${includeProgress ? ' (incl. graduation progress)' : ''}`,
              note_type: 'bulk_email',
              status: 'completed',
              contact_date: contactDate,
            }),
          });
        } catch (noteErr) {
          // Email already went out; don't fail the recipient over the note.
          console.error('Failed to log bulk-email contact note:', noteErr);
        }
      }

      runResults.push({
        id: student.id,
        name: student.full_name,
        email: student.email,
        status,
        error: errMsg,
      });
      setProgress({ done: i + 1, total: recipients.length });

      // Gentle throttle to stay within email-provider rate limits.
      if (i < recipients.length - 1) {
        await new Promise(r => setTimeout(r, 350));
      }
    }

    setResults(runResults);
    setPhase('done');
    if (onSent) onSent();
  }

  function handleClose() {
    if (phase === 'sending') return; // don't allow closing mid-send
    setGroupBy('all');
    setGroupValue('');
    setSubject('');
    setMessage('');
    setIncludeProgress(false);
    setDeselected(new Set());
    setPhase('compose');
    setProgress({ done: 0, total: 0 });
    setResults([]);
    setError('');
    onClose();
  }

  const sentCount = results.filter(r => r.status === 'sent').length;
  const failedCount = results.filter(r => r.status === 'failed').length;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-slate-900 rounded-2xl w-full max-w-2xl border border-slate-700 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-0">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>📣</span> Email a Group
          </h2>
          <button
            onClick={handleClose}
            disabled={phase === 'sending'}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ───────────── COMPOSE ───────────── */}
        {phase === 'compose' && (
          <div className="p-6 space-y-5">
            {/* Group selector */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Send to</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'all', label: 'Everyone in view' },
                  { value: 'grade', label: 'By grade' },
                  { value: 'risk', label: 'By risk level' },
                  { value: 'pathway', label: 'By CTE pathway' },
                  { value: 'flag', label: 'By flag' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => resetGroup(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      groupBy === opt.value
                        ? 'bg-indigo-500/20 border-indigo-500/50 text-white'
                        : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Sub-filter value */}
              {groupBy === 'grade' && (
                <select
                  value={groupValue}
                  onChange={e => { setGroupValue(e.target.value); setDeselected(new Set()); }}
                  className="mt-3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="">Select a grade…</option>
                  {gradeOptions.map(g => (
                    <option key={g} value={g}>Grade {g}</option>
                  ))}
                </select>
              )}
              {groupBy === 'risk' && (
                <select
                  value={groupValue}
                  onChange={e => { setGroupValue(e.target.value); setDeselected(new Set()); }}
                  className="mt-3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="">Select a risk level…</option>
                  <option value="critical">🔴 Critical (≥3 behind)</option>
                  <option value="at-risk">🟠 At-Risk (≥1.5 behind)</option>
                  <option value="watch">🟡 Watch (≥0.5 behind)</option>
                  <option value="on-track">🟢 On Track</option>
                </select>
              )}
              {groupBy === 'pathway' && (
                <select
                  value={groupValue}
                  onChange={e => { setGroupValue(e.target.value); setDeselected(new Set()); }}
                  className="mt-3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="">Select a pathway…</option>
                  {pathwayOptions.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
              {groupBy === 'flag' && (
                <select
                  value={groupValue}
                  onChange={e => { setGroupValue(e.target.value); setDeselected(new Set()); }}
                  className="mt-3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="">Select a flag…</option>
                  <option value="iep">🟣 IEP</option>
                  <option value="504">🟠 504</option>
                  <option value="ell">🌐 ELL</option>
                  <option value="ged">📝 GED</option>
                </select>
              )}
            </div>

            {/* Recipient summary */}
            <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-300">
                  {recipients.length} recipient{recipients.length === 1 ? '' : 's'} selected
                </span>
                {withoutEmail.length > 0 && (
                  <span className="text-xs text-amber-400">
                    {withoutEmail.length} skipped (no email)
                  </span>
                )}
              </div>
              {withEmail.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No emailable students in this group yet.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                  {withEmail.map(s => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:bg-slate-800/60 rounded px-2 py-1"
                    >
                      <input
                        type="checkbox"
                        checked={!deselected.has(s.id)}
                        onChange={() => toggleRecipient(s.id)}
                        className="w-4 h-4 rounded border-slate-600 text-indigo-500 focus:ring-indigo-500 bg-slate-700"
                      />
                      <span className="flex-1">{s.full_name}</span>
                      <span className="text-xs text-slate-500">{s.email}</span>
                    </label>
                  ))}
                </div>
              )}
              {withoutEmail.length > 0 && (
                <p className="text-xs text-slate-600 mt-2">
                  Skipped (no email on file): {withoutEmail.map(s => s.full_name).join(', ')}
                </p>
              )}
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="e.g. Reminder: graduation check-in this week"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Message</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={6}
                placeholder={'Write your message to the group here.\nEach student receives it as an individual email addressed to them.'}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              />
              <p className="text-slate-600 text-xs mt-1">
                Sent individually to each student (not a group thread) — recipients can't see each other.
              </p>
            </div>

            {/* Include progress toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeProgress}
                onChange={e => setIncludeProgress(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 text-indigo-500 focus:ring-indigo-500 bg-slate-700"
              />
              <span className="text-sm text-slate-300">
                Also attach each student's graduation progress summary
              </span>
            </label>

            {/* FERPA / logging notice */}
            <div className="bg-amber-500/10 rounded-xl p-3 border border-amber-500/20">
              <p className="text-amber-400/80 text-xs">
                🔒 Each send includes the FERPA confidentiality notice and is logged as a contact
                on every recipient's record.
              </p>
            </div>

            {recipients.length > 50 && (
              <div className="bg-sky-500/10 rounded-xl p-3 border border-sky-500/20">
                <p className="text-sky-300/90 text-xs">
                  You're about to email {recipients.length} students. This sends one email at a time
                  and may take about {Math.ceil((recipients.length * 0.35) / 60)} minute(s).
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleClose}
                className="flex-1 bg-slate-800 text-slate-300 font-medium py-3 rounded-xl hover:bg-slate-700 transition-all text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={recipients.length === 0 || phase === 'sending'}
                className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-3 rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                📣 Send to {recipients.length}
              </button>
            </div>
          </div>
        )}

        {/* ───────────── SENDING ───────────── */}
        {phase === 'sending' && (
          <div className="p-8 text-center">
            <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-indigo-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-white font-medium mb-2">
              Sending {progress.done} of {progress.total}…
            </p>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-500 h-2 transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-slate-500 text-xs mt-4">Please keep this window open until it finishes.</p>
          </div>
        )}

        {/* ───────────── DONE ───────────── */}
        {phase === 'done' && (
          <div className="p-6">
            <div className="text-center mb-5">
              <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">✅</span>
              </div>
              <h3 className="text-lg font-bold text-white">
                Sent to {sentCount} student{sentCount === 1 ? '' : 's'}
              </h3>
              {failedCount > 0 && (
                <p className="text-red-400 text-sm mt-1">{failedCount} failed — see below.</p>
              )}
              <p className="text-slate-500 text-xs mt-1">
                A contact note was logged on each successful recipient's record.
              </p>
            </div>

            {error && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4">
                <p className="text-amber-300 text-sm">{error}</p>
              </div>
            )}

            {failedCount > 0 && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 mb-4 max-h-40 overflow-y-auto">
                {results
                  .filter(r => r.status === 'failed')
                  .map(r => (
                    <p key={r.id} className="text-sm text-red-300">
                      {r.name} ({r.email}) — {r.error}
                    </p>
                  ))}
              </div>
            )}

            <button
              onClick={handleClose}
              className="w-full bg-slate-800 text-slate-300 font-medium py-3 rounded-xl hover:bg-slate-700 transition-all text-sm"
            >
              Done
            </button>
          </div>
        )}
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
