import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S14 — 멤버 프로필
 * ==================================================================
 * 담당자: C
 * 화면 목적: S13(방) 셀 아바타 탭 또는 S13b(영상 풀스크린) 멤버 칩 탭 → 진입.
 *           같은 방 멤버의 프로필 정보 + 차단·신고 진입점. PRD §7 '프로필 상세
 *           MVP 최소만'에 부합하는 단순 정보 카드.
 * 의존 DS 컴포넌트: TopNav(back ‹ + more ⋯ → S15 시트) · Avatar(120px 원형
 *   이니셜/사진) · Text(닉네임/나이·성별 메타) · Card(InfoRows key/value row +
 *   bg-2 BioCard) · BottomSheet(S15 차단·신고 단일 진입, dropdown 단계 생략)
 *   · AlertDialog(프로필 fetch 실패 재시도)  [@dei/ui]
 * 의존 데이터: profiles(member_id·닉네임·나이·성별·한줄소개·MBTI·지역 — S04 입력
 *   데이터) / room_members(자동 퇴장 여부 → '방을 나간 친구' 안내)
 * 발생 이벤트(PostHog): profile_overflow_menu_opened (lib/analytics-taxonomy)
 * 서버 의존(L1): 프로필 조회 쿼리(fetch 실패 시 alert+재시도) / 멤버 퇴장 상태
 *   조회(자동 퇴장 멤버 진입 차단·복귀)
 * 정책 의존(L2): PRD §7 프로필 상세 MVP 최소 정보(키·직업·관심사 제거) /
 *   차단·신고 무알림·조회기록 미저장(F22) / 선택 필드 빈 값 row 숨김
 * 와이어프레임 참조: all-screens S14
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(HeroAvatar·InfoRows·BioCard·S15 시트 진입)은 owner 가 채운다.
 */
export default function MemberProfileScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">멤버 프로필</Text>
        <Text variant="caption" className="text-center">
          핸드오프: C 구현 예정 · all-screens S14
        </Text>
      </View>
    </SafeAreaView>
  );
}
