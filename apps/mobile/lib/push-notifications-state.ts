let activeChatConversationId: string | null = null;

export function getActiveChatPushConversation() {
  return activeChatConversationId;
}

export function setActiveChatPushConversation(conversationId: string | null | undefined) {
  activeChatConversationId = conversationId?.trim() || null;
}
