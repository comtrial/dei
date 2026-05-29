import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S11 — 3초 영상 촬영
 * ==================================================================
 * 담당자: C
 * 화면 목적: PRD §4 핵심 메커니즘 — 최대 3초 일상 영상 촬영. S10 blur(촬영 진입) /
 *           S14 방(셀 탭) / 시간별 푸시 알림 모두 이 화면으로 들어옴. dei 의 가장
 *           자주 쓰는 화면.
 * 의존 DS 컴포넌트: StateView(Fullscreen Viewfinder 플레이스홀더) · IconButton(닫기 ×/
 *   카메라 flip — Floating overlay 컨트롤 바) · ProgressBar(녹화 3초 세그먼트 인디케이터)
 *   · PulseRing(셔터 버튼 88px 흰 원 + accent) · Toggle(음성 마이크 on/off pill)
 *   · Text(셔터 힌트·오버레이 캡션)  [@dei/ui]
 * 의존 데이터: 없음 (촬영 결과는 S11b 미리보기 거쳐 업로드)
 * 발생 이벤트(PostHog): S11:video_capture_entered · S12:capture_failure_alert_shown
 * 서버 의존(L1): 영상 업로드 (촬영 결과 → S11b 거쳐 업로드)
 * 정책 의존(L2): 녹화 최대 3초 / 최소 길이 제한 없음 · 데드라인 배지 제거(PRD §8) ·
 *   음성 무음 기본(마이크 권한 거부 시 무음 fallback) · 갤러리 X · 현장 카메라만
 * 와이어프레임 참조: all-screens S11
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(viewfinder·셔터·3초 progress·flip·mic toggle·권한 분기 S11a/S12)은
 *    owner 가 채운다.
 */
export default function VideoCaptureScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">3초 영상 촬영</Text>
        <Text variant="caption" className="text-center">
          핸드오프: C 구현 예정 · all-screens S11
        </Text>
      </View>
    </SafeAreaView>
  );
}
