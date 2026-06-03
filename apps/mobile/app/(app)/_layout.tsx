import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { logger } from '@dei/shared';
import { Spinner } from '@dei/ui';

import { getAppGateRoute } from '@/lib/auth-flow';
import { TERMS_VERSION } from '@/lib/b-flow';
import { useChatPresentationMode } from '@/lib/chat/presentation';
import {
  repairProfileIdentityFromVerification,
  VERIFIED_IDENTITY_SELECT,
} from '@/lib/identity-profile';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

/**
 * (app) 그룹 — 로그인 메인 흐름.
 * ------------------------------------------------------------------
 * 계획서엔 "탭" 으로 적혀 있었으나, HTML SSOT(all-screens) 의 실제 동선은
 * splash → home(S05) → queue(S07) → room(S13) → settings 허브(S19) 로
 * 이어지는 **스택 내비게이션**이며 화면을 가로지르는 영구 하단 탭바가 없다
 * (홈은 상단바 + 우상단 아바타로 프로필 진입). 따라서 SSOT 충실(D-03)을 위해
 * 탭이 아닌 Stack 으로 둔다. 헤더는 각 화면이 @dei/ui TopNav 로 직접 그린다.
 *
 * 딥링크: `dei://room/[roomId]` (room/[roomId] 동적 라우트로 흡수).
 */
export default function AppLayout() {
  const router = useRouter();
  const { isLoading, user } = useAuth();
  const [gatePassed, setGatePassed] = useState(false);
  // 채팅 진입 방식(피처 플래그, 앱 재배포 없이 원격 분기 — PostHog `chat-overlay-mode`).
  //  - overlay : 매칭된 방(room/index, 영상) 위 반투명 오버레이(transparentModal+fade).
  //              직전 화면(영상)이 마운트된 채 뒤에 비침. UX 스펙대로 scrim 은 화면이 그림.
  //  - legacy  : 기존 — 별도 화면(card)으로 push(불투명).
  // 영상 코드(room/index·video 훅)는 어느 모드에서도 건드리지 않는다.
  const overlay = useChatPresentationMode() === 'overlay';

  useEffect(() => {
    if (isLoading) {
      setGatePassed(false);
      return;
    }

    let disposed = false;
    const replaceIfActive: typeof router.replace = (href) => {
      if (!disposed) {
        router.replace(href);
      }
    };

    setGatePassed(false);

    if (!user) {
      replaceIfActive(ROUTES.terms);
      return () => {
        disposed = true;
      };
    }

    void logger.withErrorCapture(
      'app-layout.auth-gate',
      async () => {
        const [
          { data: profile, error: profileError },
          { data: verifiedIdentity, error: verifiedIdentityError },
          { data: termsAgreement, error: termsError },
        ] = await Promise.all([
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
        ]);

        if (profileError) throw profileError;
        if (verifiedIdentityError) throw verifiedIdentityError;
        if (termsError) throw termsError;

        const routedProfile = await repairProfileIdentityFromVerification({
          profile,
          userId: user.id,
          verification: verifiedIdentity,
        });
        const gateRoute = getAppGateRoute(routedProfile, {
          hasCurrentTermsAgreement: Boolean(termsAgreement),
          hasVerifiedIdentityRecord: Boolean(verifiedIdentity),
        });

        if (disposed) {
          return;
        }

        if (gateRoute === 'terms') {
          replaceIfActive(ROUTES.terms);
          return;
        }

        if (gateRoute === 'profileStep1') {
          replaceIfActive(ROUTES.profileStep1);
          return;
        }

        if (gateRoute === 'profileStep2') {
          replaceIfActive(ROUTES.profileStep2);
          return;
        }

        if (gateRoute === 'profileStep3') {
          replaceIfActive(ROUTES.profileStep3);
          return;
        }

        setGatePassed(true);
      },
      { tags: { screen: 'app-layout', action: 'auth-gate' } },
    ).catch(() => {
      replaceIfActive(ROUTES.splash);
    });

    return () => {
      disposed = true;
    };
  }, [isLoading, router, user]);

  if (!gatePassed) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <Spinner />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="room/[roomId]/chat"
        options={
          overlay
            ? { presentation: 'transparentModal', animation: 'fade' }
            : { presentation: 'card' }
        }
      />
    </Stack>
  );
}
