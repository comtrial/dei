import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S05 — 홈 (매칭 전 · CTA)
 * ==================================================================
 * 담당자: B
 * 화면 목적: 홈 3-state 중 ① 매칭 전. 참여 방식(혼자/친구와)을 선택해 매칭
 *           큐로 진입. 방·큐 없는 사용자만 보는 화면(splash 라우팅과 정합).
 * 의존 DS 컴포넌트: Text · IconButton(로고/아바타) · Avatar · Badge(미완성 dot)
 *   · Card(EntryCard cta-entry: 혼자/친구 동등 위계) · Banner(24h 재매칭 제한 카운트다운)
 *   · Chip(cta-mini '바로 매치') · AlertDialog(큐 등록 실패)  [@dei/ui]
 * 의존 데이터: 방·큐 존재 여부 / 프로필 완성(사진 2/3) / 24h 재매칭 제한 +
 *   카운트다운 / 성별(24h 면제) / 내 아바타·닉네임(스키마 #1 profile, #5 match_queue, #8 room)
 * 발생 이벤트(PostHog): home_entered_waiting · join_team_selected ·
 *   team_queue_registered · rematch_restriction_evaluated  (lib/analytics-taxonomy)
 * 서버 의존(L1): 매칭 큐 등록 RPC / 재매칭 제한(L2) 평가 / 친구 초대 닉네임 조회 /
 *   푸시 권한 등록
 * 정책 의존(L2): 혼자·친구 동등 위계(추천 라벨 금지) / 24h 재매칭 제한(방 이탈만) /
 *   성별 면제(여성 자동/남성 결제) / 방·큐 보유자 미진입(splash 직행) /
 *   푸시 권한 요청 타이밍(CTA 직후)
 * 와이어프레임 참조: all-screens S05
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(EntryCard 2개·재매칭 배너·CTA 동작)은 owner 가 채운다.
 */
export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">홈 (매칭 전)</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S05
        </Text>
      </View>
    </SafeAreaView>
  );
}
