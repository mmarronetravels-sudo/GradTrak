import React, { useState, useEffect } from 'react';

const WITHDRAWAL_REASONS = [
  'Transferred to another school',
  'Moved out of district',
  'Graduated early',
  'Dropped out',
  'Medical withdrawal',
  'Family circumstances',
  'Disciplinary action',
  'Aged out',
  'Deceased',
  'Other'
];

export default function ArchiveStudentModal({ 
  student, 
  isOpen, 
  onClose, 
  onArchive, 
  isReactivating = false 
}) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [withdrawalDate, setWithdrawalDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setCustomReason('');
      const today = new Date().toISOString().split('T')[0];
      setWithdrawalDate(today);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen || !student) return null;

  const handleSubmit = async () => {
    if (!isReactivating) {
      if (!reason) {
        setError('Please select a withdrawal reason');
        return;
      }
      if (reason === 'Other' && !customReason.trim()) {
        setError('Please provide a custom reason');
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      const finalReason = reason === 'Other' ? customReason.trim() : reason;
      
      await onArchive({
        studentId: student.id,
        isActive: isReactivating,
        withdrawalDate: isReactivating ? null : withdrawalDate,
        withdrawalReason: isReactivating ? null : finalReason
      });
      
      onClose();
    } catch (err) {
      console.error('Archive error:', err);
      setError(err.message || 'Failed to update student status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '440px',
          margin: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'visible'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          padding: '20px 24px', 
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span style={{ fontSize: '24px' }}>⚠️</span>
          <h2 style={{ 
            margin: 0, 
            fontSize: '20px', 
            fontWeight: 600, 
            color: '#111827' 
          }}>
            {isReactivating ? 'Reactivate Student' : 'Archive Student'}
          </h2>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflow: 'visible' }}>
          <p style={{ 
            margin: '0 0 20px 0', 
            color: '#374151',
            fontSize: '15px'
          }}>
            {student.first_name} {student.last_name}
          </p>

          {error && (
            <div style={{
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#dc2626',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          {!isReactivating && (
            <div style={{ overflow: 'visible' }}>
              {/* Withdrawal Date */}
              <div style={{ marginBottom: '20px' }}>
                <label 
                  htmlFor="archiveDate"
                  style={{ 
                    display: 'block', 
                    marginBottom: '6px', 
                    fontWeight: 500,
                    color: '#374151',
                    fontSize: '14px'
                  }}
                >
                  Withdrawal Date
                </label>
                <input
                  type="date"
                  id="archiveDate"
                  value={withdrawalDate}
                  onChange={(e) => setWithdrawalDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '15px',
                    backgroundColor: 'white',
                    color: '#111827',
                    boxSizing: 'border-box',
                    cursor: 'pointer'
                  }}
                />
              </div>

              {/* Withdrawal Reason */}
              <div style={{ marginBottom: '20px', position: 'relative' }}>
                <label 
                  htmlFor="archiveReason"
                  style={{ 
                    display: 'block', 
                    marginBottom: '6px', 
                    fontWeight: 500,
                    color: '#374151',
                    fontSize: '14px'
                  }}
                >
                  Reason for Withdrawal
                </label>
                <select
                  id="archiveReason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '15px',
                    backgroundColor: 'white',
                    color: reason ? '#111827' : '#6b7280',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                    appearance: 'menulist'
                  }}
                >
                  <option value="">Select a reason...</option>
                  {WITHDRAWAL_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Custom Reason */}
              {reason === 'Other' && (
                <div style={{ marginBottom: '20px' }}>
                  <label 
                    htmlFor="customReason"
                    style={{ 
                      display: 'block', 
                      marginBottom: '6px', 
                      fontWeight: 500,
                      color: '#374151',
                      fontSize: '14px'
                    }}
                  >
                    Please specify
                  </label>
                  <input
                    type="text"
                    id="customReason"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Enter withdrawal reason..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '15px',
                      backgroundColor: 'white',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              )}

              {/* Info Note */}
              <div style={{
                padding: '12px',
                backgroundColor: '#fef3c7',
                borderRadius: '8px',
                fontSize: '13px',
                color: '#92400e'
              }}>
                <strong>Note:</strong> Archived students will be hidden from your active caseload and reports, but their records will be preserved. You can reactivate them later if needed.
              </div>
            </div>
          )}

          {isReactivating && (
            <p style={{ color: '#374151', fontSize: '14px' }}>
              This will restore the student to your active caseload.
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{ 
          padding: '16px 24px', 
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: isReactivating ? '#059669' : '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1
            }}
          >
            {loading 
              ? 'Processing...' 
              : isReactivating 
                ? 'Reactivate Student' 
                : 'Archive Student'
            }
          </button>
        </div>
      </div>
    </div>
  );
}
