import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S21 — 신고 사유 카테고리
 * ==================================================================
 * 담당자: B
 * 화면 목적: S15 차단·신고 시트의 '신고하기' → 진입. PRD §9 '카테고리 + 기타
 *           자유 입력'. 운영팀 검토 큐로 적재. 6 카테고리 + 기타 자유 입력 +
 *           함께 차단 옵션. 무알림.
 * 의존 DS 컴포넌트: Text · TopNav(뒤로가기 + '신고하기') · Avatar(대상 멤버 이니셜)
 *   · Chip(TargetMemberChip — bg-2 박스 + 닉네임) · Radio(카테고리 6개)
 *   · ChoiceList(RadioCategoryList) · Textarea(ConditionalTextarea — '기타' 조건부)
 *   · Checkbox('함께 차단하기') · Banner(InfoNote — 무알림 안내)
 *   · BottomActionBar(BottomCtaBar — '신고 제출')  [@dei/ui]
 * 의존 데이터: 신고 대상 멤버(아바타·닉네임 — 진입 시 target 전달) /
 *   reports 적재(카테고리 + 기타 텍스트 + 신고자/대상 → 운영팀 검토 큐) /
 *   blocks(함께 차단 옵션 선택 시) (테이블명 HTML 미명시)
 * 발생 이벤트(PostHog): S21:report_category_entered · S21:report_submitted
 *   (lib/analytics-taxonomy)
 * 서버 의존(L1): 신고 제출 엔드포인트 → 운영팀 검토 큐 적재 / 차단 처리(함께
 *   차단 선택 시) (HTML 미명시)
 * 정책 의존(L2): 신고 카테고리 6종 enum(PRD §9) / 무알림 정책(상대에게 알림·
 *   조회 기록 미노출 — S15 일관) / 신고 제출 후 차단 동반 옵션 정책
 * 와이어프레임 참조: all-screens S21
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(카테고리 라디오·조건부 textarea·함께 차단·CTA 동작)은 owner 가 채운다.
 */
export default function ReportCategoryScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">신고하기</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S21
        </Text>
      </View>
    </SafeAreaView>
  );
}
