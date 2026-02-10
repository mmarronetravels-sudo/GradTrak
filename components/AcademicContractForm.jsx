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