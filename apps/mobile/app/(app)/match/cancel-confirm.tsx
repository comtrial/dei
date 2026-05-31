import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger } from '@dei/shared';
import { AlertDialog, BottomSheet, Button, Text } from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { cancelMatchQueue, formatQueueElapsed } from '@/lib/matching';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export default function MatchCancelConfirmScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [failed, setFailed] = useState(false);
  const [enqueuedAt, setEnqueuedAt] = useState<string | null>(null);

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.match_cancel_confirm_shown);
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    void logger.withErrorCapture(
      'match-cancel.load-queue',
      async () => {
        const { data: teamMembers, error: teamError } = await supabase
          .from('team_member')
          .select('team_id')
          .eq('user_id', user.id);

        if (teamError) {
          throw teamError;
        }

        const teamIds = teamMembers?.map((team) => team.team_id) ?? [];
        if (teamIds.length === 0) {
          router.replace(ROUTES.home);
          return;
        }

        const { data, error } = await supabase
          .from('match_queue')
          .select('enqueued_at')
          .in('team_id', teamIds)
          .eq('status', 'waiting')
          .order('enqueued_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          router.replace(ROUTES.home);
          return;
        }

        setEnqueuedAt(data.enqueued_at);
      },
      { tags: { screen: 'match-cancel-confirm', action: 'load-queue' } },
    ).catch((error) => {
      logger.captureException(error, {
        tags: { screen: 'match-cancel-confirm', action: 'load-queue-catch' },
      });
    });
  }, [router, user]);

  const keepWaiting = () => router.replace(ROUTES.queue);
  const cancelQueue = () => {
    void logger.withErrorCapture(
      'match.cancel-queue',
      async () => {
        await cancelMatchQueue();
        analytics.capture(ANALYTICS_EVENTS.match_cancelled_by_user);
        router.replace(ROUTES.home);
      },
      { tags: { screen: 'match-cancel-confirm', action: 'cancel' } },
    ).catch((error) => {
      logger.captureException(error, {
        tags: { screen: 'match-cancel-confirm', action: 'cancel-catch' },
      });
      setFailed(true);
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center px-[24px]">
        <Text className="text-center text-[14px] font-semibold text-ink-3">
          매칭 큐 대기 중…
        </Text>
      </View>

      <BottomSheet visible heightPct={42} onClose={keepWaiting}>
        <View className="flex-1 px-[24px] pb-[24px] pt-[12px]">
          <Text className="text-center text-[28px] leading-[34px]">⚠</Text>
          <Text variant="h2" className="mt-[6px] text-center text-[22px] font-extrabold">
            정말 취소하시겠어요?
          </Text>
          <Text className="mt-[8px] text-center text-[13.5px] leading-[20px] text-ink-3">
            큐를 떠나면 처음부터{'\n'}다시 기다려야 해요.
          </Text>

          <View className="mt-[18px] rounded-md bg-bg-2 px-[14px] py-[12px]">
            <Text className="text-center text-[12.5px] leading-[19px] text-ink-2">
              대기 시간 <Text className="font-bold text-ink">{formatQueueElapsed(enqueuedAt)}</Text> 진행 중 · 곧 매칭될 수 있어요
            </Text>
          </View>

          <View className="mt-auto flex-row gap-[10px]">
            <Button
              variant="secondary"
              className="flex-1"
              onPress={cancelQueue}
            >
              취소하기
            </Button>
            <Button
              className="flex-1"
              onPress={keepWaiting}
            >
              유지하기
            </Button>
          </View>
        </View>
      </BottomSheet>

      <AlertDialog
        visible={failed}
        tone="warn"
        icon="!"
        title="매칭을 취소하지 못했어요"
        description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setFailed(false) }]}
        onDismiss={() => setFailed(false)}
      />
    </SafeAreaView>
  );
}
