import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logger, POLICY } from '@dei/shared';
import { Badge, Banner, BottomActionBar, Button, Spinner, Text, TopNav } from '@dei/ui';

import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export default function QueueScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [memberCount, setMemberCount] = useState(1);
  const [region, setRegion] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    void logger.withErrorCapture(
      'queue.load-context',
      async () => {
        const { data, error } = await supabase
          .from('profile')
          .select('region')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        setRegion(data?.region ?? null);
      },
      { tags: { screen: 'queue', action: 'load-context' } },
    );
  }, [user]);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav
        title="매칭 대기"
        left="close"
        onLeftPress={() => router.push(ROUTES.matchCancelConfirm)}
        rightActions={<Badge variant="count">{`${memberCount}명`}</Badge>}
      />

      <View className="flex-1 px-[24px] pb-[32px] pt-[54px]">
        <View className="items-center">
          <Spinner size={80} />
          <Text variant="h1" className="mt-[28px] text-center text-[25px] leading-[33px]">
            맞는 묶음을 찾고 있어요
          </Text>
          <Text className="mt-[10px] text-center text-[13.5px] leading-[21px] text-ink-3">
            상대 성별, 지역, 방 상태를 기준으로 확인합니다.
          </Text>
        </View>

        <View className="mt-[34px] gap-[10px]">
          <Banner tone="warn" icon="!" title="대기 중 앱을 닫아도 괜찮아요">
            알림을 켜두면 매칭 완료 시 바로 알려드려요.
          </Banner>
          <Banner tone="info" icon="i" title="현재 매칭 조건">
            {region ? `${region} 기준 · 반대 성별 · 최대 ${POLICY.matching.queueExpiryHours}시간 대기` : `반대 성별 · 최대 ${POLICY.matching.queueExpiryHours}시간 대기`}
          </Banner>
        </View>

        <View className="mt-auto gap-[10px]">
          <Button variant="secondary" fullWidth onPress={() => setMemberCount((count) => Math.min(count + 1, POLICY.team.maxMembers))}>
            묶음 인원 미리보기
          </Button>
          <Button variant="tertiary" fullWidth onPress={() => router.push(ROUTES.matchFailed)}>
            매칭 실패 안내 보기
          </Button>
        </View>
      </View>

      <BottomActionBar fixed>
        <Button variant="secondary" fullWidth onPress={() => router.push(ROUTES.matchCancelConfirm)}>
          대기 취소
        </Button>
      </BottomActionBar>
    </SafeAreaView>
  );
}
