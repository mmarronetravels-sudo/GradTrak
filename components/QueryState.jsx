
import React from 'react';

export default function QueryState({
  loading,           // true/false — is the data still loading?
  error,             // string or null — error message if something went wrong
  retry,             // function — called when user clicks the Retry button
  data,              // the actual data (array, object, etc.)
  emptyMessage = 'No data found.',     // shown when data is an empty array
  emptyIcon = '📋',                     // emoji shown above the empty message
  loadingMessage = 'Loading...',        // shown next to the spinner
  children           // your actual content — only renders when data is ready
}) {

  // ----- LOADING STATE -----
  // Shows a spinning circle + message while waiting for Supabase
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mb-3"></div>
        <p className="text-slate-400 text-sm">{loadingMessage}</p>
      </div>
    );
  }

  // ----- ERROR STATE -----
  // Shows the error message + a Retry button so the user can try again
  // This is what replaces the old "infinite spinner" — now they see
  // a clear message and can do something about it
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-3xl mb-3">⚠️</p>
        <p className="text-red-400 text-sm mb-3">{error}</p>
        {retry && (
          <button
            onClick={retry}
            className="px-4 py-2 bg-indigo-500/20 text-indigo-400 rounded-lg
                       hover:bg-indigo-500/30 transition-colors text-sm font-medium"
          >
            🔄 Retry
          </button>
        )}
      </div>
    );
  }

  // ----- EMPTY STATE -----
  // Shows a friendly message when the query worked but returned nothing
  // (e.g., a student with no notes yet)
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-3xl mb-3">{emptyIcon}</p>
        <p className="text-slate-400 text-sm">{emptyMessage}</p>
      </div>
    );
  }

  // ----- DATA READY -----
  // Everything loaded successfully and there's data to show.
  // Render whatever was passed in as children (your notes list, course table, etc.)
  return <>{children}</>;
}
