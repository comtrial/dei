import { describe, expect, it, vi } from 'vitest';

import { enterOpponentProfile } from '../opponent-profile';

/**
 * 10-G: CH2 헤더 / CH4 "상대 프로필 보기" → OP3 (cross-WF) seam.
 * OP3 = 공개 프로필 라우트 `/profiles/[userId]` (구현됨). otherUserId 가 있으면
 * 그쪽으로 navigate, 없으면 funnel 비차단 안전 degrade.
 */
describe('enterOpponentProfile (10-G OP3 진입 seam)', () => {
  it('otherUserId 있으면 OP3 라우트로 navigate (routed:true, userId 전달)', () => {
    const push = vi.fn();
    const r = enterOpponentProfile(push, {
      otherUserId: 'other-1',
      source: 'ch4-sheet',
      conversationId: 'conv-1',
    });

    expect(r.routed).toBe(true);
    expect(r.degradeMessage).toBeNull();
    expect(push).toHaveBeenCalledWith({
      pathname: '/profiles/[userId]',
      params: { userId: 'other-1', source: 'ch4-sheet', conversationId: 'conv-1' },
    });
  });

  it('otherUserId 식별 불가면 degrade (예외 던지지 않음, navigate 안 함)', () => {
    const push = vi.fn();
    const r = enterOpponentProfile(push, {
      otherUserId: null,
      source: 'ch2-header',
    });

    expect(r.routed).toBe(false);
    expect(r.degradeMessage).not.toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it('두 진입점(ch4-sheet / ch2-header) 모두 동일 seam 으로 navigate (10-G + alt)', () => {
    const push = vi.fn();
    const a = enterOpponentProfile(push, {
      otherUserId: 'o',
      source: 'ch4-sheet',
    });
    const b = enterOpponentProfile(push, {
      otherUserId: 'o',
      source: 'ch2-header',
    });

    expect(a.routed).toBe(true);
    expect(b.routed).toBe(true);
    expect(push).toHaveBeenCalledTimes(2);
  });
});
