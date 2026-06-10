// apps/mobile/hooks/useRoomChat.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';
import { subscribeRoomMessages } from '@/lib/realtime';
import { sendRoomMessage } from '@/lib/chat/send-message';
import { mergeIncoming, isWhisperVisibleTo, type ChatMessage } from '@/lib/chat/message-merge';
import { uuidv4 } from '@/lib/chat/uuid';

interface Args {
  roomId: string;
  selfId: string;
}

type RoomLifecycleRow = {
  actor_user_id: string | null;
  created_at: string;
  event: string;
  id: string;
};

type ProfileNameRow = {
  nickname: string | null;
  user_id: string;
};

function rowToMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    clientMsgId: (row.client_msg_id as string | null) ?? null,
    userId: String(row.user_id),
    body: String(row.body),
    whisperToUserId: (row.whisper_to_user_id as string | null) ?? null,
    createdAt: String(row.created_at),
    sendState: 'sent',
    kind: 'user',
  };
}

function memberLeftBody(name: string, event: string): string {
  return `${name}님이 ${event === 'auto_kicked' ? '자동 퇴장됐어요' : '나갔어요'}`;
}

async function loadMemberLifecycleMessages(roomId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('room_lifecycle')
    .select('id, event, actor_user_id, created_at')
    .eq('room_id', roomId)
    .in('event', ['member_left', 'auto_kicked'])
    .order('created_at', { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as RoomLifecycleRow[];
  if (rows.length === 0) return [];

  const actorIds = [
    ...new Set(
      rows
        .map((row) => row.actor_user_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  const nameByUser = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from('profile')
      .select('user_id, nickname')
      .in('user_id', actorIds);

    if (profileError) throw profileError;

    for (const profile of (profiles ?? []) as ProfileNameRow[]) {
      nameByUser.set(profile.user_id, profile.nickname ?? profile.user_id.slice(0, 6));
    }
  }

  return rows.map((row) => {
    const actorUserId = row.actor_user_id ?? 'system';
    const name = nameByUser.get(actorUserId) ?? actorUserId.slice(0, 6);
    return {
      id: `lifecycle-${row.id}`,
      clientMsgId: null,
      userId: actorUserId,
      body: memberLeftBody(name, row.event),
      whisperToUserId: null,
      createdAt: row.created_at,
      sendState: 'sent',
      kind: 'system',
    };
  });
}

export function useRoomChat({ roomId, selfId }: Args) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(Boolean(roomId));
  const pending = useRef<Map<string, { body: string; whisperToUserId: string | null }>>(new Map());

  // 초기 로드 (최근 N개, created_at asc → merge가 정렬 보정)
  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      setIsInitialLoading(false);
      return;
    }

    let alive = true;
    setIsInitialLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from('message')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(50);
      if (!alive) return;
      if (error) {
        logger.captureException(error, { tags: { feature: 'chat-load', room_id: roomId } });
        setIsInitialLoading(false);
        return;
      }
      let lifecycleMessages: ChatMessage[] = [];
      try {
        lifecycleMessages = await loadMemberLifecycleMessages(roomId);
      } catch (err) {
        logger.captureException(err, {
          tags: { feature: 'chat-load', sub_feature: 'room_lifecycle', room_id: roomId },
        });
      }
      if (!alive) return;
      // 히스토리는 기존 상태에 머지(replace 금지) — 로드가 늦게 끝나도 그 사이
      // 생성된 낙관/실패 버블을 덮어쓰지 않는다(send vs load microtask 경합 방지).
      const rows = [...(data ?? []).map(rowToMessage), ...lifecycleMessages];
      setMessages((prev) => rows.reduce((acc, row) => mergeIncoming(acc, row), prev));
      setIsInitialLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [roomId]);

  // realtime 수신 — 방어 필터(남의 귓속말 drop) + dedup merge
  useEffect(() => {
    if (!roomId) return;
    const unsub = subscribeRoomMessages(roomId, (row) => {
      const msg = rowToMessage(row);
      // 방어: 귓속말은 발신자=self 또는 대상=self 일 때만(RLS가 1차 가드, 이건 belt).
      if (!isWhisperVisibleTo(msg, selfId)) return;
      setMessages((prev) => mergeIncoming(prev, msg));
    });
    return unsub;
  }, [roomId, selfId]);

  const doSend = useCallback(
    async (clientMsgId: string, body: string, whisperToUserId: string | null) => {
      pending.current.set(clientMsgId, { body, whisperToUserId });
      setMessages((prev) =>
        mergeIncoming(prev, {
          id: `tmp-${clientMsgId}`,
          clientMsgId,
          userId: selfId,
          body,
          whisperToUserId,
          createdAt: new Date().toISOString(),
          sendState: 'sending',
        }),
      );
      try {
        const { message } = await sendRoomMessage({ roomId, body, whisperToUserId, clientMsgId });
        // SentMessage 는 이미 타입이 있으므로 row 캐스팅 없이 직접 reconcile.
        setMessages((prev) =>
          mergeIncoming(prev, {
            id: message.id,
            clientMsgId,
            userId: message.user_id,
            body: message.body,
            whisperToUserId: message.whisper_to_user_id,
            createdAt: message.created_at,
            sendState: 'sent',
          }),
        );
        pending.current.delete(clientMsgId);
      } catch (err) {
        // 전송 실패는 사용자 영향이 크므로 Sentry 로 진단 컨텍스트와 함께 보고한다.
        // code(SendMessageError) / reason / client_msg_id / whisper 여부 / body 길이로
        // not_room_member·room_not_active·invalid_whisper·uuid 캐스팅 등 원인 구분.
        const sendErr = err as { code?: string; reason?: string; message?: string };
        logger.captureException(err, {
          tags: {
            feature: 'chat-send',
            room_id: roomId,
            error_code: sendErr.code ?? 'unknown',
          },
          extra: {
            client_msg_id: clientMsgId,
            is_whisper: whisperToUserId != null,
            body_length: [...body].length,
            reason: sendErr.reason ?? null,
            message: sendErr.message ?? null,
          },
        });
        setMessages((prev) =>
          prev.map((m) => (m.clientMsgId === clientMsgId ? { ...m, sendState: 'failed' } : m)),
        );
      }
    },
    [roomId, selfId],
  );

  const send = useCallback(
    (body: string, whisperToUserId: string | null = null) => {
      // RN(Hermes)엔 crypto.randomUUID 가 없어 직전 폴백이 비-UUID 를 만들어
      // client_msg_id(uuid) 캐스팅 실패로 전송이 전부 깨졌다. uuidv4() 로 항상 유효 UUID 보장.
      const clientMsgId = uuidv4();
      return doSend(clientMsgId, body, whisperToUserId);
    },
    [doSend],
  );

  const retry = useCallback(
    (clientMsgId: string) => {
      const p = pending.current.get(clientMsgId);
      const existing = messages.find((m) => m.clientMsgId === clientMsgId);
      const body = p?.body ?? existing?.body ?? '';
      const whisperToUserId = p?.whisperToUserId ?? existing?.whisperToUserId ?? null;
      setMessages((prev) =>
        prev.map((m) => (m.clientMsgId === clientMsgId ? { ...m, sendState: 'sending' } : m)),
      );
      return doSend(clientMsgId, body, whisperToUserId);
    },
    [doSend, messages],
  );

  const addSystemMessage = useCallback((message: Omit<ChatMessage, 'kind' | 'sendState'>) => {
    setMessages((prev) =>
      mergeIncoming(prev, {
        ...message,
        kind: 'system',
        sendState: 'sent',
      }),
    );
  }, []);

  return { messages, send, retry, addSystemMessage, isInitialLoading };
}
