import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S07 — 매칭 큐 대기 (홈 ② 매칭 중)
 * ==================================================================
 * 담당자: B
 * 화면 목적: 홈 3-state 중 ② 매칭 중 상태. 대기 시간이 2~6시간이라 사용자는
 *           앱을 닫고 일상을 보냄 — 매칭 성사 신호는 푸시 알림이 사실상 유일한
 *           채널. 이 화면은 큐에 들어가 있다는 상태 확인 + 취소 진입점일 뿐.
 * 의존 DS 컴포넌트: Text · PulseRing(대기 펄스 + dei 코어 마크) ·
 *   Card(EstimateBox '2~6 시간' bg-2 박스) · IconButton(우하단 fab 매칭 취소) ·
 *   AlertDialog(큐 등록 실패 alert + S05 복귀)  [@dei/ui]
 * 의존 데이터: match_queue(현재 큐 등록 상태·큐 깊이) · 푸시 알림 토큰(매칭 성사
 *   신호 채널)
 * 발생 이벤트(PostHog): 없음
 * 서버 의존(L1): 매칭 워커 B1(match_succeeded_push_sent 푸시 발송) /
 *   큐 상태·평균 대기시간 조회(실시간 동적) / 큐 등록 실패 핸들링
 * 정책 의존(L2): 대기 시간 = 서버단 동적 산출(큐 깊이·매칭 속도) /
 *   큐 위치·단계 비노출 / 큐 만료 24h(S09 트리거)
 * 와이어프레임 참조: all-screens S07
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(펄스 대기 표시·EstimateBox·취소 fab·등록 실패 alert)은 owner 가 채운다.
 */
export default function QueueScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">매칭 큐 대기 (매칭 중)</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S07
        </Text>
      </View>
    </SafeAreaView>
  );
}
