import { describe, expect, it, vi } from 'vitest';

import { enterOpponentProfile } from '../opponent-profile';

/**
 * 10-G: CH2 헤더 / CH4 "상대 프로필 보기" → OP3 (cross-WF) seam.
 * OP3 라우트가 이 앱(채팅 모듈)에 아직 없으므로 현 상태는 항상 안전 degrade.
 * (LK8 패턴과 동일 — 라우트가 생기면 routed:true 분기가 활성화된다.)
 */
describe('enterOpponentProfile (10-G OP3 진입 seam)', () => {
  it('OP3 라우트 부재 → push 안 하고 routed:false + 안내 메시지 (안전 degrade)', () => {
    const push = vi.fn();
    const r = enterOpponentProfile(push, {
      otherUserId: 'other-1',
      source: 'ch4-sheet',
      conversationId: 'conv-1',
    });

    expect(r.routed).toBe(false);
    expect(r.degradeMessage).toBe(
      '상대 프로필 화면은 매칭 프로필(OP3) 연결 후 제공됩니다.',
    );
    // funnel 비차단: 라우트 없으면 절대 navigate 하지 않는다.
    expect(push).not.toHaveBeenCalled();
  });

  it('otherUserId 식별 불가여도 동일하게 degrade (예외 던지지 않음)', () => {
    const push = vi.fn();
    const r = enterOpponentProfile(push, {
      otherUserId: null,
      source: 'ch2-header',
    });

    expect(r.routed).toBe(false);
    expect(r.degradeMessage).not.toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it('두 진입점(ch4-sheet / ch2-header) 모두 동일 seam 을 거친다 (10-G + alt)', () => {
    const push = vi.fn();
    const a = enterOpponentProfile(push, {
      otherUserId: 'o',
      source: 'ch4-sheet',
    });
    const b = enterOpponentProfile(push, {
      otherUserId: 'o',
      source: 'ch2-header',
    });
    // 동작 일관성: 라우트 부재 동안 둘 다 degrade(분기 누락 방지).
    expect(a.routed).toBe(false);
    expect(b.routed).toBe(false);
  });
});
