import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S19 — 본인 프로필 수정 (허브)
 * ==================================================================
 * 담당자: B
 * 화면 목적: S05 우상단 아바타 탭 → 진입. 본인 정보 수정 + 잔여 패스·환불·설정·
 *           계정 관리 모든 진입점이 모이는 허브 화면. PRD 미명시(묶음 6 신규).
 *           묶음 6 모든 진입점의 hub(잔여 패스·환불·고객센터·탈퇴·알림·약관).
 * 의존 DS 컴포넌트: TopNav(뒤로가기 + '내 프로필' 타이틀 + 저장 우측 액션) ·
 *   ProfileHero(90px 아바타 + edit ✎ 배지) · SettingsRow(프로필/설정 row,
 *   locked·danger 변형 + SectionGroup 그룹핑) · Card(잔여 바로 매치 PassCard) ·
 *   Button/Chip('더 사기'·'지금 시작' cta-mini 알약) · Text  [@dei/ui]
 * 의존 데이터: profiles(닉네임/자기소개/MBTI/지역/성별/생년월일/아바타 — 본인 row
 *   UPDATE) / 닉네임 변경 throttle 메타(nickname_changed_at 등 — 30일 제한 계산) /
 *   잔여 바로 매치 패스 잔량(passes/entitlements 류, 테이블명 HTML 미명시)
 * 발생 이벤트(PostHog): S19:profile_hub_opened · S19:nickname_change_throttled_30d
 * 서버 의존(L1): 프로필 UPDATE RPC/엔드포인트(HTML 미명시) / 닉네임 30일 throttle
 *   서버 검증(HTML 미명시) / 잔여 패스 조회(HTML 미명시)
 * 정책 의존(L2): 닉네임 30일 1회 변경 제한 / lock 필드(성별·생년월일·본인인증
 *   변경 불가) / 잔여 패스 0회 시 CTA 분기('지금 시작' vs '더 사기')
 * 와이어프레임 참조: all-screens S19
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(3섹션·잔여 패스 카드·lock row·저장 토글)은 owner 가 채운다.
 */
export default function MyProfileScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">내 프로필</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S19
        </Text>
      </View>
    </SafeAreaView>
  );
}
