import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S06 — 친구 초대 (팀 구성)
 * ==================================================================
 * 담당자: B
 * 화면 목적: S05 "친구와 함께" CTA에서 진입. 초대자가 친구 닉네임을 검색·추가해
 *           매칭 묶음(과팅 팀)을 구성. 모든 멤버가 사용 가능한(non-busy) 상태일
 *           때만 큐 등록 가능. 본인 포함 최대 5명(8셀 분할 피드 상한과 정합:
 *           우리 5 + 상대 3 = 8).
 * 의존 DS 컴포넌트: TopNav(back + title + count pill) · Badge(CountPill) ·
 *   Input(닉네임 검색, leading icon) · IconButton(검색 leading) · Card(검색 결과) ·
 *   Avatar(검색카드/멤버칩 이니셜) · Button(+ 추가) · Chip(MemberChip me/busy/add 변형) ·
 *   EmptyBlob(검색 빈 상태) · Banner(busy 안내 바 / 초대 불가 안내) ·
 *   Text(SectionLabel) · BottomActionBar + Button(N명으로 매칭 시작) ·
 *   AlertDialog(검색 실패 / 큐 등록 실패)  [@dei/ui]
 * 의존 데이터: users/profiles(닉네임 unique key, 프로필 사진) · blocks(차단 양방향) ·
 *   room_members/conversations(busy = 활성 방 보유 여부) · match_queue(팀 묶음 등록)
 * 발생 이벤트(PostHog): join_team_selected · team_queue_registered
 * 서버 의존(L1): 닉네임 검색 RPC/쿼리(debounce 0.5s) · 차단 관계 조회(보복 보호 —
 *   사유 비노출) · 팀 큐 등록 RPC(큐 등록 직전 멤버 busy 재검증)
 * 정책 의존(L2): 최대 5명 상한(8셀 분할 피드 = 우리5+상대3) /
 *   busy 판정 = 멤버가 다른 활성 방에 있는지(room membership) / 닉네임 unique 제약
 * 와이어프레임 참조: all-screens S06
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(닉네임 검색·멤버 칩 묶음·busy 게이트·매칭 시작 CTA)은 owner 가 채운다.
 */
export default function TeamNewScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">친구 초대 (팀 구성)</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S06
        </Text>
      </View>
    </SafeAreaView>
  );
}
