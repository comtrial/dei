import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { logger } from '@dei/shared';
import { AlertDialog, PermissionGate } from '@dei/ui';

import { enqueueMatchQueue, isMatchQueueErrorCode } from '@/lib/matching';
import {
  getAppNotificationEnabled,
  registerPushToken,
  setAppNotificationEnabled,
} from '@/lib/notifications.stub';
import { getPermissionState, openSystemSettings, requestPermission } from '@/lib/permissions';
import { ROUTES } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function NotificationPermissionScreen() {
  const router = useRouter();
  const { memberIds } = useLocalSearchParams<{ memberIds?: string }>();
  const { user } = useAuth();
  const [isRequesting, setIsRequesting] = useState(false);
  const [queueFailed, setQueueFailed] = useState(false);

  const returnHome = useCallback(() => router.replace(ROUTES.home), [router]);
  const continueToQueue = useCallback((notice?: 'free-rematch') => {
    if (notice) {
      router.replace({
        pathname: '/(app)/queue',
        params: { notice },
      });
      return;
    }

    router.replace(ROUTES.queue);
  }, [router]);
  const completeRegistration = useCallback(async () => {
    const ids = memberIds
      ? memberIds.split(',').map((id) => id.trim()).filter(Boolean)
      : [];

    if (user?.id) {
      await setAppNotificationEnabled(user.id, true);
      await registerPushToken(user.id).catch((error) => {
        logger.captureMessage('push token registration skipped', 'warning', {
          tags: { screen: 'permission-notification', action: 'register-push-token' },
          extra: { reason: getErrorMessage(error) },
        });
      });
    }

    const registration = await enqueueMatchQueue(ids);
    continueToQueue(registration.freeRematchWaived ? 'free-rematch' : undefined);
  }, [continueToQueue, memberIds, user?.id]);

  useEffect(() => {
    let mounted = true;

    void logger.withErrorCapture(
      'notification-permission.autopass',
      async () => {
        if (!user?.id) {
          return;
        }

        const [appNotificationEnabled, osPermission] = await Promise.all([
          getAppNotificationEnabled(user.id),
          getPermissionState('notification'),
        ]);

        if (mounted && appNotificationEnabled && osPermission === 'granted') {
          await completeRegistration();
        }
      },
      { tags: { screen: 'permission-notification', action: 'autopass' } },
    ).catch((error) => {
      if (isMatchQueueErrorCode(error, 'REMATCH_RESTRICTED')) {
        router.replace(ROUTES.booster);
        return;
      }

      logger.captureException(error, {
        tags: { screen: 'permission-notification', action: 'autopass-catch' },
      });
      setQueueFailed(true);
    });

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        return;
      }

      void getPermissionState('notification')
        .then(async (status) => {
          if (status !== 'granted') {
            return;
          }

          await completeRegistration();
        })
        .catch((error) => {
          if (isMatchQueueErrorCode(error, 'REMATCH_RESTRICTED')) {
            router.replace(ROUTES.booster);
            return;
          }

          logger.captureException(error, {
            tags: { screen: 'permission-notification', action: 'resume-check' },
          });
          setQueueFailed(true);
        });
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [completeRegistration, router, user?.id]);

  const handlePrimary = () => {
    void logger.withErrorCapture(
      'notification-permission.request',
      async () => {
        setIsRequesting(true);
        if (user?.id) {
          await setAppNotificationEnabled(user.id, true);
        }
        const status = await requestPermission('notification');

        if (status === 'granted') {
          await completeRegistration();
          return;
        }

        if (status === 'denied' || status === 'undetermined') {
          await openSystemSettings();
        }
      },
      { tags: { screen: 'permission-notification', action: 'request' } },
    )
      .catch((error) => {
        if (isMatchQueueErrorCode(error, 'REMATCH_RESTRICTED')) {
          router.replace(ROUTES.booster);
          return;
        }

        logger.captureException(error, {
          tags: { screen: 'permission-notification', action: 'request-catch' },
        });
      })
      .finally(() => setIsRequesting(false));
  };

  return (
    <>
      <PermissionGate
        icon="🔔"
        heading={isRequesting ? '알림 권한을 확인 중이에요' : '알림이 꺼져 있어요'}
        description="매칭 결과를 알려드리려면 알림이 필요해요. 설정에서 켜주세요."
        reasons={[
          { text: '매칭이 성사되면 바로 알려드려요' },
          { text: '매시간 일상 업로드 시간 안내' },
          { text: '방 멤버가 귓속말을 보냈을 때' },
        ]}
        primaryLabel={isRequesting ? '확인 중' : '설정에서 알림 켜기'}
        onPrimary={handlePrimary}
        secondaryLabel="나중에 하기"
        onSecondary={returnHome}
        onClose={returnHome}
      />
      <AlertDialog
        visible={queueFailed}
        tone="warn"
        icon="!"
        title="매칭을 시작하지 못했어요"
        description="프로필 상태와 네트워크를 확인한 뒤 다시 시도해주세요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setQueueFailed(false) }]}
        onDismiss={() => setQueueFailed(false)}
      />
    </>
  );
}
