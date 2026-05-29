import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S23 — 고객센터
 * ==================================================================
 * 담당자: B
 * 화면 목적: S19 '고객센터'·'환불 요청'·S18 결제 실패 '고객센터 문의' → 진입.
 *           인앱 간단 문의 폼 + 영업일 회신. 환불 요청은 분류 자동 선택.
 *           인앱 또는 이메일 회신.
 * 의존 DS 컴포넌트: TopNav(뒤로가기 + 타이틀 '고객센터') · Text(헤딩 '무엇이 궁금하신가요?')
 *   · Select 또는 Chip(분류 선택 드롭다운/칩 · 환불 요청 시 readonly Input 대체)
 *   · Textarea(내용 최대 500자 + 글자 카운트) · Input(회신 이메일 선택 입력)
 *   · Banner(info-soft 회신 안내 'ℹ 영업일 N일 내 회신') · BottomActionBar(고정 CTA '보내기')
 *   · Button(CTA '보내기' · 내용 입력 시 활성)  [@dei/ui]
 *   ※ 토스트 '문의를 받았어요' 는 화면 외 토스트 채널로 처리(@dei/ui 미보유)
 * 의존 데이터: support_inquiries(분류 + 내용 + 회신 이메일 + 신고자, 테이블명 HTML 미명시) /
 *   본인 이메일(자동 입력 시도 — 본인인증 시 이메일 미수집이라 비어있을 수 있음)
 * 발생 이벤트(PostHog): S23:support_form_opened · S23:inquiry_submitted
 * 서버 의존(L1): 문의 제출 엔드포인트 → 운영 큐 적재(HTML 미명시) /
 *   인앱 알림 회신 경로(이메일 미입력 시, HTML 미명시)
 * 정책 의존(L2): 인앱 폼 단일 채널(이메일·카톡 연동 X) / 분류 4종 enum(결제·환불 / 매칭 /
 *   차단·신고 / 기타) / 환불 요청 진입 시 분류 자동 선택 / 내용 최대 500자 /
 *   영업일 N일 회신(mockup 예시: 2일)
 * 와이어프레임 참조: all-screens S23
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(분류 선택·textarea+카운트·회신 이메일·회신 안내·제출 CTA·토스트)은 owner 가 채운다.
 */
export default function SupportScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">고객센터</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S23
        </Text>
      </View>
    </SafeAreaView>
  );
}
