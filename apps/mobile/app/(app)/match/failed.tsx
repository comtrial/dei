import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S09 — 매칭 실패 / 큐 만료
 * ==================================================================
 * 담당자: B
 * 화면 목적: 큐 등록 후 24h 내 매칭 안 됨 → 푸시 알림 + 앱 진입 시 이 화면.
 *           사용자가 빈손으로 돌아가지 않도록 "왜 안 됐는지" + "다음 액션" 명시.
 * 의존 DS 컴포넌트: Text · IconButton(CloseButton 우상단 → S05 홈)
 *   · EmptyBlob/StateView(EmptyStateLayout: 안내 아이콘 + 헤딩 + 설명, center body)
 *   · Card(WhyBox/InfoCallout "왜 만료됐나요?" 제목 + 3 사유, 비난 톤 X)
 *   · Button(PrimaryCTA accent solid "다시 매칭 시작")  [@dei/ui]
 *   (TextLinkAction "나중에 다시 시도" 는 Text/Button text 변형으로)
 * 의존 데이터: match_queue(등록 시각 + 24h 만료 상태) · 푸시 알림(만료 안내 신규 채널 9번)
 *   · 묶음 멤버 목록(과팅 만료 전원 통지)
 * 발생 이벤트(PostHog): 없음
 * 서버 의존(L1): 큐 만료 배치/스케줄러(24h 경과 자동 만료) / 큐 만료 푸시 발송(개인 +
 *   과팅 묶음 전원) / 재매칭 시작 RPC(만료 후 즉시 재등록 허용)
 * 정책 의존(L2): 큐 만료 = 24h(PRD 미명시·가정 정책) / 큐 만료에는 24h 재매칭 제한
 *   적용 X(자동 만료는 시스템 책임) / PRD §11 알림 9번 큐 만료 안내(신규 정책 필요)
 * 와이어프레임 참조: all-screens S09
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(CloseButton·WhyBox 3사유·2-CTA 동작)은 owner 가 채운다.
 */
export default function MatchFailedScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">매칭 실패 / 큐 만료</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S09
        </Text>
      </View>
    </SafeAreaView>
  );
}
