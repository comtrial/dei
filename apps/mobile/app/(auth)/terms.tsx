import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S02 — 약관 + 19+ 자가확인
 * ==================================================================
 * 담당자: B
 * 화면 목적: 법적 약관 동의 + 19+ 자가확인을 받아 본인인증(외부 SDK) 진입
 *           게이트를 통과시킨다. PRD v0.7 §15 '본인 인증·연령 게이트' 충족.
 * 의존 DS 컴포넌트: Text · TopNav(닫기 < → splash 복귀) · Badge(연령 게이트
 *   '19세 미만 이용 불가' pill) · Card(CheckAll '모두 동의' 마스터 카드)
 *   · Checkbox(모두 동의 + 각 약관 항목 체크) · SettingsRow(약관 항목 행 +
 *   '보기 ›' chevron) · Chip(필수/선택 RequiredTag) · Button(PrimaryCTA
 *   '동의하고 본인인증 시작', 필수 미충족 시 비활성) · AlertDialog(약관 전문
 *   로드 실패 시 재시도)  [@dei/ui]
 * 의존 데이터: 약관 항목 메타·전문(terms/policy versions 테이블 또는 정적
 *   호스팅 문서) / 사용자별 동의 상태(consents/agreements 테이블: 약관 버전 +
 *   동의 시각) / 동의된 약관 버전 vs 현재 버전 비교(재동의 트리거)
 * 발생 이벤트(PostHog): terms_agreement_screen_entered (start · F-Auth
 *   가입+본인인증)  (lib/analytics-taxonomy)
 * 서버 의존(L1): 약관 전문 로드(실패 시 alert+재시도) / 동의 기록 저장
 *   엔드포인트 / 위치정보 동의 플래그는 S04c 지역 자동채움과 연동되므로
 *   프로필 컨텍스트로 전달
 * 정책 의존(L2): 약관 필수/선택 구분(서비스약관·개인정보=필수,
 *   위치·마케팅=선택) / 약관 버전 변경 시 재동의 강제 운영 로직
 * 와이어프레임 참조: all-screens S02
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현('모두 동의' 카드·약관 항목 행·19+ 배지·CTA 동작)은 owner 가 채운다.
 */
export default function TermsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">약관 + 19+ 자가확인</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S02
        </Text>
      </View>
    </SafeAreaView>
  );
}
