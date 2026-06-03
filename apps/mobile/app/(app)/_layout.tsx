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
      {/* 큐(웨이팅)는 커밋 상태 — 뒤로가기 제스처로 취소 없이 빠져나가지 못하게
          막는다(한 사람당 1개 큐, "무조건 웨이팅 화면만"). 큐 이탈은 화면 안의
          "매칭 취소" 플로우(S08)로만. enqueue 진입부도 replace 로 홈을 스택에서
          제거하지만, 이 게이트가 어떤 경로의 push 에도 방어선이 된다. */}
      <Stack.Screen
        name="queue"
        options={{ gestureEnabled: false, headerBackVisible: false }}
      />
      {/* 방(매칭됨)도 동일 — 매칭된 회원은 어떤 경로로도 홈(매칭 전)으로 못 나간다.
          방 이탈은 "방 나가기" 정식 플로우(S16 leave-confirm)로만. 제스처 차단 +
          room/index 의 Android BackHandler 가 양 플랫폼을 막는다. */}
      <Stack.Screen
        name="room/[roomId]/index"
        options={{ gestureEnabled: false, headerBackVisible: false }}
      />
      <Stack.Screen
        name="room/[roomId]/chat"
        options={
          overlay
            ? { presentation: 'transparentModal', animation: 'fade' }
            : { presentation: 'card' }
        }
      />
      {/*
       * 방 나가기 확인 — 내부에서 BottomSheet(RN Modal, 아래서 슬라이드업)를 직접
       * 그리는 화면. 기본 card presentation 이면 (a) 화면이 옆에서 슬라이드 +
       * (b) 내부 BottomSheet 가 아래서 슬라이드 = 이중 애니메이션이고, iOS card 의
       * swipe-to-dismiss 제스처 때문에 시트가 위아래로 끌려다닌다. 그래서:
       *  - transparentModal: 뒤 방 화면이 비친 채 BottomSheet 만 아래서 등장(단일 애니).
       *  - animation:'fade': 화면 자체의 옆 슬라이드 제거(등장은 BottomSheet 가 담당).
       *  - gestureEnabled:false: 스와이프-디스미스 차단 → 시트 위치 고정(드래그 잠금).
       */}
      <Stack.Screen
        name="room/[roomId]/leave-confirm"
        options={{
          presentation: 'transparentModal',
          animation: 'fade',
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}
