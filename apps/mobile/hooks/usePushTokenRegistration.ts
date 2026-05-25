import { useEffect, useRef } from 'react';

import { logger } from '@dei/shared';

import { requestAndRegisterPushToken } from '@/lib/push-notifications';

export function usePushTokenRegistration(userId: string | undefined) {
  const lastRequestedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      lastRequestedUserIdRef.current = null;
      return;
    }

    if (lastRequestedUserIdRef.current === userId) {
      return;
    }

    lastRequestedUserIdRef.current = userId;

    requestAndRegisterPushToken(userId).catch((error) => {
      lastRequestedUserIdRef.current = null;
      logger.captureException(error, {
        tags: { feature: 'notifications', action: 'auto-register-push-token' },
        extra: { userId },
      });
    });
  }, [userId]);
}
