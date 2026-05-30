import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BrandTransitionFrame,
  IconButton,
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

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="items-end px-[18px] pt-[8px]">
        <IconButton
          glyph={X}
          variant="filled-circle"
          size={36}
          accessibilityLabel="본인인증 취소"
          onPress={() => router.replace(ROUTES.terms)}
          testID="verify-close"
        />
      </View>

      <View className="flex-1 items-center px-[32px] pb-[32px] pt-[100px]">
        <BrandTransitionFrame target="PortOne" className="mb-[30px] mt-auto" />

        <Spinner
          size={80}
          accessibilityLabel="본인인증 진행 중"
          className="mb-[22px]"
        />

        <Text
          variant="h2"
          className="text-center text-[19px] font-bold leading-[27px]"
        >
          PortOne 본인인증을{'\n'}진행하고 있어요
        </Text>
        <Text
          variant="body"
          tone="ink-3"
          className="mt-[8px] text-center text-[13px] leading-[20px]"
        >
          NICE / KCB 본인인증 기관으로{'\n'}잠시 이동합니다
        </Text>
        <Text
          variant="micro"
          tone="ink-4"
          className="mt-auto text-center text-[11px] leading-[17px]"
        >
          인증이 끝나면 자동으로 진행돼요
        </Text>
      </View>
    </SafeAreaView>
  );
}
