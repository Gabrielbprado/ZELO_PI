import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseAsyncState<T> {
  status: AsyncStatus;
  data: T | null;
  error: Error | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

interface Options {
  /**
   * When `false` the async function is not executed on mount and the
   * caller is expected to call `refetch` manually. Defaults to `true`.
   */
  immediate?: boolean;
}

/**
 * Lightweight async-state hook used by screens that just need to load
 * data from an API client on mount.
 *
 * Cancels late updates if the component unmounts before the promise
 * resolves so React doesn't warn about state changes on unmounted nodes.
 *
 * @example
 *   const { data: bookings, loading } = useAsync(() => listMyBookings(), []);
 */
export function useAsync<T>(
  asyncFn: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  options: Options = {},
): UseAsyncState<T> {
  const { immediate = true } = options;
  const [status, setStatus] = useState<AsyncStatus>(immediate ? 'loading' : 'idle');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const result = await asyncFn();
      if (!mountedRef.current) return;
      setData(result);
      setStatus('success');
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
      setStatus('error');
    }
    // asyncFn is recreated on each render of the caller; we intentionally
    // depend on `deps` instead so callers control re-fetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!immediate) return;
    void refetch();
  }, [immediate, refetch]);

  return { status, data, error, loading: status === 'loading', refetch };
}
