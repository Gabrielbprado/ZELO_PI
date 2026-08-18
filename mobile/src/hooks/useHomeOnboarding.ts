import { useCallback, useEffect, useState } from 'react';
import * as Storage from '../utils/storage';
import { StorageKey } from '../constants';

/**
 * Tracks whether the first-time tutorial on the Home screen has been seen.
 *
 * Three states are exposed so the caller can hold rendering until we know
 * the user's status — avoids the tutorial flashing on every cold start.
 */
type Status = 'loading' | 'pending' | 'done';

export function useHomeOnboarding() {
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let cancelled = false;
    Storage.get(StorageKey.ONBOARDED_HOME).then((v) => {
      if (cancelled) return;
      setStatus(v === '1' ? 'done' : 'pending');
    });
    return () => { cancelled = true; };
  }, []);

  const markSeen = useCallback(async () => {
    setStatus('done');
    await Storage.set(StorageKey.ONBOARDED_HOME, '1');
  }, []);

  return { status, markSeen };
}
