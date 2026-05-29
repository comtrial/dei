import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S13b — 영상 풀스크린 재생
 * ==================================================================
 * 담당자: C
 * 화면 목적: S13 셀 본체 탭 → 진입. 한 멤버의 3초 영상을 풀스크린에서
 *           자세히 본다. 영상이 짧으므로 자동 루프 재생. 보고 닫고
 *           빠르게 다음으로.
 * 의존 DS 컴포넌트: FullscreenVideo(절대 inset 0 비디오 영역, 자동 루프)
 *   · ProgressBar(상단 3px 트랙 + white fill) · Chip + Avatar(우상단 멤버 칩,
 *   탭 = S14 프로필) · IconButton(좌상단 닫기 × · 일시정지 인디케이터)
 *   · Text(swipe 힌트 '‹ 다른 멤버 영상 ›') · StateView(영상 fetch 실패 +
 *   재시도)  [@dei/ui]
 * 의존 데이터: videos(member_id, room_id, video_url, recorded_at — 같은
 *   시간대 멤버 swipe 세트) · room_members(멤버 칩 닉네임/아바타/타임스탬프)
 *   · blocks(차단 멤버 영상 진입 차단)
 * 발생 이벤트(PostHog): 없음
 * 서버 의존(L1): 영상 스토리지 fetch(Supabase Storage signed URL — 실패 시
 *   재시도) · 같은 시간대 멤버 영상 목록 조회(swipe 셋)
 * 정책 의존(L2): 휘발성 정책(편집·다운로드·공유 X) · PRD §9 차단(차단 멤버
 *   영상 진입 불가) · S13 timestrip 시간대 ↔ 풀스크린 멤버 매핑
 * 와이어프레임 참조: all-screens S13b
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(풀스크린 루프 재생·좌우 swipe 멤버 전환·일시정지/숨김 Reels
 *    패턴·차단 진입 차단)은 owner 가 채운다.
 */
export default function VideoFullscreenScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">영상 풀스크린 재생</Text>
        <Text variant="caption" className="text-center">
          핸드오프: C 구현 예정 · all-screens S13b
        </Text>
      </View>
    </SafeAreaView>
  );
}
