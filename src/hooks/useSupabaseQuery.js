import { useState, useEffect, useCallback, useRef } from 'react';

// How long to wait before giving up on a request.
// 15 seconds is generous — if Supabase hasn't responded by then,
// something is genuinely wrong (network issue, RLS timeout, etc.)
const TIMEOUT_MS = 15000;

export default function useSupabaseQuery(queryFn, deps = []) {
  // --- State ---
  // These three values are what your component uses to decide what to show:
  //   loading = true  → show a spinner
  //   error = "..."   → show error message + retry button
  //   data = [...]    → show the actual content
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- Internal refs (you don't need to touch these) ---
  // These track whether the component is still on screen.
  // Without these, React would throw errors if data comes back
  // AFTER the user already navigated away.
  const cancelledRef = useRef(false);
  const mountedRef = useRef(true);

  // --- The actual fetch function ---
  // This runs automatically when the component loads,
  // and again whenever a dependency changes (like student.id).
  // You can also call it manually via refetch() or retry().
  const execute = useCallback(async () => {
    // Reset everything for a fresh fetch
    cancelledRef.current = false;
    setLoading(true);
    setError(null);

    // Create a timeout that will reject after TIMEOUT_MS.
    // Promise.race below means: whichever finishes first wins.
    // If the real query is slow, the timeout "wins" and we show an error.
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Request timed out. Click retry to try again.')),
        TIMEOUT_MS
      )
    );

    try {
      // Race the real Supabase query against the timeout
      const result = await Promise.race([
        queryFn(),       // <-- your actual Supabase call
        timeoutPromise   // <-- the 15-second timeout
      ]);

      // If the user already navigated away, don't update state
      // (React would throw a warning otherwise)
      if (cancelledRef.current || !mountedRef.current) return;

      // Supabase returns { data, error } — check for errors
      if (result.error) {
        setError(result.error.message || 'Failed to load data');
        setData(null);
      } else {
        setData(result.data);
        setError(null);
      }
    } catch (err) {
      // This catches both timeout errors and network errors
      if (cancelledRef.current || !mountedRef.current) return;
      setError(err.message || 'Something went wrong');
      setData(null);
    } finally {
      // Always stop the spinner, even if there was an error
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // --- Auto-run on mount and when dependencies change ---
  useEffect(() => {
    mountedRef.current = true;
    execute();

    // Cleanup: when the component unmounts (user navigates away),
    // mark everything as cancelled so we don't try to update state
    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
    };
  }, [execute]);

  // --- Retry function (same as execute, just a clearer name) ---
  const retry = useCallback(() => {
    execute();
  }, [execute]);

  // --- Return everything the component needs ---
  // data     = the rows from Supabase (or null if loading/error)
  // loading  = true while the request is in flight
  // error    = error message string (or null if no error)
  // retry    = call this to try the request again (for the Retry button)
  // refetch  = same as retry — call after saving a note to reload the list
  return { data, loading, error, retry, refetch: execute };
}






