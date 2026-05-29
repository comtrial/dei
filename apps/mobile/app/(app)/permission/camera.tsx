import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S11a — 카메라 권한 필요 안내
 * ==================================================================
 * 담당자: C
 * 화면 목적: 3초 영상 촬영 진입 시 카메라 권한 거부 상태로 차단된 사용자에게
 *           표시. dei의 모든 영상 업로드가 카메라에 의존하므로 권한 없으면
 *           핵심 기능 불가. (S07a 알림 권한과 동일 패턴 — 권한 거부 안내는
 *           항상 별도 화면)
 * 의존 DS 컴포넌트: PermissionGate(S07a 동일 레이아웃 재사용) · Text(헤딩/설명
 *   센터 위계) · IconButton(우상단 원형 닫기 × · 원형 카메라 아이콘 배지)
 *   · Card('왜 필요한가요?' info 박스 bg-2 좌측정렬 불릿) · Button(세로 2-CTA:
 *   primary '설정에서 카메라 켜기' / secondary '나중에 하기')  [@dei/ui]
 * 의존 데이터: 없음 (OS 권한 상태만 — 스키마 테이블 의존 없음)
 * 발생 이벤트(PostHog): 없음
 * 서버 의존(L1): 없음
 * 정책 의존(L2): 카메라 권한 거부는 항상 별도 화면(S07a 동일 패턴) /
 *   재진입 시 매번 안내(쿨다운 없음) / 마이크 권한 별도(음성 기본 off,
 *   켤 때만 OS 다이얼로그) / 설정 deep link 복귀 시 S11 자동 진행
 * 와이어프레임 참조: all-screens S11a
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(PermissionGate 레이아웃·info 박스·설정 deep link·2-CTA 동작)은
 *    owner 가 채운다.
 */
export default function CameraPermissionScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">카메라 권한 필요 안내</Text>
        <Text variant="caption" className="text-center">
          핸드오프: C 구현 예정 · all-screens S11a
        </Text>
      </View>
    </SafeAreaView>
  );
}
