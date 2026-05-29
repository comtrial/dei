import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S04b — 프로필 작성 (2/3) 프로필 사진
 * ==================================================================
 * 담당자: B
 * 화면 목적: 멀티스텝 2단계 — 프로필 사진 1장 필수 + 한 줄 자기소개(선택).
 *           분할 피드 영상이 메인 자기소개라면, 프로필 사진은 멤버 프로필(S14)
 *           진입 시 보이는 카드 표지.
 * 의존 DS 컴포넌트: Text · IconButton(뒤로가기 ‹ 1/3) · ProgressBar(스텝 f2 · 66%)
 *   · PhotoUpload(140x180 빈/촬영 미리보기 · '다시 촬영' 칩) · Button(빈 상태 '📷 지금 촬영' · CTA '다음 3/3')
 *   · Textarea + 0/60 카운트(한 줄 자기소개 선택) · Banner/AlertDialog(가이드 카피 · 권한거부 inline alert · 업로드 실패 alert)
 *   · Spinner(업로드 진행 모달)  [@dei/ui]
 * 의존 데이터: 프로필 사진 업로드(Supabase storage 버킷 — 멤버 프로필 카드 표지) /
 *   한 줄 자기소개 텍스트(profiles 컬럼 · 부적절 필터) / 카메라 권한 상태 /
 *   프로필 step2 저장(사진 URL + bio)
 * 발생 이벤트(PostHog): S2:profile_photo_uploaded (F24 · 프로필 멀티스텝 3단계 · 사진 업로드 트리거)
 * 서버 의존(L1): 사진 storage 업로드 + URL 발급(진행 모달/실패 alert) /
 *   자기소개 부적절 필터(자동) 검사 / S11 카메라 모듈(사진 모드) 연동 — 촬영본 반환
 * 정책 의존(L2): 현장 카메라 촬영만·갤러리 금지(dei 정체성) / 사진 1장 필수·다중 슬롯 제외 /
 *   사진 검수 = 신고 시 사람 검토(등록 자동검수 제외 · PRD §14) /
 *   카메라 권한 거부 = inline alert + 설정 deep link
 * 와이어프레임 참조: all-screens S04b
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(PhotoUpload·카메라 연동·자기소개 입력·CTA 동작)은 owner 가 채운다.
 */
export default function ProfilePhotoStepScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">프로필 사진 (2/3)</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S04b
        </Text>
      </View>
    </SafeAreaView>
  );
}
