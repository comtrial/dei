import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger, POLICY } from '@dei/shared';
import { Avatar, Badge, Banner, Button, Card, Text } from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { MOCK_SELF_PROFILE, profileMeta, toInitial } from '@/lib/b-flow';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type HomeProfile = {
  birthYear: number | null;
  gender: string | null;
  nickname: string | null;
  passCount: number;
  region: string | null;
};

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState<HomeProfile>({
    birthYear: MOCK_SELF_PROFILE.birthYear,
    gender: MOCK_SELF_PROFILE.gender,
    nickname: MOCK_SELF_PROFILE.nickname,
    passCount: MOCK_SELF_PROFILE.passCount,
    region: MOCK_SELF_PROFILE.region,
  });

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.home_entered_waiting);

    if (!user) {
      return;
    }

    void logger.withErrorCapture(
      'home.load-profile',
      async () => {
        const [{ data: profileData, error: profileError }, { data: passes, error: passError }] =
          await Promise.all([
            supabase
              .from('profile')
              .select('birth_year, gender, nickname, region')
              .eq('user_id', user.id)
              .maybeSingle(),
            supabase
              .from('pass')
              .select('remaining')
              .eq('user_id', user.id)
              .eq('status', 'active'),
          ]);

        if (profileError) throw profileError;
        if (passError) throw passError;

        const passCount = passes?.reduce((sum, pass) => sum + pass.remaining, 0) ?? 0;

        setProfile({
          birthYear: profileData?.birth_year ?? MOCK_SELF_PROFILE.birthYear,
          gender: profileData?.gender ?? MOCK_SELF_PROFILE.gender,
          nickname: profileData?.nickname ?? MOCK_SELF_PROFILE.nickname,
          passCount,
          region: profileData?.region ?? MOCK_SELF_PROFILE.region,
        });
      },
      { tags: { screen: 'home', action: 'load-profile' } },
    );
  }, [user]);

  const startSolo = () => {
    analytics.capture(ANALYTICS_EVENTS.team_queue_registered, {
      mode: 'solo',
      source: 'home',
    });
    router.push(ROUTES.permissionNotification);
  };

  const startTeam = () => {
    analytics.capture(ANALYTICS_EVENTS.join_team_selected, {
      source: 'home',
    });
    router.push(ROUTES.teamNew);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 px-[24px] pb-[32px] pt-[18px]">
        <View className="flex-row items-center justify-between">
          <Text variant="logo">
            dei<Text variant="logo" tone="accent">.</Text>
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="마이프로필"
            onPress={() => router.push(ROUTES.myProfile)}
          >
            <Avatar
              initial={toInitial(profile.nickname)}
              size={38}
              presenceDot={profile.passCount > 0}
            />
          </Pressable>
        </View>

        <View className="mt-[36px]">
          <Text variant="h1" className="text-[28px] leading-[36px]">
            오늘은 어떻게 만날까요?
          </Text>
          <Text className="mt-[8px] text-[13.5px] leading-[20px] text-ink-3">
            혼자도, 친구와도 같은 무게로 매칭을 시작할 수 있어요.
          </Text>
        </View>

        <View className="mt-[22px] flex-row items-center gap-[8px]">
          <Badge variant="count">{profile.passCount > 0 ? `잔여 ${profile.passCount}회` : '패스 없음'}</Badge>
          <Text variant="meta" tone="ink-3">
            {profileMeta(profile)}
          </Text>
        </View>

        <Banner
          tone="accent"
          icon="!"
          title="24시간 제한 중이라면"
          countdown={`${POLICY.matching.queueExpiryHours}시간 제한은 바로 매치로 면제 가능`}
          cta="바로 매치"
          onCtaPress={() => router.push(ROUTES.booster)}
          className="mt-[22px]"
        >
          방을 나간 뒤 바로 다시 매칭하고 싶을 때 사용하는 옵션이에요.
        </Banner>

        <View className="mt-[24px] gap-[12px]">
          <Pressable accessibilityRole="button" onPress={startSolo}>
            <Card variant="cta-entry">
              <View className="h-[42px] w-[42px] items-center justify-center rounded-full bg-accent-soft">
                <Text className="text-[20px] font-extrabold text-accent">1</Text>
              </View>
              <View className="flex-1">
                <Text className="text-[16px] font-extrabold text-ink">혼자 시작하기</Text>
                <Text className="mt-[3px] text-[12.5px] leading-[18px] text-ink-3">
                  내 프로필만으로 바로 매칭 큐에 들어가요.
                </Text>
              </View>
            </Card>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={startTeam}>
            <Card variant="cta-entry">
              <View className="h-[42px] w-[42px] items-center justify-center rounded-full bg-info-soft">
                <Text className="text-[20px] font-extrabold text-info">5</Text>
              </View>
              <View className="flex-1">
                <Text className="text-[16px] font-extrabold text-ink">친구와 함께</Text>
                <Text className="mt-[3px] text-[12.5px] leading-[18px] text-ink-3">
                  닉네임으로 친구를 추가해 최대 {POLICY.team.maxMembers}명까지 묶어요.
                </Text>
              </View>
            </Card>
          </Pressable>
        </View>

        <View className="mt-auto gap-[10px]">
          <Button variant="secondary" fullWidth onPress={() => router.push(ROUTES.queue)}>
            진행 중인 큐 보기
          </Button>
          <Button variant="tertiary" fullWidth onPress={() => router.push(ROUTES.reportBlock)}>
            신고·차단 플로우 확인
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
