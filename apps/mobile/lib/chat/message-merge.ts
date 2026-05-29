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

function sortMessages(list: ChatMessage[]): ChatMessage[] {
  return [...list].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
  );
}

/** 들어온 메시지를 기존 목록에 머지. clientMsgId(우선) 또는 server id로 dedup/reconcile. */
export function mergeIncoming(list: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const idx = list.findIndex(
    (m) =>
      (incoming.clientMsgId != null && m.clientMsgId === incoming.clientMsgId) ||
      m.id === incoming.id,
  );
  if (idx >= 0) {
    const next = [...list];
    next[idx] = { ...next[idx], ...incoming };
    return sortMessages(next);
  }
  return sortMessages([...list, incoming]);
}
