import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { analytics } from '@dei/shared';

import { supabase } from '@/lib/supabase';
import { subscribeRoomStatus } from '@/lib/realtime';
import { useRoomChat } from '@/hooks/useRoomChat';
import { RoomChatView } from '@/components/chat/RoomChatView';
import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { countNewMessages, isNearBottom } from '@/lib/chat/scroll';
import { parseMentionQuery, resolveTailMention, type RoomMemberLite } from '@/lib/chat/mention';

/** 방이 종료/삭제됐는지(읽기전용 전환 신호). status active 가 아니거나 ended_at 존재. */
function isRoomEnded(row: { status?: string | null; ended_at?: string | null } | null): boolean {
  if (!row) return false;
  return (row.status != null && row.status !== 'active') || row.ended_at != null;
}

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
    useState<{ userId: string; name: string; avatarInitial?: string; photoUrl?: string } | null>(
      null,
    );
  const [roomEnded, setRoomEnded] = useState(false);
  // 차단 목록(block 기능 도입 시 여기로 주입). 현재는 빈 집합 — 멘션 후보/귓속말
  // 대상 게이트가 일관 동작하도록 contract 만 유지(filterCandidates·resolveTailMention).
  const blockedIds = useMemo(() => new Set<string>(), []);

  const { messages, send, retry } = useRoomChat({ roomId: roomId ?? '', selfId });

  // 자동스크롤 vs 새 메시지 badge: 하단 근처면 newCount 0(자동 추종), 위로 올라가
  // 있으면 '남이 보낸' 새 메시지 수만큼 newCount 증가. nearBottom 은 onScroll 로 갱신.
  const [newCount, setNewCount] = useState(0);
  const nearBottomRef = useRef(true);
  const prevMessagesRef = useRef<typeof messages>([]);

  useEffect(() => {
    // concurrency-misc-12: 내가 보낸 낙관 메시지는 pill 에서 제외(id 기준 신규만 카운트).
    const added = countNewMessages(prevMessagesRef.current, messages, selfId);
    prevMessagesRef.current = messages;
    if (added > 0 && !nearBottomRef.current) {
      setNewCount((n) => n + added);
    }
  }, [messages, selfId]);

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
        ? await supabase
            .from('profile')
            .select('user_id, nickname, photo_url')
            .in('user_id', userIds)
        : { data: [] as { user_id: string; nickname: string | null; photo_url: string | null }[] };
      // user_id → { name, photoUrl } 결합용 맵.
      const profileByUser = new Map(
        (profiles ?? []).map((p) => [
          p.user_id,
          { name: p.nickname ?? '익명', photoUrl: p.photo_url ?? undefined },
        ]),
      );
      if (alive) {
        setMembers(
          (roomMembers ?? []).map((r) => {
            const prof = profileByUser.get(r.user_id);
            const name = prof?.name ?? '익명';
            return {
              userId: r.user_id,
              status: (r.status as RoomMemberLite['status']) ?? 'active',
              name,
              avatarInitial: name[0],
              photoUrl: prof?.photoUrl,
            };
          }),
        );
      }

      // 방 이름/상태(있으면). 실패해도 무방 — 기본 라벨/active 로 폴백.
      const { data: room } = await supabase
        .from('room')
        .select('id, status, ended_at')
        .eq('id', roomId)
        .maybeSingle();
      if (alive && room) {
        setRoomName('');
        // concurrency-misc-9: 진입 시점 종료 여부(읽기전용). 이후 변화는 구독으로 갱신.
        setRoomEnded(isRoomEnded(room));
      }
    })();

    analytics.capture(ANALYTICS_EVENTS.room_chat_opened, { room_id: roomId });
    return () => {
      alive = false;
    };
  }, [roomId]);

  // concurrency-misc-9: 방 상태 realtime 구독 — active→ended/deleted 전이 시 읽기전용
  // 전환(즉시 blank 금지, 스트림은 그대로 보이되 composer disabled). 종료 시 귓속말
  // 대상·입력의 @ 자동완성 잔재를 정리한다.
  useEffect(() => {
    if (!roomId) return;
    const unsub = subscribeRoomStatus(roomId, (row) => {
      if (isRoomEnded(row)) {
        setRoomEnded(true);
        setWhisperTarget(null);
        // 입력 끝의 미확정 @토큰만 제거(작성 중 본문은 보존 — 즉시 blank 금지).
        setInput((prev) => prev.replace(/(?:^|\s)@+\S*$/, '').replace(/\s+$/, ''));
      }
    });
    return unsub;
  }, [roomId]);

  // whisper-mode-5/6/11 (E): 멤버 변동 시 귓속말 대상이 더 이상 active 가 아니거나
  // 차단되면 대상을 해제한다(탭 시점 스냅샷이 members.status 와 어긋나는 레이스 방지).
  useEffect(() => {
    if (!whisperTarget) return;
    const member = members.find((m) => m.userId === whisperTarget.userId);
    if (!member || member.status !== 'active' || blockedIds.has(whisperTarget.userId)) {
      setWhisperTarget(null);
    }
  }, [members, whisperTarget, blockedIds]);

  /** 귓속말 전송(+analytics) 후 컴포저/대상 정리. 내 전송이라 하단 강제 추종. */
  const dispatchSend = useCallback(
    (body: string, whisperToUserId: string | null) => {
      if (!roomId) return;
      void send(body, whisperToUserId).then(() => {
        if (whisperToUserId) {
          analytics.capture(ANALYTICS_EVENTS.whisper_mention_sent, { room_id: roomId });
        }
      });
      // concurrency-misc-12: 내 전송은 항상 하단 추종(pill 에 안 잡히게).
      nearBottomRef.current = true;
      setNewCount(0);
      setInput('');
      setWhisperTarget(null);
    },
    [roomId, send],
  );

  const onSend = () => {
    if (!roomId || roomEnded) return; // concurrency-misc-9: 종료된 방은 클라 선차단.

    // G-A: 칩 미확정인데 입력 끝이 @토큰이면 재파싱해 누설 차단.
    if (whisperTarget == null && parseMentionQuery(input).active) {
      const res = resolveTailMention(input, members, { selfId, blockedIds });
      if (res.kind === 'confirmed' && res.target) {
        // 완전일치 && 유일 → 자동 귓속말. tail @토큰 strip 한 본문으로 전송.
        dispatchSend(res.strippedInput ?? input, res.target.userId);
        return;
      }
      if (res.kind === 'ambiguous') {
        // 후보 다수 / prefix-만-일치 → send 보류(드롭다운 유지, 평문 오발신 차단).
        return;
      }
      // res.kind === 'none' → 평문 전송으로 진행(아래).
    }

    dispatchSend(input, whisperTarget?.userId ?? null);
  };

  const onSelectMention = (m: RoomMemberLite) => {
    // @쿼리 토큰을 입력에서 제거하고 귓속말 대상 확정(대상 교체 포함).
    setInput((prev) => prev.replace(/(?:^|\s)@+\S*$/, '').replace(/\s+$/, ''));
    setWhisperTarget({
      userId: m.userId,
      name: m.name,
      avatarInitial: m.avatarInitial,
      photoUrl: m.photoUrl,
    });
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
      blockedIds={blockedIds}
      roomEnded={roomEnded}
      visible
    />
  );
}
