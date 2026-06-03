import { useRouter } from 'expo-router';
import { ChevronRight, UserRound, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  analytics,
  formatRematchCountdown,
  getRematchRestriction,
  logger,
  POLICY,
} from '@dei/shared';
import { AlertDialog, Avatar, Banner, Card, Text, color } from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { getAuthGateRoute } from '@/lib/auth-flow';
import { toInitial } from '@/lib/b-flow';
import {
  repairProfileIdentityFromVerification,
  VERIFIED_IDENTITY_SELECT,
} from '@/lib/identity-profile';
import { enqueueMatchQueue, isMatchQueueError, isMatchQueueErrorCode } from '@/lib/matching';
import { getAppNotificationEnabled, registerPushToken } from '@/lib/notifications.stub';
import { requestPermission } from '@/lib/permissions';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type HomeProfile = {
  birthYear: number | null;
  gender: string | null;
  lastRoomLeaveAt: string | null;
  nickname: string | null;
  passCount: number;
  photoDisplayUrl: string | null;
  photoUrl: string | null;
  region: string | null;
};

function signedPhotoUrl(path: string) {
  return supabase.storage.from('profile-photos').createSignedUrl(path, 60 * 60);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [queueFailed, setQueueFailed] = useState(false);
  const [photoImageFailed, setPhotoImageFailed] = useState(false);
  const [profile, setProfile] = useState<HomeProfile>({
    birthYear: null,
    gender: null,
    lastRoomLeaveAt: null,
    nickname: null,
    passCount: 0,
    photoDisplayUrl: null,
    photoUrl: null,
    region: null,
  });

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.home_entered_waiting);

    if (!user) {
      return;
    }

    void logger.withErrorCapture(
      'home.load-profile',
      async () => {
        const [
          { data: profileData, error: profileError },
          { data: verifiedIdentity, error: verifiedIdentityError },
          { data: passes, error: passError },
        ] =
          await Promise.all([
            supabase
              .from('profile')
              .select('birth_year, gender, is_adult, last_room_leave_at, nickname, onboarding_completed_at, photo_url, region')
              .eq('user_id', user.id)
              .maybeSingle(),
            supabase
              .from('auth_verification')
              .select(VERIFIED_IDENTITY_SELECT)
              .eq('user_id', user.id)
              .eq('provider', 'portone')
              .eq('status', 'verified')
              .order('verified_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('pass')
              .select('remaining')
              .eq('user_id', user.id)
              .eq('status', 'active'),
          ]);

        if (profileError) throw profileError;
        if (verifiedIdentityError) throw verifiedIdentityError;
        if (passError) throw passError;

        const routedProfile = await repairProfileIdentityFromVerification({
          profile: profileData,
          userId: user.id,
          verification: verifiedIdentity,
        });
        const authGateRoute = getAuthGateRoute(routedProfile);
        if (authGateRoute === 'terms') {
          router.replace(ROUTES.terms);
          return;
        }

        if (authGateRoute === 'profileStep1') {
          router.replace(ROUTES.profileStep1);
          return;
        }

        if (authGateRoute === 'profileStep2') {
          router.replace(ROUTES.profileStep2);
          return;
        }

        if (authGateRoute === 'profileStep3') {
          router.replace(ROUTES.profileStep3);
          return;
        }

        if (!routedProfile) {
          router.replace(ROUTES.terms);
          return;
        }

        let photoDisplayUrl: string | null = null;
        if (routedProfile.photo_url) {
          const { data: signedPhoto, error: signedPhotoError } = await signedPhotoUrl(
            routedProfile.photo_url,
          );

          if (signedPhotoError) {
            logger.captureException(signedPhotoError, {
              tags: { screen: 'home', action: 'signed-photo' },
            });
          }

          photoDisplayUrl = signedPhoto?.signedUrl ?? null;
        }

        setProfile({
          birthYear: routedProfile.birth_year,
          gender: routedProfile.gender ?? null,
          lastRoomLeaveAt: routedProfile.last_room_leave_at,
          nickname: routedProfile.nickname ?? null,
          passCount: passes?.reduce((sum, pass) => sum + pass.remaining, 0) ?? 0,
          photoDisplayUrl,
          photoUrl: routedProfile.photo_url ?? null,
          region: routedProfile.region ?? null,
        });
        setPhotoImageFailed(false);
      },
      { tags: { screen: 'home', action: 'load-profile' } },
    );
  }, [router, user]);

  const rematchRestriction = getRematchRestriction(profile.lastRoomLeaveAt);
  const needsPaidRematch =
    rematchRestriction.restricted && profile.gender === 'male' && profile.passCount <= 0;
  const restrictionDescription =
    profile.gender === 'female' && POLICY.payment.femaleInstantRematchFree
      ? '여성은 바로 매치가 자동 면제돼요'
      : profile.passCount > 0
        ? `잔여 바로 매치 ${profile.passCount}회를 사용할 수 있어요`
        : '바로 매칭하려면 "바로 매치" 사용';
  const photoDisplayUrl = photoImageFailed ? null : profile.photoDisplayUrl;

  const startSolo = () => {
    if (!user?.id) {
      setQueueFailed(true);
      return;
    }

    if (needsPaidRematch) {
      analytics.capture(ANALYTICS_EVENTS.rematch_restriction_evaluated, {
        gender: profile.gender,
        remaining_ms: rematchRestriction.remainingMs,
        source: 'home',
      });
      router.push(ROUTES.booster);
      return;
    }

    void (async () => {
      try {
        analytics.capture(ANALYTICS_EVENTS.team_queue_registered, {
          mode: 'solo',
          source: 'home',
        });
        const appNotificationEnabled = await getAppNotificationEnabled(user.id);
        if (!appNotificationEnabled) {
          router.push({
            pathname: '/(app)/permission/notification',
            params: { memberIds: user.id },
          });
          return;
        }

        const status = await requestPermission('notification');
        if (status !== 'granted') {
          router.push({
            pathname: '/(app)/permission/notification',
            params: { memberIds: user.id },
          });
          return;
        }

        await registerPushToken(user.id).catch((error) => {
          logger.captureMessage('push token registration skipped', 'warning', {
            tags: { screen: 'home', action: 'register-push-token' },
            extra: { reason: getErrorMessage(error) },
          });
        });

        const registration = await enqueueMatchQueue([user.id]);
        // 큐 등록 = 커밋 상태(한 사람당 1개 큐). 홈을 스택에서 제거(replace)해야
        // 뒤로가기 스와이프로 취소 없이 홈으로 빠져나가는 상태 불일치를 막는다.
        if (registration.freeRematchWaived) {
          router.replace({
            pathname: '/(app)/queue',
            params: { notice: 'free-rematch' },
          });
          return;
        }

        router.replace(ROUTES.queue);
      } catch (error) {
        if (isMatchQueueErrorCode(error, 'REMATCH_RESTRICTED')) {
          router.push(ROUTES.booster);
          return;
        }

        if (isMatchQueueError(error)) {
          logger.captureMessage(error.message, 'warning', {
            tags: {
              screen: 'home',
              action: 'start-solo',
              code: error.code ?? 'UNKNOWN',
            },
          });
          setQueueFailed(true);
          return;
        }

        logger.captureException(error, {
          tags: { screen: 'home', action: 'start-solo-catch' },
        });
        setQueueFailed(true);
      }
    })();
  };

  const startTeam = () => {
    if (needsPaidRematch) {
      analytics.capture(ANALYTICS_EVENTS.rematch_restriction_evaluated, {
        gender: profile.gender,
        remaining_ms: rematchRestriction.remainingMs,
        source: 'home-team',
      });
      router.push(ROUTES.booster);
      return;
    }

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
            {photoDisplayUrl ? (
              <View className="relative h-[38px] w-[38px] overflow-hidden rounded-full bg-bg-2">
                <Image
                  key={photoDisplayUrl}
                  source={{ uri: photoDisplayUrl }}
                  className="absolute inset-0 h-full w-full"
                  resizeMode="cover"
                  accessibilityLabel="프로필 사진"
                  onError={(error) => {
                    setPhotoImageFailed(true);
                    logger.captureException(new Error('home profile photo image load failed'), {
                      tags: { screen: 'home', action: 'photo-render' },
                      extra: {
                        renderError: error.nativeEvent.error,
                        photoPath: profile.photoUrl,
                      },
                    });
                  }}
                />
              </View>
            ) : (
              <Avatar
                initial={toInitial(profile.nickname)}
                size={38}
                presenceDot={!profile.photoUrl}
              />
            )}
          </Pressable>
        </View>

        <View className="mt-[36px]">
          <Text variant="h1" className="text-[28px] leading-[36px]">
            오늘은 어떤{'\n'}일상을 공유할까요?
          </Text>
          <Text className="mt-[8px] text-[13.5px] leading-[20px] text-ink-3">
            혼자 또는 친구와 함께 · 방은 마지막 1명이 남을 때까지 유지돼요
          </Text>
        </View>

        {rematchRestriction.restricted ? (
          <Banner
            tone="accent"
            icon="⏱"
            title={`다음 매칭까지 ${formatRematchCountdown(rematchRestriction.remainingMs)}`}
            countdown={restrictionDescription}
            cta={needsPaidRematch ? '바로 매치' : '매칭 시작'}
            onCtaPress={startSolo}
            className="mt-[22px]"
          />
        ) : null}

        <View className={`${rematchRestriction.restricted ? 'mt-[24px]' : 'mt-[34px]'} gap-[12px]`}>
          <Pressable accessibilityRole="button" onPress={startSolo}>
            <Card variant="cta-entry">
              <View className="h-[42px] w-[42px] items-center justify-center rounded-full bg-accent-soft">
                <UserRound color={color.accent} size={18} />
              </View>
              <View className="flex-1">
                <Text className="text-[16px] font-extrabold text-ink">혼자 참여</Text>
                <Text className="mt-[3px] text-[12.5px] leading-[18px] text-ink-3">
                  바로 매칭 큐로 들어가요
                </Text>
              </View>
              <ChevronRight color={color['ink-4']} size={18} />
            </Card>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={startTeam}>
            <Card variant="cta-entry">
              <View className="h-[42px] w-[42px] items-center justify-center rounded-full bg-info-soft">
                <Users color={color.info} size={18} />
              </View>
              <View className="flex-1">
                <Text className="text-[16px] font-extrabold text-ink">친구와 함께</Text>
                <Text className="mt-[3px] text-[12.5px] leading-[18px] text-ink-3">
                  닉네임으로 친구를 초대해요 (최대 {POLICY.team.maxMembers}명)
                </Text>
              </View>
              <ChevronRight color={color['ink-4']} size={18} />
            </Card>
          </Pressable>
        </View>

        <View className="mt-auto border-t border-line pt-[14px]">
          <Text className="text-center text-[12.5px] leading-[19px] text-ink-3">
            우상단 아바타 dot = <Text className="font-semibold text-ink-2">프로필 미완성</Text>. 탭 = 프로필 수정 진입.
          </Text>
        </View>
      </View>

      <AlertDialog
        visible={queueFailed}
        tone="warn"
        icon="!"
        title="매칭을 시작하지 못했어요"
        description="프로필 상태와 네트워크를 확인한 뒤 다시 시도해주세요."
        actions={[
          { label: '확인', variant: 'secondary', onPress: () => setQueueFailed(false) },
          {
            label: '다시 시도',
            variant: 'ink',
            onPress: () => {
              setQueueFailed(false);
              startSolo();
            },
          },
        ]}
        onDismiss={() => setQueueFailed(false)}
      />
    </SafeAreaView>
  );
}
