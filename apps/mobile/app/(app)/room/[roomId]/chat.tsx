import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { analytics } from '@dei/shared';

import { supabase } from '@/lib/supabase';
import { useRoomChat } from '@/hooks/useRoomChat';
import { RoomChatView } from '@/components/chat/RoomChatView';
import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { isNearBottom } from '@/lib/chat/scroll';
import type { RoomMemberLite } from '@/lib/chat/mention';

/**
 * S13a — 방 내부 채팅 시트 (route 배선).
 * ==================================================================
 * 화면 목적: S13 헤더 채팅 아이콘 → 진입. PRD §3 핵심 메커니즘인
 *           '전체 채팅 + @멘션 귓속말'이 작동하는 단일 화면.
 *
 * 이 파일은 supabase(인증·멤버 조회) + useRoomChat(스트림·송신·구독) +
 * analytics(room_chat_opened / whisper_mention_sent)를 배선해 순수 view
 * `RoomChatView`에 props 로 주입한다. 시각 요소는 전부 @dei/ui DS — raw 스타일 0.
 *
 * realtime 자동스크롤/새 메시지 badge: 스트림이 하단 근처(isNearBottom)면 새
 * 메시지가 와도 inverted FlatList 가 자동으로 최신을 보여주므로 badge 0. 위로
 * 스크롤된 상태에서 메시지가 늘면 newCount 를 증가시켜 '↓ N개 새 메시지' pill 노출,
 * 점프 시 0 으로 리셋(view 가 하단으로 스크롤).
 */
export default function RoomChatScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const [selfId, setSelfId] = useState('');
  const [members, setMembers] = useState<RoomMemberLite[]>([]);
  const [roomName, setRoomName] = useState('');
  const [input, setInput] = useState('');
  const [whisperTarget, setWhisperTarget] =
    useState<{ userId: string; name: string; avatarInitial?: string } | null>(null);

  const { messages, send, retry } = useRoomChat({ roomId: roomId ?? '', selfId });

  // 자동스크롤 vs 새 메시지 badge: 하단 근처면 newCount 0(자동 추종), 위로 올라가
  // 있으면 늘어난 메시지 수만큼 newCount 증가. nearBottom 은 onScroll 로 갱신.
  const [newCount, setNewCount] = useState(0);
  const nearBottomRef = useRef(true);
  const prevCountRef = useRef(0);

  useEffect(() => {
    const grew = messages.length - prevCountRef.current;
    prevCountRef.current = messages.length;
    if (grew > 0 && !nearBottomRef.current) {
      setNewCount((n) => n + grew);
    }
  }, [messages.length]);

  const onScroll = useCallback((offsetY: number) => {
    const near = isNearBottom(offsetY);
    nearBottomRef.current = near;
    if (near) setNewCount(0);
  }, []);

  const onJump = useCallback(() => {
    nearBottomRef.current = true;
    setNewCount(0);
  }, []);

  useEffect(() => {
    if (!roomId) return;
    let alive = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (alive && auth.user) setSelfId(auth.user.id);

      // 멤버 목록 — room_member 에는 profile FK 임베드가 없어(생성 타입 Relationships 비어 있음)
      // 두 쿼리로 분리: room_member 조회 → user_id 로 profile(nickname) 조회 후 클라에서 결합.
      const { data: roomMembers } = await supabase
        .from('room_member')
        .select('user_id, status')
        .eq('room_id', roomId);
      const userIds = (roomMembers ?? []).map((r) => r.user_id);
      const { data: profiles } = userIds.length
        ? await supabase.from('profile').select('user_id, nickname').in('user_id', userIds)
        : { data: [] as { user_id: string; nickname: string | null }[] };
      const nameByUser = new Map(
        (profiles ?? []).map((p) => [p.user_id, p.nickname ?? '익명']),
      );
      if (alive) {
        setMembers(
          (roomMembers ?? []).map((r) => {
            const name = nameByUser.get(r.user_id) ?? '익명';
            return {
              userId: r.user_id,
              status: (r.status as RoomMemberLite['status']) ?? 'active',
              name,
              avatarInitial: name[0],
            };
          }),
        );
      }

      // 방 이름(있으면). 실패해도 무방 — 기본 라벨로 폴백.
      const { data: room } = await supabase
        .from('room')
        .select('id')
        .eq('id', roomId)
        .maybeSingle();
      if (alive && room) setRoomName('');
    })();

    analytics.capture(ANALYTICS_EVENTS.room_chat_opened, { room_id: roomId });
    return () => {
      alive = false;
    };
  }, [roomId]);

  const onSend = () => {
    if (!roomId) return;
    const target = whisperTarget;
    void send(input, target?.userId ?? null).then(() => {
      if (target) analytics.capture(ANALYTICS_EVENTS.whisper_mention_sent, { room_id: roomId });
    });
    setInput('');
    setWhisperTarget(null);
  };

  const onSelectMention = (m: RoomMemberLite) => {
    // @쿼리 토큰을 입력에서 제거하고 귓속말 대상 확정.
    setInput((prev) => prev.replace(/(?:^|\s)@\S*$/, '').trimEnd());
    setWhisperTarget({ userId: m.userId, name: m.name, avatarInitial: m.avatarInitial });
  };

  return (
    <RoomChatView
      roomName={roomName || '방'}
      memberCount={members.filter((m) => m.status === 'active').length}
      selfId={selfId}
      messages={messages}
      members={members}
      input={input}
      whisperTarget={whisperTarget}
      onChangeInput={setInput}
      onSend={onSend}
      onRetry={retry}
      onSelectMention={onSelectMention}
      onClearWhisper={() => setWhisperTarget(null)}
      onAvatarPress={(userId) => router.push(`/room/${roomId}/members?focus=${userId}`)}
      onClose={() => router.back()}
      newCount={newCount}
      onJump={onJump}
      onScroll={onScroll}
      visible
    />
  );
}
