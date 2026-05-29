import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S04 — 프로필 작성 (1/3) 기본 정보
 * ==================================================================
 * 담당자: B
 * 화면 목적: 본인인증 통과 직후 첫 진입. 멀티스텝 3단계 중 1단계 = 기본
 *           정보(닉네임). 성별·생년월일은 본인인증 결과로 자동 채워지고 lock.
 * 의존 DS 컴포넌트: Text(헤딩/서브카피/카운트/검사메시지) · ProgressBar(스텝 33%
 *   진행바, S04/S04b/S04c 공유) · Input(닉네임 입력 필드) · Spinner(검사 중 상태)
 *   · Input/Select(성별·생년월일 lock 필드 — locked 변형) · Badge(🔒 본인인증 자동
 *   인라인 잠금) · Button(BottomFixedCTA '다음 (2/3)', 검사 통과 시에만 활성)  [@dei/ui]
 * 의존 데이터: 본인인증 결과 성별·생년월일(S03 root of trust, lock) / 닉네임 중복
 *   조회(profiles.nickname unique, 0.5초 debounce) / 닉네임 blocklist(욕설 필터 +
 *   운영팀 수동) / 온보딩 진행 단계 저장(재진입 복원)
 * 발생 이벤트(PostHog): profile_step_completed(F24 멀티스텝 3단계 start) ·
 *   profile_photo_uploaded(F24, S04b 단계 alt)  (lib/analytics-taxonomy)
 * 서버 의존(L1): 닉네임 unique·blocklist 검사 엔드포인트(debounce 호출) /
 *   프로필 step1 저장(닉네임 + 본인인증 자동필드 commit) / 온보딩 단계 진행상태 저장
 * 정책 의존(L2): 닉네임 정책(한글·영문·숫자, 특수문자·이모지 금지, 1~10자) /
 *   닉네임 = 시스템 unique key(PRD §6 친구 초대 기반) / 닉네임 변경 30일 1회 throttle /
 *   성별·생년월일 변경 불가(본인인증 lock)
 * 와이어프레임 참조: all-screens S04
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(진행바·닉네임 입력+debounce 검사·lock 필드 2개·하단 고정 CTA)은
 *    owner 가 채운다.
 */
export default function ProfileStep1Screen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">프로필 작성 (1/3) 기본 정보</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S04
        </Text>
      </View>
    </SafeAreaView>
  );
}
