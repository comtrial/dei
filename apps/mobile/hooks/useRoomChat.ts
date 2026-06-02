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

function rowToMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    clientMsgId: (row.client_msg_id as string | null) ?? null,
    userId: String(row.user_id),
    body: String(row.body),
    whisperToUserId: (row.whisper_to_user_id as string | null) ?? null,
    createdAt: String(row.created_at),
    sendState: 'sent',
  };
}

export function useRoomChat({ roomId, selfId }: Args) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const pending = useRef<Map<string, { body: string; whisperToUserId: string | null }>>(new Map());

  // 초기 로드 (최근 N개, created_at asc → merge가 정렬 보정)
  useEffect(() => {
    let alive = true;
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
        return;
      }
      // 히스토리는 기존 상태에 머지(replace 금지) — 로드가 늦게 끝나도 그 사이
      // 생성된 낙관/실패 버블을 덮어쓰지 않는다(send vs load microtask 경합 방지).
      const rows = (data ?? []).map(rowToMessage);
      setMessages((prev) => rows.reduce((acc, row) => mergeIncoming(acc, row), prev));
    })();
    return () => {
      alive = false;
    };
  }, [roomId]);

  // realtime 수신 — 방어 필터(남의 귓속말 drop) + dedup merge
  useEffect(() => {
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

  return { messages, send, retry };
}
