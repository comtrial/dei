import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logger } from '@dei/shared';
import { AlertDialog, Button, Card, IconButton, Text } from '@dei/ui';

import { enqueueMatchQueue } from '@/lib/matching';
import { needsNotificationConsent, registerPushToken } from '@/lib/notifications.stub';
import { ROUTES } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';

const EXPIRE_REASONS = [
  '같은 시간대에 매칭 가능한 사람이 적었어요',
  '활동 지역이 멀어서 매칭이 어려웠어요',
  '큐 지속 시간은 최대 24시간이에요',
] as const;

export default function MatchFailedScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [isRestarting, setIsRestarting] = useState(false);
  const [queueFailed, setQueueFailed] = useState(false);
  const goHome = () => router.replace(ROUTES.home);
  const goNotificationGate = () =>
    router.replace({
      pathname: '/(app)/permission/notification',
      params: { entrypoint: 'solo', memberIds: '', mode: 'normal' },
    });
  const restartMatching = () => {
    void logger.withErrorCapture(
      'match-failed.restart',
      async () => {
        if (!user?.id) {
          goHome();
          return;
        }

        setIsRestarting(true);
        if (await needsNotificationConsent(user.id)) {
          goNotificationGate();
          return;
        }

        await registerPushToken(user.id).catch((error) => {
          logger.captureMessage('push token registration skipped', 'warning', {
            tags: { screen: 'match-failed', action: 'register-push-token' },
            extra: { reason: error instanceof Error ? error.message : String(error) },
          });
        });

        const registration = await enqueueMatchQueue([], { mode: 'normal' });
        router.replace({
          pathname: '/(app)/queue',
          params: registration.freeRematchWaived
            ? { entrypoint: 'solo', mode: 'normal', notice: 'free-rematch' }
            : { entrypoint: 'solo', mode: 'normal' },
        });
      },
      { tags: { screen: 'match-failed', action: 'restart' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'match-failed', action: 'restart-catch' },
        });
        setQueueFailed(true);
      })
      .finally(() => setIsRestarting(false));
  };

  return (
    <>
      <SafeAreaView className="flex-1 bg-bg">
        <View className="items-end px-[18px] pt-[14px]">
          <IconButton glyph={X} accessibilityLabel="닫기" onPress={goHome} />
        </View>

        <View className="flex-1 px-[24px] pb-[32px] pt-[42px]">
          <View className="items-center">
            <Text className="text-[34px] leading-[40px]">🕊</Text>
            <Text variant="h1" className="mt-[16px] text-center text-[25px] leading-[33px]">
              매칭 상대를{'\n'}찾지 못했어요
            </Text>
            <Text className="mt-[10px] text-center text-[15.5px] leading-[21px] text-ink-3">
              큐가 24시간 만료됐어요.{'\n'}다시 시작하면 새로운 인연을 찾아드려요.
            </Text>
          </View>

          <Card className="mt-[28px] border-0 bg-bg-2 px-[16px] py-[14px]">
            <Text className="text-[14.5px] font-bold leading-[20px] text-ink">
              왜 만료됐나요?
            </Text>
            <View className="mt-[6px] gap-[4px]">
              {EXPIRE_REASONS.map((reason) => (
                <Text key={reason} className="text-[14.5px] leading-[20px] text-ink-2">
                  • {reason}
                </Text>
              ))}
            </View>
          </Card>

          <View className="mt-auto gap-[10px]">
            <Button
              disabled={isRestarting}
              fullWidth
              variant="accent"
              onPress={restartMatching}
            >
              {isRestarting ? '다시 시작 중' : '다시 매칭 시작'}
            </Button>
            <Button fullWidth variant="tertiary" onPress={goHome}>
              나중에 다시 시도
            </Button>
          </View>
        </View>
      </SafeAreaView>
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
