import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S04c — 프로필 작성 (3/3) 신상 정보
 * ==================================================================
 * 담당자: B
 * 화면 목적: 멀티스텝 마지막 단계 — MBTI · 지역 입력. 분할 피드 영상 +
 *           사진과 함께 멤버 프로필(S14)에서 노출.
 * 의존 DS 컴포넌트: Text · IconButton(뒤로가기 BackButton) ·
 *   ProgressBar(스텝 f3 full) · Select(MBTI/지역, placeholder·chevron 미입력 변형) ·
 *   Button(BottomFixedCTA 'dei 시작하기' 항상 활성) ·
 *   AlertDialog(가입 완료 트랜잭션 실패 조건부)  [@dei/ui]
 * 의존 데이터: MBTI 값(profiles 컬럼, 표시 전용) / 지역 값(시·도 단위, S02
 *   위치 동의 시 GPS 자동·미동의/실패 시 직접 선택) / 위치정보 동의 플래그
 *   (S02 consents 연동) / 가입 완료 트랜잭션(프로필 commit + 계정 활성화)
 * 발생 이벤트(PostHog): 없음
 * 서버 의존(L1): 가입 완료 트랜잭션 엔드포인트(원자적 commit, 실패 시
 *   재시도·데이터 유지) / 지역 GPS 역지오코딩(자동 채움, 실패 시 직접 선택
 *   fallback) / MBTI·지역 부분 저장
 * 정책 의존(L2): 모든 신상 필드 선택(빈칸 허용)·CTA 항상 활성 / 지역 입도
 *   = 시·도만 / 지역 자동채움 = S02 위치정보 동의 연동 / 지역 매칭 활용
 *   방식(서버 알고리즘, PRD §7 보류)
 * 와이어프레임 참조: all-screens S04c
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(MBTI·지역 Select·progress f3·CTA 트랜잭션)은 owner 가 채운다.
 */
export default function ProfileStep3Screen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">프로필 작성 (3/3) 신상 정보</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S04c
        </Text>
      </View>
    </SafeAreaView>
  );
}
