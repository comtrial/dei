import { useRouter } from 'expo-router';
import { useState } from 'react';

import { logger } from '@dei/shared';
import { PermissionGate } from '@dei/ui';

import { openSystemSettings, requestPermission } from '@/lib/permissions';
import { ROUTES } from '@/lib/routes';

export default function NotificationPermissionScreen() {
  const router = useRouter();
  const [isRequesting, setIsRequesting] = useState(false);

  const continueToQueue = () => router.replace(ROUTES.queue);

  const handlePrimary = () => {
    void logger.withErrorCapture(
      'notification-permission.request',
      async () => {
        setIsRequesting(true);
        const status = await requestPermission('notification');

        if (status === 'denied') {
          await openSystemSettings();
        }

        continueToQueue();
      },
      { tags: { screen: 'permission-notification', action: 'request' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'permission-notification', action: 'request-catch' },
        });
        continueToQueue();
      })
      .finally(() => setIsRequesting(false));
  };

  return (
    <PermissionGate
      icon="!"
      heading={isRequesting ? '알림 권한을 확인 중이에요' : '매칭 결과를 놓치지 않게'}
      description="매칭 완료, 방 열림, 멘션 알림은 앱을 닫아도 바로 받을 수 있어요."
      reasons={[
        { text: '매칭 완료 시 바로 방으로 들어갈 수 있어요.' },
        { text: '새벽 정기 알림은 정책상 보내지 않아요.' },
        { text: '언제든 설정에서 끌 수 있어요.' },
      ]}
      primaryLabel={isRequesting ? '확인 중' : '알림 켜고 계속'}
      onPrimary={handlePrimary}
      secondaryLabel="나중에 하기"
      onSecondary={continueToQueue}
      onClose={() => router.replace(ROUTES.home)}
    />
  );
}
