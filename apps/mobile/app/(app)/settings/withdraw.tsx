import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S20 — 회원 탈퇴
 * ==================================================================
 * 담당자: B
 * 화면 목적: S19 '회원 탈퇴' row → 진입. 비가역 영구 삭제 + 본인인증 재확인 +
 *           사유 수집 + 충동 방지를 위한 슬라이드 액션. 30일 재가입 제한
 *           (악성 재진입 방지).
 * 의존 DS 컴포넌트: Text(DestructiveHeading 대형 h1 + sub 카피) · TopNav(뒤로가기 +
 *   타이틀 '회원 탈퇴') · Card(DangerBox — 영구삭제 항목 + 30일 재가입 제한 안내) ·
 *   Radio/ChoiceList(RadioReasonList 사유 5개) · Textarea(ConditionalInput '기타'
 *   자유입력) · SettingsRow(VerifyCta 본인인증 재확인 진입) · Button(VerifyCta 인증하기) ·
 *   SlideToConfirm(SlideToAction '밀어서 탈퇴하기', S16 일관)  [@dei/ui]
 * 의존 데이터: 본인 계정/프로필(영구 삭제 대상: 프로필·사진·자기소개·잔여 패스·결제 이력)
 *   / CI 기반 30일 재가입 차단 레코드(테이블명 미명시) / 탈퇴 사유 수집 적재(테이블명 미명시)
 * 발생 이벤트(PostHog): S20:withdraw_screen_entered · terminal · 30d_reregister_blocked
 * 서버 의존(L1): 탈퇴 처리(계정·관련 데이터 영구 삭제) 엔드포인트 / 동일 CI 30일 재가입
 *   차단 기록 / PortOne 본인인증 재확인(외부 — 재인증 성공 후에만 탈퇴 처리) /
 *   탈퇴 후 세션 무효화·로그아웃
 * 정책 의존(L2): 비가역 영구 삭제 범위 정책(영상·채팅은 휘발이라 제외) / 동일 CI 30일
 *   재가입 제한 정책 / 본인인증 재확인 선행 필수 게이트
 * 와이어프레임 참조: all-screens S20
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(위험 박스·사유 라디오·본인인증 CTA·슬라이드 투 액션)은 owner 가 채운다.
 */
export default function WithdrawScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">회원 탈퇴</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S20
        </Text>
      </View>
    </SafeAreaView>
  );
}
