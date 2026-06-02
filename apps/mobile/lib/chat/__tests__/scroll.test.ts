import { describe, expect, it } from 'vitest';
import { countNewMessages, isNearBottom } from '../scroll';

describe('isNearBottom (inverted list: offset≈0 is bottom)', () => {
  it('true within threshold', () => {
    expect(isNearBottom(0)).toBe(true);
    expect(isNearBottom(80)).toBe(true);
  });
  it('false beyond threshold', () => {
    expect(isNearBottom(200)).toBe(false);
  });
});

describe('countNewMessages (concurrency-misc-12: self 메시지 제외)', () => {
  const prev = [
    { id: 'a', userId: 'u1' },
    { id: 'b', userId: 'me' },
  ];

  it('counts only non-self newly added messages', () => {
    const next = [
      ...prev,
      { id: 'c', userId: 'u1' }, // 남 → 카운트
      { id: 'd', userId: 'me' }, // 내것 → 제외
      { id: 'e', userId: 'u2' }, // 남 → 카운트
    ];
    expect(countNewMessages(prev, next, 'me')).toBe(2);
  });

  it('returns 0 when only my own messages were added', () => {
    const next = [...prev, { id: 'd', userId: 'me' }];
    expect(countNewMessages(prev, next, 'me')).toBe(0);
  });

  it('returns 0 when nothing was added', () => {
    expect(countNewMessages(prev, prev, 'me')).toBe(0);
  });

  it('does not count messages that already existed (id-based)', () => {
    // 기존 메시지의 reconcile(상태 변화)만으로는 증가하지 않는다.
    const next = [
      { id: 'a', userId: 'u1' },
      { id: 'b', userId: 'me' },
      { id: 'c', userId: 'u1' },
    ];
    expect(countNewMessages(prev, next, 'me')).toBe(1);
  });
});
