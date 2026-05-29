import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S07a — 알림 권한 필요 안내
 * ==================================================================
 * 담당자: B
 * 화면 목적: 매칭 큐 등록 직전 알림 권한 거부 상태로 차단된 사용자에게 표시하는
 *           조건부 게이트. 매칭 성사·업로드 알림·멘션 등 핵심 기능이 모두 알림에
 *           의존하므로 권한 없이는 큐 등록 불가.
 * 의존 DS 컴포넌트: Text · IconButton(CloseButton 우상단 원형 — S05 홈 복귀)
 *   · PermissionGate(center body: 아이콘+헤딩+설명 레이아웃) · Card(WhyBox '왜
 *   필요한가요?' info callout — 매칭 성사/매시간 업로드/멘션 3항목) · Button(StackedCTA:
 *   primary '설정에서 알림 켜기' deep link / secondary '나중에 하기' S05 복귀)  [@dei/ui]
 * 의존 데이터: 없음
 * 발생 이벤트(PostHog): 없음
 * 서버 의존(L1): 없음
 * 정책 의존(L2): 알림 권한 = 큐 등록 hard gate(권한 없으면 등록 불가) /
 *   재진입 시 매번 안내(쿨다운 정책 없음) / 설정 deep link 복귀 후 큐 자동
 *   진행(deferred queue intent)
 * 와이어프레임 참조: all-screens S07a
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(CloseButton·아이콘 배지·WhyBox·스택형 CTA·설정 deep link)은 owner 가 채운다.
 */
export default function NotificationPermissionScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">알림 권한 필요 안내</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S07a
        </Text>
      </View>
    </SafeAreaView>
  );
}
