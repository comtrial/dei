import { describe, expect, it } from 'vitest';

import { getToday, getYesterday } from '../dateHelpers';

describe('date helpers', () => {
  it('formats dates using the local calendar day', () => {
    const justAfterLocalMidnight = new Date(2026, 4, 9, 0, 7, 50);

    expect(getToday(justAfterLocalMidnight)).toBe('2026-05-09');
    expect(getYesterday(justAfterLocalMidnight)).toBe('2026-05-08');
  });
});
