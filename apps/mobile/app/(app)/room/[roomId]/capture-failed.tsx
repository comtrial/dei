import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S12 — 촬영 실패 차등 alert
 * ==================================================================
 * 담당자: C
 * 화면 목적: S11 촬영 중 발생하는 2종 실패 케이스(하드웨어 오류 / 업로드 실패)에
 *           대한 차등 alert 모음. 사용자가 막히지 않도록 다음 액션을 명시한다.
 *           권한 거부는 S11a로 분리되어 이 alert에 포함되지 않는다.
 * 의존 DS 컴포넌트: Text · AlertDialog(mini alert 카드 — 하드웨어 오류 danger /
 *   업로드 실패 info, 상단 컬러 보더로 심각도 구분) · Badge(eyebrow 카테고리 라벨) ·
 *   Button(2-CTA ButtonRow primary/secondary 균등 분할)  [@dei/ui]
 * 의존 데이터: 없음
 * 발생 이벤트(PostHog): S12:capture_failure_alert_shown
 * 서버 의존(L1): 없음
 * 정책 의존(L2): 로컬 영상 보관 기한 30일(자동 삭제 정책) ·
 *   백그라운드 자동 재시도 정책(네트워크 복구 트리거, 성공 시 무알림)
 * 와이어프레임 참조: all-screens S12
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(2종 차등 alert·2-CTA·다크 카메라 오버레이 톤)은 owner 가 채운다.
 */
export default function CaptureFailedScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">촬영 실패 차등 alert</Text>
        <Text variant="caption" className="text-center">
          핸드오프: C 구현 예정 · all-screens S12
        </Text>
      </View>
    </SafeAreaView>
  );
}
