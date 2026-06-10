import { describe, expect, it } from 'vitest';

import { formatRematchCountdown, getRematchRestriction } from '../rematch';

describe('rematch restriction', () => {
  it('방 이탈 12시간 안이면 제한 상태와 가능 시각을 반환한다', () => {
    const restriction = getRematchRestriction(
      '2026-05-30T00:00:00.000Z',
      new Date('2026-05-30T00:28:00.000Z'),
    );

    expect(restriction.restricted).toBe(true);
    expect(restriction.availableAt).toBe('2026-05-30T12:00:00.000Z');
    expect(formatRematchCountdown(restriction.remainingMs)).toBe('11:32');
  });

  it('12시간이 지나면 제한이 없다', () => {
    const restriction = getRematchRestriction(
      '2026-05-30T00:00:00.000Z',
      new Date('2026-05-30T12:00:00.000Z'),
    );

    expect(restriction.restricted).toBe(false);
    expect(restriction.remainingMs).toBe(0);
  });
});
