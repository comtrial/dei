import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger, POLICY } from '@dei/shared';
import { Badge, Banner, Button, Card, ProfileHero, SettingsRow, Text, TopNav } from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import {
  MOCK_SELF_PROFILE,
  profileMeta,
  toInitial,
} from '@/lib/b-flow';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type ProfileState = {
  bio: string | null;
  birthYear: number | null;
  gender: string | null;
  nickname: string | null;
  passCount: number;
  region: string | null;
};

export default function MyProfileScreen() {
  const router = useRouter();
  const { signOut, user } = useAuth();
  const [profile, setProfile] = useState<ProfileState>({
    bio: MOCK_SELF_PROFILE.bio,
    birthYear: MOCK_SELF_PROFILE.birthYear,
    gender: MOCK_SELF_PROFILE.gender,
    nickname: MOCK_SELF_PROFILE.nickname,
    passCount: MOCK_SELF_PROFILE.passCount,
    region: MOCK_SELF_PROFILE.region,
  });

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.profile_hub_opened);

    if (!user) {
      return;
    }

    void logger.withErrorCapture(
      'my-profile.load',
      async () => {
        const [{ data: profileData, error: profileError }, { data: passes, error: passError }] =
          await Promise.all([
            supabase
              .from('profile')
              .select('bio, birth_year, gender, nickname, region')
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

        setProfile({
          bio: profileData?.bio ?? MOCK_SELF_PROFILE.bio,
          birthYear: profileData?.birth_year ?? MOCK_SELF_PROFILE.birthYear,
          gender: profileData?.gender ?? MOCK_SELF_PROFILE.gender,
          nickname: profileData?.nickname ?? MOCK_SELF_PROFILE.nickname,
          passCount: passes?.reduce((sum, pass) => sum + pass.remaining, 0) ?? 0,
          region: profileData?.region ?? MOCK_SELF_PROFILE.region,
        });
      },
      { tags: { screen: 'my-profile', action: 'load' } },
    );
  }, [user]);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav title="마이프로필" onLeftPress={() => router.back()} />

      <ScrollView className="flex-1 bg-bg">
        <View className="pb-[42px]">
          <View className="px-[24px] pt-[26px]">
            <ProfileHero
              size="lg"
              editable
              name={profile.nickname ?? MOCK_SELF_PROFILE.nickname}
              meta={profileMeta(profile)}
              initial={toInitial(profile.nickname)}
              onEditPress={() => router.push(ROUTES.profileStep2)}
            />

            <Text className="mt-[14px] text-center text-[13px] leading-[19px] text-ink-3">
              {profile.bio}
            </Text>

            <Card className="mt-[24px] px-[16px] py-[16px]">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-[14px] font-extrabold text-ink">바로 매치 패스</Text>
                  <Text className="mt-[3px] text-[11.5px] text-ink-3">
                    {POLICY.payment.instantRematchProductId}
                  </Text>
                </View>
                <Badge variant="count">잔여 {profile.passCount}회</Badge>
              </View>
              <Button
                variant="mini-pill"
                className="mt-[12px]"
                onPress={() => router.push(ROUTES.booster)}
              >
                바로 매치
              </Button>
            </Card>
          </View>

          <View className="mt-[28px]">
            <SettingsRow
              label="알림 설정"
              value="매칭·멘션·리마인드"
              onPress={() => router.push(ROUTES.settingsNotifications)}
            />
            <SettingsRow
              label="고객센터"
              value="환불·문의"
              onPress={() => router.push(ROUTES.support)}
            />
            <SettingsRow
              variant="locked"
              label="성별·생년"
              value="본인인증 자동"
            />
            <SettingsRow
              variant="danger"
              label="회원 탈퇴"
              onPress={() => router.push(ROUTES.settingsWithdraw)}
            />
          </View>

          <View className="px-[24px] pt-[22px]">
            <Banner tone="info" icon="i" title="닉네임 변경">
              닉네임 변경은 {POLICY.identity.nicknameChangeThrottleDays}일에 한 번만 가능하도록
              제한돼요.
            </Banner>
            <Button
              variant="tertiary"
              fullWidth
              className="mt-[14px]"
              onPress={() => {
                void signOut();
              }}
            >
              로그아웃
            </Button>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
