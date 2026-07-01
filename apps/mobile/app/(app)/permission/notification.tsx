import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { analytics, logger, toMatchQueueMode } from '@dei/shared';
import { AlertDialog, PermissionGate } from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { enqueueMatchQueue, isMatchQueueErrorCode } from '@/lib/matching';
import {
  getAppNotificationEnabled,
  registerPushToken,
  setAppNotificationEnabled,
} from '@/lib/notifications.stub';
import { getPermissionState, requestPermission } from '@/lib/permissions';
import { ROUTES } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';

type NotificationQueueChoice = 'enabled' | 'skipped';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function NotificationPermissionScreen() {
  const router = useRouter();
  const {
    entrypoint: rawEntrypoint,
    memberIds,
    mode: rawMode,
  } = useLocalSearchParams<{ entrypoint?: string; memberIds?: string; mode?: string }>();
  const { user } = useAuth();
  const mode = toMatchQueueMode(rawMode);
  const memberIdList = useMemo(
    () => memberIds ? memberIds.split(',').map((id) => id.trim()).filter(Boolean) : [],
    [memberIds],
  );
  const entrypoint =
    rawEntrypoint === 'college' || rawEntrypoint === 'friend' || rawEntrypoint === 'solo'
      ? rawEntrypoint
      : mode === 'college'
        ? 'college'
        : memberIdList.length === 1
          ? 'solo'
          : 'friend';
  const [isRequesting, setIsRequesting] = useState(false);
  const [queueFailed, setQueueFailed] = useState(false);

  const returnHome = useCallback(() => router.replace(ROUTES.home), [router]);
  const continueToQueue = useCallback((notice?: 'free-rematch') => {
    if (notice) {
      router.replace({
        pathname: '/(app)/queue',
        params: { entrypoint, mode, notice },
      });
      return;
    }

    router.replace({
      pathname: '/(app)/queue',
      params: { entrypoint, mode },
    });
  }, [entrypoint, mode, router]);
  const completeRegistration = useCallback(async (notificationChoice: NotificationQueueChoice) => {
    if (user?.id) {
      const notificationsEnabled = notificationChoice === 'enabled';
      await setAppNotificationEnabled(user.id, notificationsEnabled);

      if (notificationsEnabled) {
        await registerPushToken(user.id).catch((error) => {
          logger.captureMessage('push token registration skipped', 'warning', {
            tags: { screen: 'permission-notification', action: 'register-push-token' },
            extra: { reason: getErrorMessage(error) },
          });
        });
      }
    }

    const registration = await enqueueMatchQueue(memberIdList, { mode });
    analytics.capture(ANALYTICS_EVENTS.team_queue_registered, {
      entry_point: entrypoint,
      member_count: memberIdList.length,
      mode: entrypoint === 'solo' ? 'solo' : mode === 'college' ? 'college' : 'team',
      source: 'permission-notification',
    });
    continueToQueue(registration.freeRematchWaived ? 'free-rematch' : undefined);
  }, [continueToQueue, entrypoint, memberIdList, mode, user?.id]);

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
          await completeRegistration('enabled');
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

          await completeRegistration('enabled');
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

  const handleQueueError = useCallback((error: unknown, action: string) => {
    if (isMatchQueueErrorCode(error, 'REMATCH_RESTRICTED')) {
      router.replace(ROUTES.booster);
      return;
    }

    logger.captureException(error, {
      tags: { screen: 'permission-notification', action },
    });
    setQueueFailed(true);
  }, [router]);

  const handlePrimary = () => {
    void logger.withErrorCapture(
      'notification-permission.request',
      async () => {
        setIsRequesting(true);
        const status = await requestPermission('notification');

        if (status === 'granted') {
          await completeRegistration('enabled');
          return;
        }

        if (status === 'denied' || status === 'undetermined') {
          await completeRegistration('skipped');
        }
      },
      { tags: { screen: 'permission-notification', action: 'request' } },
    )
      .catch((error) => handleQueueError(error, 'request-catch'))
      .finally(() => setIsRequesting(false));
  };

  const handleSecondary = () => {
    void logger.withErrorCapture(
      'notification-permission.skip',
      async () => {
        setIsRequesting(true);
        await completeRegistration('skipped');
      },
      { tags: { screen: 'permission-notification', action: 'skip' } },
    )
      .catch((error) => handleQueueError(error, 'skip-catch'))
      .finally(() => setIsRequesting(false));
  };

  return (
    <>
      <PermissionGate
        icon="🔔"
        heading={isRequesting ? '매칭을 시작하고 있어요' : '알림을 켜면 더 빨리 확인할 수 있어요'}
        description="알림은 선택 사항이에요. 꺼도 매칭과 기본 기능은 계속 이용할 수 있어요."
        reasons={[
          { text: '매칭이 성사되면 바로 알려드려요' },
          { text: '매시간 일상 업로드 시간 안내' },
          { text: '방 멤버가 귓속말을 보냈을 때' },
        ]}
        primaryLabel={isRequesting ? '시작 중' : '알림 켜고 계속'}
        onPrimary={handlePrimary}
        secondaryLabel="알림 없이 계속하기"
        onSecondary={handleSecondary}
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
