import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BrandTransitionFrame,
  Button,
  IconButton,
  PulseRing,
  Spinner,
  Text,
} from '@dei/ui';

import { ROUTES } from '@/lib/routes';

/**
 * S03 — 본인인증 진행 중 (PortOne)
 * ==================================================================
 * 담당자: B
 * 화면 목적: 외부 본인인증 SDK 호출 → 인증기관(NICE/KCB) 이탈 동안의 1~2초
 *           대기 + 이탈 방지. 인증 콜백 도착 시 자동으로 프로필(S04)로 진행.
 * 의존 DS 컴포넌트: Text · IconButton(우상단 X 닫기, S03f 공유) ·
 *   BrandTransitionFrame('dei. → PortOne' 전환 시각화) · Spinner(대형
 *   ProgressRing) · PulseRing(spinner primitive 변형) · AlertDialog(CI중복·
 *   연속실패 잠금·19세미만 조건부 시스템 alert)  [@dei/ui]
 * 의존 데이터: PortOne 본인인증 결과(실명·생년월일·성별·CI, 프로필 root of
 *   trust) / CI 중복 조회(동일 CI → 기존 user 강제 로그인) / 연속 실패
 *   카운터 + 24h 잠금 상태
 * 발생 이벤트(PostHog): S03:phone_auth_cancelled_by_user (F-Auth)
 * 서버 의존(L1): PortOne SDK 콜백 검증 Edge Function(인증 결과 검증·CI 해시
 *   저장) / CI 기반 계정 조회·생성·로그인(중복 시 기존 계정 토큰 발급) /
 *   실패 횟수 누적·잠금 임계값(5회/24h) 관리 서버 로직
 * 정책 의존(L2): 19+ 연령 게이트(L0 검증) / 연속 실패 5회 → 24h 잠금 /
 *   CI 중복 = 새 계정 생성 금지·기존 계정 강제 / 본인인증 정보 변경
 *   불가(가입 시 1회)
 * 와이어프레임 참조: all-screens S03
 *
 * B-01 Auth UI shell — PortOne 전환/진행 상태의 시각 UI 만 구현.
 * SDK 호출, Edge Function 검증, auth 승격, 실패 카운터 정책은 후속 PR 범위다.
 */
export default function VerifyScreen() {
  const router = useRouter();
  const [isInProgress, setIsInProgress] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="items-end px-5 py-3">
        <IconButton
          glyph={X}
          variant="filled-circle"
          size={36}
          accessibilityLabel="본인인증 취소"
          onPress={() => router.replace(ROUTES.terms)}
          testID="verify-close"
        />
      </View>

      <View className="flex-1 items-center justify-center gap-8 px-8 pb-8">
        <View className="items-center gap-5">
          {isInProgress ? (
            <Spinner size={80} accessibilityLabel="본인인증 진행 중" />
          ) : (
            <PulseRing
              accessibilityLabel="본인인증 준비"
              core={
                <Text className="text-sm font-black text-white">
                  dei
                </Text>
              }
            />
          )}

          <BrandTransitionFrame target="PortOne" />
        </View>

        <View className="items-center gap-3">
          <Text variant="h1" className="text-center leading-9">
            {isInProgress
              ? 'PortOne 본인인증을 진행하고 있어요'
              : 'PortOne 본인인증을 준비했어요'}
          </Text>
          <Text variant="body" tone="ink-3" className="text-center leading-6">
            NICE / KCB 본인인증 기관으로 잠시 이동합니다.
          </Text>
          <Text variant="caption" tone="ink-4" className="text-center leading-5">
            인증이 끝나면 자동으로 진행돼요.
          </Text>
        </View>

        <View className="w-full gap-3">
          <Button
            fullWidth
            disabled={isInProgress}
            onPress={() => setIsInProgress(true)}
            testID="verify-start"
          >
            {isInProgress ? '본인인증 진행 중' : '본인인증 시작'}
          </Button>

          {isInProgress ? (
            <Button
              variant="secondary"
              fullWidth
              onPress={() => router.push(ROUTES.verifyFailed)}
              testID="verify-fallback-failed"
            >
              인증이 잘 안 돼요
            </Button>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
