import { useState, useEffect, useCallback, useRef } from 'react';

const TIMEOUT_MS = 10000;

export default function useSupabaseQuery(queryFn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const cancelledRef = useRef(false);
  const mountedRef = useRef(true);

  const execute = useCallback(async () => {
    cancelledRef.current = false;
    setLoading(true);
    setError(null);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out. Click retry to try again.')), TIMEOUT_MS)
    );

    try {
      const result = await Promise.race([
        queryFn(),
        timeoutPromise
      ]);

      if (cancelledRef.current || !mountedRef.current) return;

      if (result.error) {
        setError(result.error.message || 'Failed to load data');
        setData(null);
      } else {
        setData(result.data);
        setError(null);
      }
    } catch (err) {
      if (cancelledRef.current || !mountedRef.current) return;
      setError(err.message || 'Something went wrong');
      setData(null);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    execute();

    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
    };
  }, [execute]);

  const retry = useCallback(() => {
    execute();
  }, [execute]);

  return { data, loading, error, retry, refetch: execute };
}