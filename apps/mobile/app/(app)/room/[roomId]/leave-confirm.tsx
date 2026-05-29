import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@dei/ui';

/**
 * S16 — 방 나가기 모달
 * ==================================================================
 * 담당자: B
 * 화면 목적: S13 방 헤더 ⋯ 메뉴에서 진입하는, 방 안 유일한 이탈 동선.
 *   비가역 액션 + PRD §13 24h 재매칭 제한 + 운영팀 사유 수집.
 *   '충동 이탈 방지'가 디자인의 핵심. 슬라이드업 시트(방 그리드 뒤 흐림).
 *   이탈 후 → S05(홈 + 24h 제한 상태). 마지막 1명 이탈 시점에만 방 자동 종료.
 * 의존 DS 컴포넌트: BottomSheet(방 그리드 뒤 흐림 슬라이드업 시트) ·
 *   SheetHandle(핸들) · Text(헤딩/서브카피) · Banner(24h 제한·방 영구
 *   소멸 danger 안내 박스) · Radio(이탈 사유 4개: 분위기·실수·불쾌한
 *   멤버·기타) · Textarea('기타' 사유 자유 입력) · SlideToConfirm
 *   ('밀어서 방 나가기' 비가역 confirm) · StateView('불쾌한 멤버' 선택 시
 *   차단·신고 안내) · AlertDialog(이탈 트랜잭션 실패 재시도)  [@dei/ui]
 * 의존 데이터: 현재 방/멤버십 상태(본인 이탈 vs 마지막 1명 판정) /
 *   leave_reason 적재 테이블(4개 사유 + 기타 텍스트) / rematch_restriction
 *   24h 제한 상태(사용자별) / 부스터·패스 잔여(24h 면제권 안내 연계)
 * 발생 이벤트(PostHog): leave_room_menu_opened · leave_cancelled ·
 *   rematch_restriction_evaluated · room_closed_last_member_left
 * 서버 의존(L1): 방 이탈 트랜잭션(Edge/RPC, 본인 이탈 처리·실패 시
 *   alert+재시도, 마지막 1명 이탈 시 방 자동 종료 + 영상·채팅 영구 소멸) /
 *   이탈 사유 적재(4개 사유 + 기타 자유 입력) / 24h 재매칭 제한 상태 기록(L2)
 * 정책 의존(L2): 24h 재매칭 제한(PRD §13, 즉시 재매칭은 부스터 필요) /
 *   방 휘발·영구 소멸(마지막 멤버 이탈 시 영상·채팅 즉시 폭파) /
 *   과팅 묶음 = 매칭 시점만 묶음, 방 안에서는 개별 멤버 이탈(PRD §6 v0.8) /
 *   비가역 이탈 + 슬라이드 confirm 유지(충동 이탈 방지)
 * 와이어프레임 참조: all-screens S16
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(슬라이드업 시트·danger 안내·사유 라디오·SlideToConfirm·
 *    실패 재시도)은 owner 가 채운다.
 */
export default function RoomLeaveConfirmScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">방 나가기 모달</Text>
        <Text variant="caption" className="text-center">
          핸드오프: B 구현 예정 · all-screens S16
        </Text>
      </View>
    </SafeAreaView>
  );
}
