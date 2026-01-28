import { useState } from 'react';

const WITHDRAWAL_REASONS = [
  'Transferred to another school',
  'Moved out of district',
  'Graduated early',
  'Personal/Family reasons',
  'Medical reasons',
  'Enrollment in GED program',
  'Enrollment in homeschool',
  'No longer participating',
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
  const [withdrawalDate, setWithdrawalDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !student) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!isReactivating && !reason) {
      setError('Please select a withdrawal reason');
      setLoading(false);
      return;
    }

    const finalReason = reason === 'Other' ? customReason : reason;

    try {
      await onArchive({
        studentId: student.id,
        isActive: isReactivating,
        withdrawalDate: isReactivating ? null : withdrawalDate,
        withdrawalReason: isReactivating ? null : finalReason
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update student status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 99999 }}
    >
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={onClose}
      />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-visible">
        <div className={`px-6 py-4 border-b ${isReactivating ? 'bg-green-50' : 'bg-amber-50'}`}>
          <h3 className={`text-lg font-semibold ${isReactivating ? 'text-green-800' : 'text-amber-800'}`}>
            {isReactivating ? '✓ Reactivate Student' : '⚠️ Archive Student'}
          </h3>
          <p className="text-sm text-gray-600 mt-1">{student.full_name}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-visible">
          {isReactivating ? (
            <div className="mb-6">
              <p className="text-gray-700">
                Are you sure you want to reactivate <strong>{student.full_name}</strong>?
              </p>
              <p className="text-sm text-gray-500 mt-2">
                This will restore the student to your active caseload and include them in reports.
              </p>
              {student.withdrawal_reason && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm">
                  <p className="text-gray-500">Previous withdrawal reason:</p>
                  <p className="text-gray-700">{student.withdrawal_reason}</p>
                  {student.withdrawal_date && (
                    <p className="text-gray-500 mt-1">
                      Withdrawn: {new Date(student.withdrawal_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Withdrawal Date
                </label>
                <input
                  type="date"
                  value={withdrawalDate}
                  onChange={(e) => setWithdrawalDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Withdrawal
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  <option value="">Select a reason...</option>
                  {WITHDRAWAL_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {reason === 'Other' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Please specify
                  </label>
                  <input
                    type="text"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Enter withdrawal reason..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                </div>
              )}

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-4">
                <strong>Note:</strong> Archived students will be hidden from your active caseload 
                and reports, but their records will be preserved. You can reactivate them later if needed.
              </div>
            </>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-4 py-2 text-white rounded-lg font-medium transition-colors ${
                isReactivating 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-amber-600 hover:bg-amber-700'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {loading 
                ? 'Processing...' 
                : isReactivating 
                  ? 'Reactivate Student' 
                  : 'Archive Student'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
