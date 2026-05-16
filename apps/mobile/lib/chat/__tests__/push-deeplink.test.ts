import { describe, expect, it } from 'vitest';

import { resolvePushChatRoute } from '../push-deeplink';

/**
 * 10-D 푸시 알림 → 채팅방 직진입 라우팅 결정 (순수 로직).
 *
 * FULL-spec (CH0 + push_notification_chat_tapped, payload/condition 권위):
 *   - conversationId 있음            → CH0 라우터(/chat, source=push).
 *                                       CH0 가 BLOCKED/ENDED/NOT_FOUND 흡수.
 *   - conversationId 없음 + active>0 → CH1 목록(/messages)
 *   - conversationId 없음 + active=0 → CH1 진입(0건 → 화면이 CH3 렌더), reason=empty
 *   - type !== 'chat'               → null (채팅 라우팅 아님)
 */
describe('resolvePushChatRoute (10-D)', () => {
  it('conversationId 있는 chat 푸시 → CH0 라우터(/chat, source=push)', () => {
    const r = resolvePushChatRoute({
      payload: { type: 'chat', conversationId: 'conv-9' },
      activeConversationCount: 3,
    });
    expect(r).toEqual({
      pathname: '/chat',
      params: { conversationId: 'conv-9', source: 'push' },
    });
  });

  it('conversationId 없음 + ACTIVE 대화 >0 → CH1 목록(/messages)', () => {
    const r = resolvePushChatRoute({
      payload: { type: 'chat' },
      activeConversationCount: 2,
    });
    expect(r).toEqual({ pathname: '/messages' });
  });

  it('conversationId 없음 + ACTIVE 대화 0건 → /messages + reason=empty (CH3 분기)', () => {
    const r = resolvePushChatRoute({
      payload: { type: 'chat', conversationId: null },
      activeConversationCount: 0,
    });
    expect(r).toEqual({ pathname: '/messages', reason: 'empty' });
  });

  it('type 이 chat 이 아니면 null (다른 도메인 알림은 채팅이 처리하지 않음)', () => {
    expect(
      resolvePushChatRoute({
        payload: { type: 'like', conversationId: 'x' },
        activeConversationCount: 5,
      }),
    ).toBeNull();
    expect(
      resolvePushChatRoute({ payload: null, activeConversationCount: 1 }),
    ).toBeNull();
  });

  it('공백 conversationId 는 미해석으로 취급 → conversation_count 분기로 폴백', () => {
    const r = resolvePushChatRoute({
      payload: { type: 'chat', conversationId: '   ' },
      activeConversationCount: 1,
    });
    expect(r).toEqual({ pathname: '/messages' });
  });
});
