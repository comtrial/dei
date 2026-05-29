import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S08 — 매칭 취소 confirm (sheet)
 * ==================================================================
 * 담당자: B
 * 화면 목적: S07에서 매칭 취소 버튼 탭 → bottom sheet로 confirm. 실수 누름·잘못
 *           누름 방어. 큐 등록 후 사용자가 어느 정도 기다린 sunk cost를 명시해
 *           충동 취소를 억제한다.
 * 의존 DS 컴포넌트: BottomSheet(scrim + slide-up panel) · SheetHandle(grabber) ·
 *   IconButton(⚠ 경고 아이콘) · Text(헤딩 "정말 취소하시겠어요?" · 설명) ·
 *   Banner(ProgressInfoStrip — 대기 시간 sunk-cost 표시) · Button(취소하기
 *   destructive + 유지하기 primary, TwoButtonRow)  [@dei/ui]
 * 의존 데이터: match_queue(등록 시각 → 경과 시간 산출, 묶음 멤버 목록) /
 *   푸시 알림(멤버 전원 통지)
 * 발생 이벤트(PostHog): S3:match_cancel_confirm_shown · S3:match_cancelled_by_user
 *   (lib/analytics-taxonomy)
 * 서버 의존(L1): 큐 취소 RPC(큐에서 묶음 제거) / 과팅 멤버 전원 취소 푸시 발송 /
 *   진행 대기 시간(경과 시간) 조회
 * 정책 의존(L2): 큐 취소 = 24h 재매칭 제한 적용 X(PRD §13은 방 이탈에만 적용) /
 *   과팅 묶음 취소 → 멤버 전원 푸시 알림
 * 와이어프레임 참조: all-screens S08
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(BottomSheet confirm · 대기시간 strip · 2버튼 동작)은 owner 가 채운다.
 */
export default function MatchCancelConfirmScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">매칭 취소 confirm (sheet)</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S08
        </Text>
      </View>
    </SafeAreaView>
  );
}
