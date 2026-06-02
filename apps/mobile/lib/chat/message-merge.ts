// apps/mobile/lib/chat/message-merge.ts
export interface ChatMessage {
  id: string;
  clientMsgId: string | null;
  userId: string;
  body: string;
  whisperToUserId: string | null;
  createdAt: string;
  sendState: 'sending' | 'sent' | 'failed';
}

/**
 * 귓속말 가시성 belt(클라 방어선). RLS 가 1차 가드지만, realtime 수신 시 남의
 * 귓속말이 흘러들면 스트림에 노출되면 안 되므로 클라에서도 한 번 더 막는다.
 *
 * 전체 채팅(whisperToUserId=null)은 항상 보인다. 귓속말은 **발신자(self) 또는
 * 대상(self)** 일 때만 보인다 — 제3자에겐 drop.
 */
export function isWhisperVisibleTo(
  msg: Pick<ChatMessage, 'whisperToUserId' | 'userId'>,
  selfId: string,
): boolean {
  if (msg.whisperToUserId == null) return true; // 전체 채팅
  return msg.whisperToUserId === selfId || msg.userId === selfId;
}

function sortMessages(list: ChatMessage[]): ChatMessage[] {
  return [...list].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * 들어온 메시지를 기존 목록에 머지. clientMsgId(우선) 또는 server id로 dedup/reconcile.
 *
 * clientMsgId 매칭은 **같은 userId 일 때만** 유효하다 — 서버 dedup 키가
 * (room, user, client_msg_id) 이므로, userId 를 비교하지 않으면 서로 다른
 * 사용자가 우연히 동일 clientMsgId 를 가질 때 남의 메시지를 내 낙관 메시지에
 * 오매칭(덮어쓰기)할 수 있다(agent team 발굴 결함).
 */
export function mergeIncoming(list: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const idx = list.findIndex(
    (m) =>
      (incoming.clientMsgId != null &&
        m.clientMsgId === incoming.clientMsgId &&
        m.userId === incoming.userId) ||
      m.id === incoming.id,
  );
  if (idx >= 0) {
    const next = [...list];
    next[idx] = { ...next[idx], ...incoming };
    return sortMessages(next);
  }
  return sortMessages([...list, incoming]);
}
