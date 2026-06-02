import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logger } from '@dei/shared';
import { Button, Card, PulseRing, Text } from '@dei/ui';

import { expireMatchQueue, isQueueExpired } from '@/lib/matching';
import { ROUTES, roomRoutes } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type QueueState = {
  desiredSize: number;
  enqueuedAt: string;
  expiresAt: string | null;
  id: string;
} | null;

export default function QueueScreen() {
  const router = useRouter();
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const { user } = useAuth();
  const [queue, setQueue] = useState<QueueState>(null);
  const [showFreeRematchNotice, setShowFreeRematchNotice] = useState(
    notice === 'free-rematch',
  );

  useEffect(() => {
    if (notice !== 'free-rematch') {
      return;
    }

    setShowFreeRematchNotice(true);
    const timer = setTimeout(() => setShowFreeRematchNotice(false), 1400);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!user) {
      return;
    }

    void logger.withErrorCapture(
      'queue.load',
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
          .select('desired_size, enqueued_at, expires_at, id')
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

        if (isQueueExpired(data.expires_at)) {
          await expireMatchQueue().catch((error) => {
            logger.captureException(error, {
              tags: { screen: 'queue', action: 'expire-queue' },
            });
          });
          router.replace(ROUTES.matchFailed);
          return;
        }

        setQueue({
          desiredSize: data.desired_size,
          enqueuedAt: data.enqueued_at,
          expiresAt: data.expires_at,
          id: data.id,
        });
      },
      { tags: { screen: 'queue', action: 'load' } },
    ).catch((error) => {
      logger.captureException(error, {
        tags: { screen: 'queue', action: 'load-catch' },
      });
    });
  }, [router, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const userId = user.id;
    let cancelled = false;

    const routeToRoom = (roomId: string) => {
      if (cancelled) {
        return;
      }
      router.replace(roomRoutes.index(roomId));
    };

    // 진입 직전에 이미 매칭이 성사됐다면(구독 전 발생) 즉시 방으로 보낸다.
    void logger.withErrorCapture(
      'queue.match-race-check',
      async () => {
        const { data, error } = await supabase
          .from('room_member')
          .select('room_id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (data?.room_id) {
          routeToRoom(data.room_id);
        }
      },
      { tags: { screen: 'queue', action: 'match-race-check' } },
    ).catch((error) => {
      logger.captureException(error, {
        tags: { screen: 'queue', action: 'match-race-check-catch' },
      });
    });

    // match_queue/group_match 는 realtime publication 에 없으므로
    // 매칭 신호는 내 user_id 로 INSERT 되는 room_member row 로 감지한다.
    const channel = supabase
      .channel(`queue-match:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_member',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const next = payload.new as {
            room_id?: string | null;
            status?: string | null;
          };
          if (next.status === 'active' && next.room_id) {
            routeToRoom(next.room_id);
          }
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logger.captureMessage(
            `queue match subscription ${status}`,
            'warning',
          );
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [router, user]);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 px-[24px] pb-[36px] pt-[64px]">
        <View className="items-center">
          <PulseRing
            className="mb-[32px]"
            core={<Text className="text-[24px] font-black text-white">dei</Text>}
          />
          <Text variant="h1" className="text-center text-[25px] leading-[33px]">
            곧 만날 사람들을{'\n'}찾고 있어요
          </Text>
          <Text className="mt-[10px] text-center text-[13.5px] leading-[21px] text-ink-3">
            앱을 닫아도 매칭되면{'\n'}알림으로 알려드려요.
          </Text>
        </View>

        <Card className="mt-[34px] items-center rounded-md border-0 bg-bg-2 px-[22px] py-[14px]">
          <Text className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ink-3">
            평균 대기 시간
          </Text>
          <Text className="mt-[4px] text-[19px] font-extrabold text-ink">
            {queue ? '2 ~ 6 시간' : '확인 중'}
          </Text>
        </Card>

        <Button
          variant="secondary"
          className="mt-auto self-end rounded-full border border-line bg-paper px-[20px] py-[12px]"
          textClassName="text-[13px] font-bold"
          onPress={() => router.push(ROUTES.matchCancelConfirm)}
        >
          매칭 취소
        </Button>
      </View>

      {showFreeRematchNotice ? (
        <View className="absolute bottom-[34px] left-0 right-0 items-center px-[24px]">
          <View className="rounded-full bg-ink px-[16px] py-[10px]">
            <Text className="text-center text-[12.5px] font-bold text-white">
              바로 매칭 시작할게요
            </Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
