// ============================================
// AcademicContractForm.jsx
// GradTrack — Academic Contract Form
// February 2026
// ============================================
// Modal form for creating and reviewing academic contracts.
// Creates both an academic_contracts record AND a linked
// student_notes entry (note_type = 'academic_contract').
//
// Usage in App.jsx:
//   import AcademicContractForm from './components/AcademicContractForm';
//
//   // In counselor student detail view (Notes tab area):
//   <AcademicContractForm
//     isOpen={showContractModal}
//     onClose={() => setShowContractModal(false)}
//     student={selectedStudent}
//     counselorProfile={profile}
//     supabaseClient={supabase}
//     onSaved={() => { /* refresh notes list */ }}
//   />
// ============================================

import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';

export default function AcademicContractForm({
  isOpen,
  onClose,
  student,
  counselorProfile,
  supabaseClient,
  onSaved,
  existingContract = null, // Pass to open in review mode
}) {
  const isReview = !!existingContract;

  // — Form State —
  const [planStartDate, setPlanStartDate] = useState('');
  const [planReviewDate, setPlanReviewDate] = useState('');
  const [reasonForPlan, setReasonForPlan] = useState('');
  const [academicPlanDefined, setAcademicPlanDefined] = useState('');
  const [studentRole, setStudentRole] = useState('');
  const [caregiverRole, setCaregiverRole] = useState('');
  const [partiesInAgreement, setPartiesInAgreement] = useState(false);

  // — Review State —
  const [reviewSummary, setReviewSummary] = useState('');

  // — UI State —
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Pre-fill dates (start = today, review = 30 days out)
  useEffect(() => {
    if (isOpen && !existingContract) {
      const today = new Date();
      const review = new Date(today);
      review.setDate(review.getDate() + 30);
      setPlanStartDate(today.toISOString().split('T')[0]);
      setPlanReviewDate(review.toISOString().split('T')[0]);
      setReasonForPlan('');
      setAcademicPlanDefined('');
      setStudentRole('');
      setCaregiverRole('');
      setPartiesInAgreement(false);
      setReviewSummary('');
      setError('');
      setSuccess('');
    }
    if (isOpen && existingContract) {
      setPlanStartDate(existingContract.plan_start_date || '');
      setPlanReviewDate(existingContract.plan_review_date || '');
      setReasonForPlan(existingContract.reason_for_plan || '');
      setAcademicPlanDefined(existingContract.academic_plan_defined || '');
      setStudentRole(existingContract.student_role || '');
      setCaregiverRole(existingContract.caregiver_role || '');
      setPartiesInAgreement(existingContract.parties_in_agreement || false);
      setReviewSummary(existingContract.review_summary || '');
      setError('');
      setSuccess('');
    }
  }, [isOpen, existingContract]);

  if (!isOpen || !student) return null;

  // — Validate —
  function validate() {
    if (!planStartDate) return 'Start date is required.';
    if (!planReviewDate) return 'Review date is required.';
    if (!reasonForPlan.trim()) return 'Reason for plan is required.';
    if (!academicPlanDefined.trim()) return 'Academic plan must be defined.';
    if (!studentRole.trim()) return 'Student role/responsibilities required.';
    return null;
  }

  // — Save New Contract —
  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // 1. Create the student_notes entry
      const noteText = [
        `📋 Academic Contract created`,
        `Start: ${planStartDate} | Review: ${planReviewDate}`,
        `Reason: ${reasonForPlan}`,
        `Plan: ${academicPlanDefined}`,
        `Student Role: ${studentRole}`,
        caregiverRole ? `Caregiver Role: ${caregiverRole}` : null,
        `Agreement: ${partiesInAgreement ? 'Yes' : 'Pending'}`,
      ].filter(Boolean).join('\n');

      const { data: noteData, error: noteError } = await supabaseClient
        .from('student_notes')
        .insert({
          student_id: student.id,
          counselor_id: counselorProfile.id,
          note_type: 'academic_contract',
          note: noteText,
          status: 'open',
          school_id: counselorProfile.school_id || 'c3c8b2d1-d01d-42ce-9e64-d2f8ed07c534',
        })
        .select('id')
        .single();

      if (noteError) throw noteError;

      // 2. Create the academic_contracts record
      const { error: contractError } = await supabaseClient
        .from('academic_contracts')
        .insert({
          student_id: student.id,
          counselor_id: counselorProfile.id,
          note_id: noteData.id,
          school_id: counselorProfile.school_id || 'c3c8b2d1-d01d-42ce-9e64-d2f8ed07c534',
          plan_start_date: planStartDate,
          plan_review_date: planReviewDate,
          reason_for_plan: reasonForPlan.trim(),
          academic_plan_defined: academicPlanDefined.trim(),
          student_role: studentRole.trim(),
          caregiver_role: caregiverRole.trim() || null,
          parties_in_agreement: partiesInAgreement,
          status: 'active',
        });

      if (contractError) throw contractError;

      setSuccess('Academic contract saved successfully.');
      if (onSaved) onSaved();
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      console.error('Academic contract save error:', err);
      setError(err.message || 'Failed to save academic contract.');
    } finally {
      setSaving(false);
    }
  }

  // — Complete Review —
  async function handleCompleteReview() {
    if (!reviewSummary.trim()) {
      setError('Review summary is required to complete the review.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const { error: updateError } = await supabaseClient
        .from('academic_contracts')
        .update({
          review_summary: reviewSummary.trim(),
          review_completed_at: new Date().toISOString(),
          review_completed_by: counselorProfile.id,
          status: 'completed',
        })
        .eq('id', existingContract.id);

      if (updateError) throw updateError;

      // Also update the linked note status to completed
      if (existingContract.note_id) {
        await supabaseClient
          .from('student_notes')
          .update({ status: 'completed' })
          .eq('id', existingContract.note_id);
      }

      setSuccess('Review completed.');
      if (onSaved) onSaved();
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      console.error('Review save error:', err);
      setError(err.message || 'Failed to save review.');
    } finally {
      setSaving(false);
    }
  }

  // ————————————————————————————————
  // Render
  // ————————————————————————————————
  const modalBg = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40';
  const modalBox = 'bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4';

  // — Generate PDF —
  function handleExportPDF() {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = margin;

    const addText = (text, x, size, style = 'normal', color = [0, 0, 0]) => {
      doc.setFontSize(size);
      doc.setFont('helvetica', style);
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(text, pageWidth - margin * 2 - (x - margin));
      lines.forEach(line => {
        if (y > 270) { doc.addPage(); y = margin; }
        doc.text(line, x, y);
        y += size * 0.5;
      });
    };

    const addSection = (label, value) => {
      if (!value) return;
      y += 4;
      if (y > 260) { doc.addPage(); y = margin; }
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(margin, y - 4, pageWidth - margin * 2, 8, 2, 2, 'F');
      addText(label, margin + 3, 11, 'bold', [30, 41, 59]);
      y += 2;
      addText(value, margin + 3, 10, 'normal', [51, 65, 85]);
      y += 4;
    };

    // Header
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Academic Contract', pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`${student.full_name} — Grade ${student.grade || 'N/A'}`, pageWidth / 2, 25, { align: 'center' });
    y = 45;

    // Info box
    doc.setDrawColor(200);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 30, 3, 3, 'FD');
    y += 8;
    addText(`Counselor: ${counselorProfile?.full_name || 'N/A'}`, margin + 5, 10, 'normal', [100, 116, 139]);
    addText(`Start Date: ${planStartDate || 'N/A'}     Review Date: ${planReviewDate || 'N/A'}`, margin + 5, 10, 'normal', [100, 116, 139]);
    addText(`Status: ${existingContract?.status || 'active'}     Agreement: ${partiesInAgreement ? 'Yes' : 'Pending'}`, margin + 5, 10, 'normal', [100, 116, 139]);
    y += 10;

    // Sections
    addSection('REASON FOR PLAN', reasonForPlan);
    addSection('ACADEMIC PLAN DEFINED', academicPlanDefined);
    addSection('STUDENT ROLE / RESPONSIBILITIES', studentRole);
    if (caregiverRole) addSection('CAREGIVER ROLE', caregiverRole);

    // Review section if completed
    if (existingContract?.status === 'completed' && existingContract.review_summary) {
      y += 6;
      doc.setDrawColor(22, 163, 74);
      doc.setFillColor(209, 250, 229);
      doc.roundedRect(margin, y - 4, pageWidth - margin * 2, 8, 2, 2, 'FD');
      addText('REVIEW COMPLETED', margin + 3, 11, 'bold', [6, 95, 70]);
      y += 2;
      addText(existingContract.review_summary, margin + 3, 10, 'normal', [6, 95, 70]);
      if (existingContract.review_completed_at) {
        y += 2;
        addText(`Completed: ${new Date(existingContract.review_completed_at).toLocaleDateString()}`, margin + 3, 9, 'normal', [100, 116, 139]);
      }
    }

    // Signature lines
    y += 20;
    if (y > 240) { doc.addPage(); y = margin + 20; }
    doc.setDrawColor(200);
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(10);

    const sigY = y;
    doc.line(margin, sigY, margin + 70, sigY);
    doc.text('Student Signature', margin, sigY + 5);

    doc.line(pageWidth / 2 + 5, sigY, pageWidth / 2 + 75, sigY);
    doc.text('Date', pageWidth / 2 + 5, sigY + 5);

    doc.line(margin, sigY + 20, margin + 70, sigY + 20);
    doc.text('Counselor Signature', margin, sigY + 25);

    doc.line(pageWidth / 2 + 5, sigY + 20, pageWidth / 2 + 75, sigY + 20);
    doc.text('Date', pageWidth / 2 + 5, sigY + 25);

    doc.line(margin, sigY + 40, margin + 70, sigY + 40);
    doc.text('Caregiver Signature (optional)', margin, sigY + 45);

    doc.line(pageWidth / 2 + 5, sigY + 40, pageWidth / 2 + 75, sigY + 40);
    doc.text('Date', pageWidth / 2 + 5, sigY + 45);

    // Footer
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Generated by GradTrack | ${new Date().toLocaleDateString()}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }

    const fileName = `Academic_Contract_${student.full_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  }

  // — Email Contract —
  async function handleEmailContract() {
    if (!student.email) {
      setError('Student has no email address on file.');
      return;
    }

    setSendingEmail(true);
    setError('');

    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) throw new Error('Not authenticated — please log in again');

      const supabaseUrl = supabaseClient.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || '';

      const contractHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 20px 24px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0; font-size: 18px;">📋 Academic Contract</h2>
            <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 13px;">${student.full_name} — Grade ${student.grade || 'N/A'}</p>
          </div>
          <div style="padding: 20px 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
            <table width="100%" style="margin-bottom: 16px; font-size: 13px; color: #64748b;">
              <tr><td><strong>Counselor:</strong> ${counselorProfile?.full_name || 'N/A'}</td></tr>
              <tr><td><strong>Start Date:</strong> ${planStartDate || 'N/A'} &nbsp;&nbsp; <strong>Review Date:</strong> ${planReviewDate || 'N/A'}</td></tr>
              <tr><td><strong>Agreement:</strong> ${partiesInAgreement ? '✅ Yes' : '⏳ Pending'}</td></tr>
            </table>

            <div style="margin-bottom: 16px;">
              <p style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; margin: 0 0 4px;">Reason for Plan</p>
              <p style="font-size: 13px; color: #334155; margin: 0; line-height: 1.6;">${escapeHtml(reasonForPlan)}</p>
            </div>

            <div style="margin-bottom: 16px;">
              <p style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; margin: 0 0 4px;">Academic Plan</p>
              <p style="font-size: 13px; color: #334155; margin: 0; line-height: 1.6;">${escapeHtml(academicPlanDefined)}</p>
            </div>

            <div style="margin-bottom: 16px;">
              <p style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; margin: 0 0 4px;">Student Responsibilities</p>
              <p style="font-size: 13px; color: #334155; margin: 0; line-height: 1.6;">${escapeHtml(studentRole)}</p>
            </div>

            ${caregiverRole ? `
            <div style="margin-bottom: 16px;">
              <p style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; margin: 0 0 4px;">Caregiver Role</p>
              <p style="font-size: 13px; color: #334155; margin: 0; line-height: 1.6;">${escapeHtml(caregiverRole)}</p>
            </div>
            ` : ''}

            ${existingContract?.status === 'completed' && existingContract.review_summary ? `
            <div style="background: #d1fae5; border: 1px solid #6ee7b7; border-radius: 8px; padding: 12px 16px; margin-top: 16px;">
              <p style="font-size: 11px; text-transform: uppercase; color: #065f46; font-weight: 700; margin: 0 0 4px;">Review Completed</p>
              <p style="font-size: 13px; color: #065f46; margin: 0;">${escapeHtml(existingContract.review_summary)}</p>
            </div>
            ` : ''}
          </div>
        </div>
      `;

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
            studentEmail: student.email,
            recipientEmails: [],
            subject: `Academic Contract — ${student.full_name}`,
            contentType: 'notes',
            notesHtml: contractHtml,
            planHtml: null,
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.details?.message || 'Failed to send email');
      }

      setEmailSent(true);
      setSuccess('Contract emailed to ' + student.email);
    } catch (err) {
      console.error('Email contract error:', err);
      setError(err.message || 'Failed to send email');
    } finally {
      setSendingEmail(false);
    }
  }
  
  return (
    <div className={modalBg} onClick={onClose}>
      <div className={modalBox} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          padding: '16px 24px',
          borderRadius: '12px 12px 0 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h2 style={{ color: 'white', fontSize: '18px', fontWeight: 700, margin: 0 }}>
              📋 {isReview ? 'Review' : 'New'} Academic Contract
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', margin: '4px 0 0' }}>
              {student.full_name} — Grade {student.grade}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              borderRadius: '8px',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              fontSize: '18px',
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>

          {/* Dates Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Plan Start Date *</label>
              <input
                type="date"
                value={planStartDate}
                onChange={e => setPlanStartDate(e.target.value)}
                disabled={isReview}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Plan Review Date *</label>
              <input
                type="date"
                value={planReviewDate}
                onChange={e => setPlanReviewDate(e.target.value)}
                disabled={isReview}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Reason */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Reason for Plan *</label>
            <textarea
              value={reasonForPlan}
              onChange={e => setReasonForPlan(e.target.value)}
              disabled={isReview}
              placeholder="Why is this academic contract being created?"
              rows={3}
              style={textareaStyle}
            />
          </div>

          {/* Academic Plan */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Academic Plan Defined *</label>
            <textarea
              value={academicPlanDefined}
              onChange={e => setAcademicPlanDefined(e.target.value)}
              disabled={isReview}
              placeholder="What specific actions, goals, or milestones make up the plan?"
              rows={3}
              style={textareaStyle}
            />
          </div>

          {/* Roles Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Student Role / Responsibilities *</label>
              <textarea
                value={studentRole}
                onChange={e => setStudentRole(e.target.value)}
                disabled={isReview}
                placeholder="What is the student committing to?"
                rows={2}
                style={textareaStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Caregiver Role</label>
              <textarea
                value={caregiverRole}
                onChange={e => setCaregiverRole(e.target.value)}
                disabled={isReview}
                placeholder="What is the caregiver's role? (optional)"
                rows={2}
                style={textareaStyle}
              />
            </div>
          </div>

          {/* Agreement Checkbox */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isReview ? 'default' : 'pointer' }}>
              <input
                type="checkbox"
                checked={partiesInAgreement}
                onChange={e => setPartiesInAgreement(e.target.checked)}
                disabled={isReview}
                style={{ width: '18px', height: '18px', accentColor: '#4f46e5' }}
              />
              <span style={{ fontSize: '14px', color: '#334155' }}>
                All parties are in agreement with this plan
              </span>
            </label>
          </div>

          {/* Divider for Review Section */}
          {isReview && (
            <>
              <hr style={{ border: 'none', borderTop: '2px solid #e2e8f0', margin: '20px 0' }} />
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#334155', marginBottom: '12px' }}>
                📝 Review
              </h3>

              {existingContract.status === 'completed' ? (
                <div style={{
                  background: '#d1fae5',
                  border: '1px solid #6ee7b7',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  marginBottom: '16px',
                }}>
                  <p style={{ fontSize: '13px', color: '#065f46', fontWeight: 600, margin: 0 }}>
                    ✅ Review completed {existingContract.review_completed_at
                      ? `on ${new Date(existingContract.review_completed_at).toLocaleDateString()}`
                      : ''}
                  </p>
                  <p style={{ fontSize: '13px', color: '#065f46', margin: '8px 0 0' }}>
                    {existingContract.review_summary}
                  </p>
                </div>
              ) : (
                <div>
                  <label style={labelStyle}>Review Summary *</label>
                  <textarea
                    value={reviewSummary}
                    onChange={e => setReviewSummary(e.target.value)}
                    placeholder="Summarize how the student performed against the contract goals..."
                    rows={4}
                    style={textareaStyle}
                  />
                </div>
              )}
            </>
          )}

          {/* Error / Success */}
          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              color: '#991b1b',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '12px',
            }}>{error}</div>
          )}
          {success && (
            <div style={{
              background: '#d1fae5',
              border: '1px solid #6ee7b7',
              color: '#065f46',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '12px',
            }}>{success}</div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: 'white',
                color: '#64748b',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >Cancel</button>

            <button
              onClick={handleExportPDF}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                border: '1px solid #4f46e5',
                background: 'white',
                color: '#4f46e5',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              
            >📄 Download PDF</button>
            <button
              onClick={handleEmailContract}
              disabled={sendingEmail || emailSent}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                border: '1px solid #7c3aed',
                background: emailSent ? '#d1fae5' : 'white',
                color: emailSent ? '#065f46' : '#7c3aed',
                fontSize: '14px',
                fontWeight: 600,
                cursor: sendingEmail ? 'not-allowed' : 'pointer',
              }}
            >{sendingEmail ? '📧 Sending...' : emailSent ? '✅ Sent!' : '📧 Email Contract'}</button>
            
            {!isReview && (
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '8px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: saving ? '#a5b4fc' : '#4f46e5',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >{saving ? 'Saving...' : '📋 Create Contract'}</button>
            )}

            {isReview && existingContract.status !== 'completed' && (
              <button
                onClick={handleCompleteReview}
                disabled={saving}
                style={{
                  padding: '8px 24px',
                  borderRadius: '8px',
                  border: 'none',
                  background: saving ? '#86efac' : '#16a34a',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >{saving ? 'Saving...' : '✅ Complete Review'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// — Shared Styles —
const labelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '4px',
};

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  fontSize: '14px',
  color: '#334155',
  outline: 'none',
  boxSizing: 'border-box',
};

const textareaStyle = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  fontSize: '14px',
  color: '#334155',
  outline: 'none',
  resize: 'vertical',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}
