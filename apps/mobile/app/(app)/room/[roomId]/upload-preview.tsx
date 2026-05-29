import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S11b — 촬영 미리보기
 * ==================================================================
 * 담당자: C
 * 화면 목적: 방금 촬영한 3초 영상을 업로드 전 확인하는 단계. 잘못 올리기
 *           방지 + 재촬영 1번 더 기회. BeReal/Locket 패턴.
 * 의존 DS 컴포넌트: Text · FullscreenVideo(자동 루프 영상 미리보기) ·
 *   IconButton(좌상단 원형 닫기 ×) · Badge(녹화 길이 배지 '2.3초', 상단중앙) ·
 *   Button(secondary '다시 찍기' / primary '올리기' 비대칭 2-CTA) ·
 *   BottomActionBar(나란히 2-CTA 바) · AlertDialog(영상 폐기 confirm) ·
 *   ProgressBar(업로드 진행) · Spinner(업로드 오버레이)  [@dei/ui]
 * 의존 데이터: 없음 (촬영 직후 로컬 영상 핸들 — 스키마 테이블 의존 없음)
 * 발생 이벤트(PostHog): 없음
 * 서버 의존(L1): 영상 업로드 (올리기 CTA → 업로드, 실패 시 S12)
 * 정책 의존(L2): 편집 기능 MVP 제외(자르기·필터·텍스트 X — 날것 정신) /
 *   닫기 시 영상 폐기 confirm 강제 / 업로드 진행 중 UI disable
 * 와이어프레임 참조: all-screens S11b
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(자동 루프 영상·길이 배지·2-CTA·폐기 confirm·업로드 progress)은
 *    owner 가 채운다.
 */
export default function UploadPreviewScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">촬영 미리보기</Text>
        <Text variant="caption" className="text-center">
          핸드오프: C 구현 예정 · all-screens S11b
        </Text>
      </View>
    </SafeAreaView>
  );
}
