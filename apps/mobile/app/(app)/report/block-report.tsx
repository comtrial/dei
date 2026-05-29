import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S15 — 차단·신고 시트
 * ==================================================================
 * 담당자: B
 * 화면 목적: S14 멤버 프로필의 ⋯ 메뉴에서 단일 진입하는 차단·신고 바텀시트.
 *           PRD §9 '차단·신고는 법적 필수, 즉시·완전·접근 용이' 충족. 보복 위험
 *           차단을 위한 무알림 정책(상대 알림 X, 조회 기록 미저장)이 핵심 안전장치.
 *           HTML 라인 2668-2749.
 * 의존 DS 컴포넌트: BottomSheet(반투명 dim + paper 패널) · SheetHandle(공통 핸들)
 *   · Avatar + Text(대상 멤버 헤더 row) · SettingsRow(신고하기 액션 row, chevron)
 *   · IconButton(액션 아이콘 칩) · Button(차단하기 destructive · 취소 풀폭)
 *   · Banner(무알림 정책 안내 박스) · AlertDialog(차단 confirm · '신고도 함께'
 *   prompt) · StateView(차단 완료 '차단했어요' 피드백)  [@dei/ui]
 * 의존 데이터: 차단 대상 멤버 프로필(아바타·닉네임) / block 테이블(양방향 숨김,
 *   영구) / report 테이블·운영 검토 큐(카테고리 + 기타 자유 입력)
 * 발생 이벤트(PostHog): S7:profile_overflow_menu_opened(시트 진입) ·
 *   S21:report_category_entered('신고하기' → S21) · S21:report_submitted
 * 서버 의존(L1): 차단 RPC/Edge(소프트 양방향 숨김, 영구·해제 불가) /
 *   신고 적재(운영팀 검토 큐) / 무알림 보장(상대 push·알림 발송 금지, 조회 기록 미저장)
 * 정책 의존(L2): L3 자동 퇴장 임계값(한 방 절반 이상이 한 멤버 차단·신고 시 자동
 *   퇴장, 시트 외부 운영 로직) / 무알림 정책(보복 위험 차단) / 차단 영구·해제 불가
 * 와이어프레임 참조: all-screens S15
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(액션 row 2개·차단 confirm·'신고도 함께' prompt·무알림 안내·토스트)은
 *    owner 가 채운다.
 */
export default function BlockReportScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">차단·신고 시트</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S15
        </Text>
      </View>
    </SafeAreaView>
  );
}
