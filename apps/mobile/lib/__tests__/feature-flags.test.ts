import { describe, expect, it } from 'vitest';

import { getFlag } from '../feature-flags';

describe('getFlag', () => {
  it('flags null → fallback', () => {
    expect(getFlag(null, 'home_top_layout', 'A')).toBe('A');
    expect(getFlag(undefined, 'home_top_layout', false)).toBe(false);
  });

  it('key 없음 → fallback', () => {
    expect(getFlag({}, 'home_top_layout', 'A')).toBe('A');
    expect(getFlag({ other: 'X' }, 'home_top_layout', 'A')).toBe('A');
  });

  it('값 있으면 그 값 (variant)', () => {
    expect(getFlag({ home_top_layout: 'C' }, 'home_top_layout', 'A')).toBe('C');
  });

  it('값 있으면 그 값 (boolean false 도 fallback 아님)', () => {
    expect(getFlag({ promo: false }, 'promo', true)).toBe(false);
    expect(getFlag({ promo: true }, 'promo', false)).toBe(true);
  });

  it('null/undefined 값 → fallback', () => {
    expect(getFlag({ home_top_layout: null as never }, 'home_top_layout', 'A')).toBe('A');
  });
});
