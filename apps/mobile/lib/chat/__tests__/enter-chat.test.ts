import { describe, expect, it, vi } from 'vitest';

import { enterChatFromMatch } from '../enter-chat';

describe('enterChatFromMatch (LK8 매칭 완료 → CH0 진입, P0-1)', () => {
  it('conversationId 있으면 CH0 라우터(/chat)로 push 하고 true', () => {
    const push = vi.fn();
    const ok = enterChatFromMatch(push, { conversationId: 'conv-1' });

    expect(ok).toBe(true);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({
      pathname: '/chat',
      params: { conversationId: 'conv-1', source: 'lk8' },
    });
  });

  it('source 미지정 시 기본 lk8 (10-A 매칭 직후 진입 표식)', () => {
    const push = vi.fn();
    enterChatFromMatch(push, { conversationId: 'c2' });
    expect(push.mock.calls[0][0].params.source).toBe('lk8');
  });

  it('source 명시 시 그 값으로 전달', () => {
    const push = vi.fn();
    enterChatFromMatch(push, { conversationId: 'c3', source: 'op3' });
    expect(push.mock.calls[0][0].params.source).toBe('op3');
  });

  it('conversationId 없으면 push 안 하고 false (안전 degrade)', () => {
    const push = vi.fn();
    const ok = enterChatFromMatch(push, { conversationId: null });

    expect(ok).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });
});
