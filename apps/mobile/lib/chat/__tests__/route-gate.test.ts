import { describe, expect, it } from 'vitest';

import { CHAT_TOAST, resolveChatRoute } from '../route-gate';

describe('resolveChatRoute (CH0 게이트)', () => {
  it('차단 없음 + ACTIVE → ENTERED (CH2 진입)', () => {
    const r = resolveChatRoute({
      conversationId: 'c1',
      conversation: { status: 'ACTIVE' },
      isBlocked: false,
    });
    expect(r.outcome).toBe('ENTERED');
    expect(r.conversationId).toBe('c1');
    expect(r.toast).toBeNull();
  });

  it('차단 존재 → BLOCKED + 차단 토스트 (상태/조회 결과 무관)', () => {
    const r = resolveChatRoute({
      conversationId: 'c1',
      conversation: null,
      isBlocked: true,
    });
    expect(r.outcome).toBe('BLOCKED');
    expect(r.toast).toBe(CHAT_TOAST.blocked);
  });

  it('CHAT_TOAST 문자열은 FULL-spec payload 와 정확히 정합 (P1-6)', () => {
    // FULL-spec chat_route_resolved payload_json:
    //   BLOCKED {"message":"더 이상 대화할 수 없습니다"}
    //   ENDED   {"message":"종료된 대화입니다"}
    expect(CHAT_TOAST.blocked).toBe('더 이상 대화할 수 없습니다');
    expect(CHAT_TOAST.ended).toBe('종료된 대화입니다');
  });

  it('차단이 ACTIVE 상태보다 우선한다', () => {
    const r = resolveChatRoute({
      conversationId: 'c1',
      conversation: { status: 'ACTIVE' },
      isBlocked: true,
    });
    expect(r.outcome).toBe('BLOCKED');
  });

  it('status=ENDED → ENDED + 종료 토스트', () => {
    const r = resolveChatRoute({
      conversationId: 'c1',
      conversation: { status: 'ENDED' },
      isBlocked: false,
    });
    expect(r.outcome).toBe('ENDED');
    expect(r.toast).toBe(CHAT_TOAST.ended);
  });

  it('status=DELETED → ENDED + 종료 토스트', () => {
    const r = resolveChatRoute({
      conversationId: 'c1',
      conversation: { status: 'DELETED' },
      isBlocked: false,
    });
    expect(r.outcome).toBe('ENDED');
    expect(r.toast).toBe(CHAT_TOAST.ended);
  });

  it('conversationId 미해석 → NOT_FOUND (토스트 없음, CH1 로)', () => {
    const r = resolveChatRoute({
      conversationId: null,
      conversation: null,
      isBlocked: false,
    });
    expect(r.outcome).toBe('NOT_FOUND');
    expect(r.toast).toBeNull();
  });

  it('conversation 조회 실패(미존재) → NOT_FOUND', () => {
    const r = resolveChatRoute({
      conversationId: 'c1',
      conversation: null,
      isBlocked: false,
    });
    expect(r.outcome).toBe('NOT_FOUND');
  });
});
