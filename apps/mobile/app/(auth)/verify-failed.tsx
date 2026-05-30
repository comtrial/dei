import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, IconButton, StateView } from '@dei/ui';

import { ROUTES } from '@/lib/routes';

/**
 * S03f — 본인인증 실패
 * ==================================================================
 * 담당자: B
 * 화면 목적: PortOne 본인인증 실패(사용자 취소·타임아웃·기관 거부) 시 진입.
 *           다시 시도(→ S03 재진입)와 취소(→ S02) 두 갈래 동선을 제공해
 *           사용자가 막히지 않게 한다. 실패 케이스는 한 화면으로 통합.
 * 의존 DS 컴포넌트: Text · IconButton(우상단 닫기 X · S03 공유 CircleIconButton)
 *   · StateView(CenteredErrorBody: 에러 아이콘+헤딩+설명 중앙 정렬)
 *   · EmptyBlob(ErrorIconBadge: danger-soft 원형 에러 일러스트)
 *   · Button(DualCTAStack: 다시 시도 primary + 취소 secondary 세로 스택)
 *   · AlertDialog(연속 5회 실패 시 24h 잠금 알림)  [@dei/ui]
 * 의존 데이터: 실패 사유(운영 로그용 분류 — 사용자에는 단일 메시지) /
 *   연속 실패 카운터·잠금 상태(S03 와 공유)
 * 발생 이벤트(PostHog): 없음
 * 서버 의존(L1): 실패 로그 기록(운영팀 세분화) / 재시도 시 PortOne 재호출 경로(S03 와 동일)
 * 정책 의존(L2): 연속 5회 → 24h 잠금 정책(S03 와 일관) /
 *   실패 횟수 비노출 보안 정책(잠금 임계값 추측 방지) /
 *   19세 미만 거부는 이 화면 아님(별도 alert + splash 강제 복귀)
 * 와이어프레임 참조: all-screens S03f
 *
 * B-01 Auth UI shell — 실패 안내와 재시도/취소 라우팅만 구현.
 * 실패 사유 기록, 연속 실패/24h 잠금 alert 는 후속 PR 범위다.
 */
export default function VerifyFailedScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="items-end px-5 py-3">
        <IconButton
          glyph={X}
          variant="filled-circle"
          size={36}
          accessibilityLabel="닫기"
          onPress={() => router.replace(ROUTES.terms)}
          testID="verify-failed-close"
        />
      </View>

      <StateView
        kind="error"
        icon="!"
        title="본인인증에 실패했어요"
        desc="인증 도중 취소되었거나 시간이 초과됐어요. 다시 시도해주세요."
        className="pb-24"
      />

      <View className="border-t border-line bg-bg px-6 pb-5 pt-3">
        <View className="gap-3">
          <Button
            fullWidth
            onPress={() => router.replace(ROUTES.verify)}
            testID="verify-failed-retry"
          >
            다시 시도
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onPress={() => router.replace(ROUTES.terms)}
            testID="verify-failed-cancel"
          >
            취소
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
