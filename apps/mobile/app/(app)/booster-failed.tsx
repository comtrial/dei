import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S18 — 결제 실패 alert
 * ==================================================================
 * 담당자: B
 * 화면 목적: S17 바로 매치 결제 실패(카드 거절·잔액 부족·네트워크 등) 시
 *   표시하는 모달. 24h 제한이 그대로 유지됨을 명확히 알리고 다음 액션을
 *   제시한다. 닫기 → S05 홈(제한 상태 그대로). NOTE: HTML 주석/작업브리프의
 *   'VLOG/Wrapped' 라벨은 stale — planning-panel SSOT 기준 S18 = '결제 실패 alert'.
 * 의존 DS 컴포넌트: Text · AlertDialog(.sPF 반투명 오버레이 + 흐림 + 중앙 modal)
 *   · Banner(경고 StatusIcon danger-soft '!' / info-soft 안심 박스)
 *   · Card(font-mono PG 에러코드 CodeBox) · IconButton(에러코드 복사)
 *   · Button(StackedCtaList: primary 재시도 / secondary 고객센터 / tertiary 닫기)  [@dei/ui]
 * 의존 데이터: S17 결제 트랜잭션 실패 결과 + PG error_code(card_declined ·
 *   insufficient_funds 등) 수신 / 24h 제한 상태 유지 확인(실패가 제한 시간에 영향 없음)
 * 발생 이벤트(PostHog): payment_failure_alert_shown
 * 서버 의존(L1): PG(PortOne) 실패 콜백 → 에러 코드 전달 / 재시도 시 S17 결제
 *   경로 재진입 / 고객센터 폼(S23) 연결
 * 정책 의존(L2): 결제 실패 시 추가 페널티 없음(제한 시간 증가 X) /
 *   고객센터 진입 채널 — 묶음 6에서 확정 예정(pending)
 * 와이어프레임 참조: all-screens S18
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(반투명 모달·StatusIcon·CodeBox 복사·3단 CTA)은 owner 가 채운다.
 */
export default function BoosterFailedScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">결제 실패 alert</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S18
        </Text>
      </View>
    </SafeAreaView>
  );
}
