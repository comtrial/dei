import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { POLICY } from '@dei/shared';

export function useAppStateRefetch(onRefetch: () => void): void {
  const lastActiveAtRef = useRef<number>(Date.now());
  const onRefetchRef = useRef(onRefetch);
  onRefetchRef.current = onRefetch;

  useEffect(() => {
    function handleChange(nextState: AppStateStatus): void {
      if (nextState === 'active') {
        const elapsed = Date.now() - lastActiveAtRef.current;
        if (elapsed >= POLICY.gridPerformance.appStateStaleAfterMs) {
          onRefetchRef.current();
        }
        lastActiveAtRef.current = Date.now();
      } else {
        lastActiveAtRef.current = Date.now();
      }
    }

    const sub = AppState.addEventListener('change', handleChange);
    return () => sub.remove();
  }, []);
}
