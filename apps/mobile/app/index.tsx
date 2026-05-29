import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logger } from '@dei/shared';
import { Spinner, Text } from '@dei/ui';

import { ROUTES } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';

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
 * ⚠️ 부트스트랩 조회(프로필/큐/방 상태 1회 판별)는 B 가 구현한다. 아래는 세션
 * 유무 기준의 *골격* 분기다 — 로그인 사용자의 세부 분기(프로필/큐/방)는
 * TODO 주석 위치에서 채운다.
 */
export default function SplashRouter() {
  const router = useRouter();
  const { isLoading, user } = useAuth();
  const [routeError, setRouteError] = useState(false);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    void logger.withErrorCapture(
      'splash.route',
      async () => {
        if (!user) {
          router.replace(ROUTES.terms);
          return;
        }

        // TODO(B): 부트스트랩 조회로 프로필 완성/큐 등록/방 존재를 1회 판별해
        // 아래 5분기를 완성한다. 현재는 로그인=홈으로 보내는 골격.
        //   if (!profileComplete) router.replace(ROUTES.profileStep1);
        //   else if (hasRoom)     router.replace(roomRoutes.index(roomId));
        //   else if (inQueue)     router.replace(ROUTES.queue);
        //   else                  router.replace(ROUTES.home);
        router.replace(ROUTES.home);
      },
      { tags: { screen: 'splash' } },
    ).catch(() => setRouteError(true));
  }, [isLoading, user, router]);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-6 px-6">
        <Text variant="logo">
          dei<Text variant="logo" tone="accent">.</Text>
        </Text>
        <Text variant="h2" className="text-center">
          오늘 하루, 누군가의 일상으로
        </Text>
        <Text variant="caption" className="text-center">
          혼자도, 친구와도. 3초로 자연스럽게
        </Text>

        {routeError ? (
          <Text variant="caption" tone="accent" className="mt-4 text-center">
            연결이 불안정해요. 앱을 다시 시작해주세요.
          </Text>
        ) : (
          <Spinner size={36} className="mt-4" />
        )}
      </View>
    </SafeAreaView>
  );
}
