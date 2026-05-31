import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logger } from '@dei/shared';
import { Button, Spinner, Text } from '@dei/ui';

import { getAuthGateRoute } from '@/lib/auth-flow';
import { TERMS_VERSION } from '@/lib/b-flow';
import {
  repairProfileIdentityFromVerification,
  VERIFIED_IDENTITY_SELECT,
} from '@/lib/identity-profile';
import { expireMatchQueue, isQueueExpired } from '@/lib/matching';
import { roomRoutes, ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

const MIN_SPLASH_MS = 1_500;

/**
 * S01 — 앱 첫 실행 (splash) · L0 5분기 라우팅 부트스트랩
 * ==================================================================
 * 담당자: B
 * 화면 목적: 콜드스타트 동안 브랜드 각인 + 앱 상태 판별 후 5분기 라우팅.
 * 의존 DS 컴포넌트: Text(variant=logo) · Spinner (브랜드마크 + 로딩 인디케이터)
 * 의존 데이터: auth session · 프로필 완성 여부(profile) · 큐 등록(match_queue) · 방 존재(room)
 * 발생 이벤트(PostHog): 없음 (라우팅 전이만)
 * 서버 의존(L1): Supabase Auth(ES256/JWKS) + 부트스트랩 조회(프로필/큐/방 1회 판별)
 * 정책 의존(L2): 없음 (한 사람당 1개 방 원칙은 라우팅 결과로 반영)
 * 와이어프레임 참조: all-screens S01
 *
 * 라우팅 분기(routingMeta):
 *   비로그인 → S02 (terms) / 로그인+프로필미완성 → S04 (profile)
 *   로그인+매칭전 → S05 (home) / 로그인+매칭중 → S07 (queue)
 *   로그인+매칭후(방있음) → S13 (room) 직행
 *
 * 현재 구현: 세션, 최신 약관 동의, 프로필 완성, 활성 방, 대기 큐와 큐 만료를
 * 조회해 splash에서 각 화면으로 직행시킨다. 큐 만료 시 Edge Function으로
 * 상태를 정리한 뒤 S09로 보낸다.
 */
export default function SplashRouter() {
  const router = useRouter();
  const { isLoading, user } = useAuth();
  const [routeError, setRouteError] = useState(false);
  const [routeAttempt, setRouteAttempt] = useState(0);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    let disposed = false;
    let timedOut = false;
    const startedAt = Date.now();
    const canContinue = () => !disposed && !timedOut;
    const replaceIfActive: typeof router.replace = (href) => {
      if (canContinue()) {
        router.replace(href);
      }
    };
    const replaceAfterMinimumSplash = async (
      href: Parameters<typeof router.replace>[0],
    ) => {
      const remainingMs = Math.max(MIN_SPLASH_MS - (Date.now() - startedAt), 0);

      if (remainingMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingMs));
      }

      replaceIfActive(href);
    };
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setRouteError(true);
    }, 10_000);

    setRouteError(false);

    void logger.withErrorCapture(
      'splash.route',
      async () => {
        if (!user) {
          await replaceAfterMinimumSplash(ROUTES.terms);
          return;
        }

        const [
          { data: profile, error: profileError },
          { data: verifiedIdentity, error: verifiedIdentityError },
          { data: termsAgreement, error: termsError },
          { data: roomMember, error: roomError },
        ] =
          await Promise.all([
            supabase
              .from('profile')
              .select('birth_year, gender, is_adult, nickname, onboarding_completed_at, photo_url, region')
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
              .from('terms_agreement')
              .select('id')
              .eq('user_id', user.id)
              .eq('terms_version', TERMS_VERSION)
              .maybeSingle(),
            supabase
              .from('room_member')
              .select('room_id')
              .eq('user_id', user.id)
              .eq('status', 'active')
              .limit(1)
              .maybeSingle(),
          ]);

        if (profileError) throw profileError;
        if (verifiedIdentityError) throw verifiedIdentityError;
        if (termsError) throw termsError;
        if (roomError) {
          logger.captureException(roomError, {
            tags: { screen: 'splash', action: 'room-lookup' },
          });
        }

        const routedProfile = await repairProfileIdentityFromVerification({
          profile,
          userId: user.id,
          verification: verifiedIdentity,
        });
        const authGateRoute = getAuthGateRoute(routedProfile);
        if (authGateRoute === 'terms') {
          await replaceAfterMinimumSplash(ROUTES.terms);
          return;
        }

        if (!termsAgreement) {
          await replaceAfterMinimumSplash(ROUTES.terms);
          return;
        }

        if (authGateRoute === 'profileStep1') {
          await replaceAfterMinimumSplash(ROUTES.profileStep1);
          return;
        }

        if (authGateRoute === 'profileStep2') {
          await replaceAfterMinimumSplash(ROUTES.profileStep2);
          return;
        }

        if (authGateRoute === 'profileStep3') {
          await replaceAfterMinimumSplash(ROUTES.profileStep3);
          return;
        }

        if (!roomError && roomMember?.room_id) {
          await replaceAfterMinimumSplash(roomRoutes.index(roomMember.room_id));
          return;
        }

        const { data: teamMembers, error: teamError } = await supabase
          .from('team_member')
          .select('team_id')
          .eq('user_id', user.id);

        if (teamError) {
          logger.captureException(teamError, {
            tags: { screen: 'splash', action: 'team-lookup' },
          });
          await replaceAfterMinimumSplash(ROUTES.home);
          return;
        }

        const teamIds = teamMembers?.map((team) => team.team_id) ?? [];

        if (teamIds.length > 0) {
          const { data: queue, error: queueError } = await supabase
            .from('match_queue')
            .select('expires_at, id')
            .in('team_id', teamIds)
            .eq('status', 'waiting')
            .limit(1)
            .maybeSingle();

          if (queueError) {
            logger.captureException(queueError, {
              tags: { screen: 'splash', action: 'queue-lookup' },
            });
            await replaceAfterMinimumSplash(ROUTES.home);
            return;
          }

          if (queue) {
            if (isQueueExpired(queue.expires_at)) {
              await expireMatchQueue().catch((error) => {
                logger.captureException(error, {
                  tags: { screen: 'splash', action: 'expire-queue' },
                });
              });
              await replaceAfterMinimumSplash(ROUTES.matchFailed);
              return;
            }

            await replaceAfterMinimumSplash(ROUTES.queue);
            return;
          }
        }

        await replaceAfterMinimumSplash(ROUTES.home);
      },
      { tags: { screen: 'splash' } },
    )
      .catch(() => {
        if (canContinue()) {
          setRouteError(true);
        }
      })
      .finally(() => clearTimeout(timeoutId));

    return () => {
      disposed = true;
      clearTimeout(timeoutId);
    };
  }, [isLoading, user, router, routeAttempt]);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 px-[32px] pb-[32px] pt-[60px]">
        <Text variant="logo" className="mb-[16px] mt-auto text-center text-[64px] leading-[64px]">
          dei<Text variant="logo" tone="accent" className="text-[64px] leading-[64px]">.</Text>
        </Text>
        <Text className="mb-[8px] text-center text-[18px] font-bold leading-[24px] text-ink">
          오늘 하루, 누군가의 일상으로
        </Text>
        <Text className="mb-auto text-center text-[14px] leading-[21px] text-ink-3">
          혼자도, 친구와도. 3초로 자연스럽게
        </Text>

        {routeError ? (
          <View className="mb-[22px] items-center gap-[12px]">
            <Text variant="caption" tone="accent" className="text-center">
              연결이 불안정해요. 다시 시도해주세요.
            </Text>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => setRouteAttempt((attempt) => attempt + 1)}
            >
              재시도
            </Button>
          </View>
        ) : (
          <Spinner size={36} className="mb-[32px] self-center" />
        )}
      </View>
    </SafeAreaView>
  );
}
