import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

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
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(PortOne SDK 호출·브랜드 전환·콜백 자동 진행·조건부 alert)은
 *    owner 가 채운다.
 */
export default function VerifyScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">본인인증 진행 중</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S03
        </Text>
      </View>
    </SafeAreaView>
  );
}
