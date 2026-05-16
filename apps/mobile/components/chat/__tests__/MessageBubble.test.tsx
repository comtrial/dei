/**
 * MessageBubble 테스트 (PM 검증서 P0-4).
 * 핵심: failed 라도 retryable===false 면 "다시 시도" 마커를 노출하지 않는다.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { MessageBubble } from '../MessageBubble';
import type { ChatMessage } from '@/lib/chat/types';

function msg(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    conversationId: 'c1',
    senderUserId: 'me',
    body: '안녕',
    createdAt: '2026-05-16T10:00:00Z',
    deliveryStatus: 'sent',
    ...over,
  };
}

describe('MessageBubble retry 마커 gating', () => {
  it('failed + retryable:true → "다시 시도" 마커 노출', () => {
    render(
      <MessageBubble
        isMine
        message={msg({ deliveryStatus: 'failed', retryable: true, clientId: 'cl1' })}
        onRetry={jest.fn()}
      />,
    );
    expect(screen.getByText('전송 실패 · 다시 시도')).toBeTruthy();
  });

  it('failed + retryable:false → 마커 미노출 (사용자 오인 방지)', () => {
    render(
      <MessageBubble
        isMine
        message={msg({ deliveryStatus: 'failed', retryable: false, clientId: 'cl1' })}
        onRetry={jest.fn()}
      />,
    );
    expect(screen.queryByText('전송 실패 · 다시 시도')).toBeNull();
  });

  it('재시도 마커 tap → onRetry(clientId)', () => {
    const onRetry = jest.fn();
    render(
      <MessageBubble
        isMine
        message={msg({ deliveryStatus: 'failed', retryable: true, clientId: 'cl9' })}
        onRetry={onRetry}
      />,
    );
    fireEvent.press(screen.getByTestId('chat-retry-cl9'));
    expect(onRetry).toHaveBeenCalledWith('cl9');
  });

  it('sending → "전송 중…" 노출', () => {
    render(
      <MessageBubble
        isMine
        message={msg({ deliveryStatus: 'sending', clientId: 'cl1' })}
        onRetry={jest.fn()}
      />,
    );
    expect(screen.getByTestId('chat-bubble-sending')).toBeTruthy();
  });
});
