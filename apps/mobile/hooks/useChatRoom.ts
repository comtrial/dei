/**
 * CH2 채팅방 상태 훅 — 메시지 스트림 로드 + Realtime 구독 + 전송(낙관적 +
 * 실패 retry 마커, 10-E) + 상대 나감/종료 무음 감지(B-CH6 / 10-H).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchMessages,
  sendMessage,
  subscribeConversation,
} from '@/lib/chat/chat-service';
import type { ChatMessage, MessageRow } from '@/lib/chat/types';
import { logger } from '@dei/shared';

function rowToMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderUserId: row.sender_user_id,
    body: row.body,
    createdAt: row.created_at,
    deliveryStatus: 'sent',
  };
}

let optimisticSeq = 0;

/** 사용자에게 노출할 전송 실패 알림 (10-E: message_send_failed →
 *  DISPLAY_MESSAGE_TO_USER). retryable=false 는 인라인 retry 마커 대신
 *  토스트로만 안내한다. */
export interface SendFailureNotice {
  /** classifySendFailure 가 만든 사용자 메시지. */
  message: string;
  reason: string;
  retryable: boolean;
  /** 동일 실패 중복 표시 방지/소비용 토큰. */
  key: number;
}

export interface UseChatRoomResult {
  messages: ChatMessage[];
  loading: boolean;
  /** 상대가 나갔거나 대화가 종료됨 — 호출부에서 무음 정리 후 목록 복귀. */
  ended: boolean;
  /** 직전 전송 실패 (토스트 표시용). 표시 후 clearSendFailure 로 소비. */
  sendFailure: SendFailureNotice | null;
  clearSendFailure: () => void;
  send: (body: string) => Promise<void>;
  /** 실패 버블 재전송 (인라인 retry 마커 tap). retryable 실패에만 노출. */
  retry: (clientId: string) => Promise<void>;
}

export function useChatRoom(
  conversationId: string | null,
  myUserId: string | null,
): UseChatRoomResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [ended, setEnded] = useState(false);
  const [sendFailure, setSendFailure] = useState<SendFailureNotice | null>(null);
  const pendingBodies = useRef<Map<string, string>>(new Map());
  const failureSeq = useRef(0);

  const clearSendFailure = useCallback(() => setSendFailure(null), []);

  useEffect(() => {
    if (!conversationId) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    fetchMessages(conversationId)
      .then((rows) => {
        if (active) setMessages(rows.map(rowToMessage));
      })
      .catch((err) => {
        logger.captureException(err, {
          tags: { feature: 'chat-room', action: 'load' },
          extra: { conversationId },
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const unsubscribe = subscribeConversation(conversationId, {
      onMessage: (row) => {
        if (!active) return;
        setMessages((prev) => {
          // 내가 보낸 낙관적 버블이 서버로 echo 된 경우 중복 방지.
          if (prev.some((m) => m.id === row.id)) return prev;
          return [...prev, rowToMessage(row)];
        });
      },
      onConversationEnded: () => {
        if (active) setEnded(true);
      },
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [conversationId]);

  const doSend = useCallback(
    async (clientId: string, body: string) => {
      if (!conversationId) return;
      const result = await sendMessage(conversationId, body);

      if (result.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientId === clientId
              ? {
                  id: result.message.id,
                  conversationId: result.message.conversation_id,
                  senderUserId: result.message.sender_user_id,
                  body: result.message.body,
                  createdAt: result.message.created_at,
                  deliveryStatus: 'sent',
                }
              : m,
          ),
        );
        pendingBodies.current.delete(clientId);
        return;
      }

      const { failure } = result;

      if (failure.retryable) {
        // 재시도 가능 실패 → 버블에 retry 마커 (10-E). pendingBody 유지.
        setMessages((prev) =>
          prev.map((m) =>
            m.clientId === clientId
              ? { ...m, deliveryStatus: 'failed', retryable: true }
              : m,
          ),
        );
      } else {
        // 비재시도(BLOCKED/ENDED/INVALID/FORBIDDEN): retry 마커를 절대 남기지
        // 않는다 (PM 검증서 P0-4 — INVALID 가 영구 잔존하던 버그). 낙관적
        // 버블 제거 + 토스트로만 사용자 안내 (P0-3, spec message_send_failed
        // → DISPLAY_MESSAGE_TO_USER).
        setMessages((prev) => prev.filter((m) => m.clientId !== clientId));
        pendingBodies.current.delete(clientId);
      }

      // 사용자 노출 토스트 (재시도 가능/불가 모두 — 실패 사실은 항상 알림).
      failureSeq.current += 1;
      setSendFailure({
        message: failure.message,
        reason: failure.reason,
        retryable: failure.retryable,
        key: failureSeq.current,
      });

      // 차단/종료/미참여 → 대화 더 못 함: 자동 종료 정리 (CH2 닫힘).
      // INVALID(길이 위반)은 콘텐츠 오류이므로 방을 닫지 않는다 — 사용자가
      // 줄여서 다시 보낼 수 있어야 한다.
      if (
        failure.reason === 'BLOCKED' ||
        failure.reason === 'ENDED' ||
        failure.reason === 'FORBIDDEN'
      ) {
        setEnded(true);
      }

      logger.captureMessage('chat.send.failed', 'warning', {
        tags: { feature: 'chat-room', reason: failure.reason },
        extra: { conversationId },
      });
    },
    [conversationId],
  );

  const send = useCallback(
    async (body: string) => {
      if (!conversationId || !myUserId) return;
      const clientId = `local-${Date.now()}-${optimisticSeq++}`;
      pendingBodies.current.set(clientId, body);

      const optimistic: ChatMessage = {
        id: clientId,
        clientId,
        conversationId,
        senderUserId: myUserId,
        body,
        createdAt: new Date().toISOString(),
        deliveryStatus: 'sending',
      };
      setMessages((prev) => [...prev, optimistic]);

      await logger.withErrorCapture('chat.send', () => doSend(clientId, body), {
        tags: { feature: 'chat-room' },
      });
    },
    [conversationId, myUserId, doSend],
  );

  const retry = useCallback(
    async (clientId: string) => {
      const body = pendingBodies.current.get(clientId);
      if (!body) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.clientId === clientId ? { ...m, deliveryStatus: 'sending' } : m,
        ),
      );
      await logger.withErrorCapture('chat.retry', () => doSend(clientId, body), {
        tags: { feature: 'chat-room' },
      });
    },
    [doSend],
  );

  return {
    messages,
    loading,
    ended,
    sendFailure,
    clearSendFailure,
    send,
    retry,
  };
}
