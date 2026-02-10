import React from 'react';

export default function QueryState({
  loading,
  error,
  retry,
  data,
  emptyMessage = 'No data found.',
  emptyIcon = '📋',
  loadingMessage = 'Loading...',
  children
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mb-3"></div>
        <p className="text-slate-400 text-sm">{loadingMessage}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-3xl mb-3">⚠️</p>
        <p className="text-red-400 text-sm mb-3">{error}</p>
        {retry && (
          <button
            onClick={retry}
            className="px-4 py-2 bg-indigo-500/20 text-indigo-400 rounded-lg hover:bg-indigo-500/30 transition-colors text-sm font-medium"
          >
            🔄 Retry
          </button>
        )}
      </div>
    );
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-3xl mb-3">{emptyIcon}</p>
        <p className="text-slate-400 text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return <>{children}</>;
}