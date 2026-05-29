import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import { Text } from '@dei/ui';

/**
 * S13a — 방 내부 채팅 시트
 * ==================================================================
 * 담당자: A
 * 화면 목적: S13 헤더 채팅 아이콘 → 진입. PRD §3 핵심 메커니즘인
 *           '전체 채팅 + @멘션 귓속말'이 작동하는 단일 화면.
 *           별도 DM 페이지 없음, 방 안에서만 작동.
 * 의존 DS 컴포넌트: SheetHandle(슬라이드 핸들) · TopNav(헤더: 방 이름·멤버 수·닫기)
 *   · ChatBubble(전체 채팅 좌/우 + 귓속말 변형 + @멘션 토큰 + 전송 실패 ! 표시)
 *   · Avatar(28px 이니셜, 탭 = S14) · Badge(↓ N개 새 메시지) · InputBar(pill 입력 + 보내기)
 *   · Select(@ 자동완성 드롭다운, 차단 멤버 제외)  [@dei/ui]
 * 의존 데이터: messages(room_id·sender_id·body·mention_target_id·created_at·send_status)
 *   · room_members(닉네임/아바타/차단 여부 — @자동완성 후보 + 차단 필터)
 *   · blocks(양방향 메시지 숨김 + 자동완성 제외)
 * 발생 이벤트(PostHog): room_chat_opened · whisper_mention_sent
 * 서버 의존(L1): send-message Edge Function(앱 실제 전송 경로 — RPC 폴백) ·
 *   messages realtime 구독(신규 메시지 자동 스크롤/badge) ·
 *   mention 푸시 알림(멘션만 푸시, 전체 채팅 푸시 X)
 * 정책 의존(L2): PRD §3 전체 채팅 + @멘션 귓속말 · PRD §9 소프트 차단(양방향 숨김) ·
 *   PRD §11-4 푸시 정책(멘션만 푸시) · 방 종료 시 메시지 영구 소멸(휘발 정책)
 * 와이어프레임 참조: all-screens S13a
 *
 * ⚠️ 핸드오프 스캐폴딩 — 최소 렌더만. raw 스타일 0(@dei/ui + NativeWind 토큰만).
 *    실제 구현(슬라이드업 시트·전체/귓속말 말풍선·@자동완성·realtime)은 owner 가 채운다.
 */
export default function RoomChatScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text variant="h1">방 내부 채팅 시트</Text>
        <Text variant="caption" className="text-center text-ink-3">
          roomId: {roomId ?? '—'}
        </Text>
        <Text variant="caption" className="text-center">
          핸드오프: A 구현 예정 · all-screens S13a
        </Text>
      </View>
    </SafeAreaView>
  );
}
