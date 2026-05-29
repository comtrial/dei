import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S10 — blur 미리보기 (매칭 후 첫 진입)
 * ==================================================================
 * 담당자: C
 * 화면 목적: 매칭 성사 푸시 → splash → 이 화면으로 직행. 매칭 ceremony(환영
 *           카피) + 블러 게이트(눈팅 방지) + 첫 영상 유도를 한 화면에 통합.
 *           이 화면 = '바뀐 홈'(매칭 후 홈 = 방, ③a 블러 모드). 영상 올리면
 *           S14 언블러 모드(③b)로 전환.
 * 의존 DS 컴포넌트: Text · TopNav(방 식별/'잠긴 방 미리보기')
 *   · BrandTransitionFrame(매칭 ceremony 환영 헤딩) · GridRoom(2열 멤버 블러
 *   미리보기 그리드, 9/16 카드) · Badge(Lock pill 잠금 라벨 / NicknameChip 닉네임)
 *   · Button(촬영 CTA '내 영상 올리고 잠금해제') · BottomActionBar(메인 액션 영역)
 *   · AlertDialog(메타 fetch 실패 재시도)  [@dei/ui]
 * 의존 데이터: 방 식별·방 이름 / N명 닉네임 목록 / 멤버 일상 영상 썸네일(블러
 *   미리보기 소스) / 내 영상 24h 존재 여부(블러·언블러 게이트 판정)
 *   (스키마 conversations·room, match_members·room_members)
 * 발생 이벤트(PostHog): room_entered_blurred · room_preview_entered_blurred ·
 *   blur_reapplied_24h_passed (lib/analytics-taxonomy)
 * 서버 의존(L1): 멤버 메타 fetch (실패 시 alert + 재시도, 캐시 닉네임 fallback)
 * 정책 의존(L2): blur 게이트 24h 단일 규칙(PRD §8 — 내 영상 24h 내 존재해야
 *   남의 영상 노출) / 데드라인 타이머 없음 정책(PRD §8)
 * 와이어프레임 참조: all-screens S10
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(블러 게이트·2열 멤버 그리드·환영 ceremony·촬영 CTA)은 owner 가 채운다.
 */
export default function RoomPreviewScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">blur 미리보기 (매칭 후 첫 진입)</Text>
        <Text variant="caption" className="text-center">
          핸드오프: C 구현 예정 · all-screens S10
        </Text>
      </View>
    </SafeAreaView>
  );
}
