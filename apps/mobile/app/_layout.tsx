import '../global.css';

import { analytics } from '@dei/shared';
import { Stack } from 'expo-router';
import { VideoView } from 'expo-video';
import { cssInterop } from 'nativewind';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { initPostHog } from '@/lib/posthog';
import { initPurchases } from '@/lib/purchases';
import { initSentry } from '@/lib/sentry';
import { supabase } from '@/lib/supabase';
import { AuthProvider } from '@/providers/auth-provider';
import { RootGate } from '@/providers/root-gate';

cssInterop(VideoView, { className: 'style' });

/**
 * 루트 레이아웃 (spec §3.3 · A-4)
 * ------------------------------------------------------------------
 * 앱 진입점. 관측 transport(Sentry·PostHog)를 트리 마운트 전에 1회 등록하고,
 * 인증/세션 가드/제스처/세이프에어리어 프로바이더를 깐다. 라우트 그룹
 * ((auth)/(onboarding)/(app))은 각 그룹 _layout 이 담당.
 *
 * 데이터페칭 컨벤션(spec §3.3): TanStack Query 를 데이터 계층 SSOT 로 쓰기로
 * 했으나, 이번 셋팅은 빈 화면 스캐폴딩 단계라 QueryClientProvider 는 의도적으로
 * 아직 깔지 않는다(미사용 의존 회피). 데이터 연동을 시작하는 화면 담당자가
 * `@tanstack/react-query` 도입 시 여기에 QueryClientProvider 를 추가한다.
 */
export default function RootLayout() {
  useEffect(() => {
    initSentry();
    initPostHog();
    initPurchases();
    // app_opened — Activation 퍼널 분모. 토큰 보유 여부는 저장된 세션으로 판정.
    void supabase.auth.getSession().then(({ data }) => {
      analytics.capture(ANALYTICS_EVENTS.app_opened, {
        has_token: Boolean(data.session),
        source: 'cold_start',
      });
    });
  }, []);

  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <AuthProvider>
          <RootGate>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(onboarding)" />
              <Stack.Screen name="(app)" />
            </Stack>
          </RootGate>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
