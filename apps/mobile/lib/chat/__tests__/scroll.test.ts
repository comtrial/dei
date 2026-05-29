import { describe, expect, it } from 'vitest';
import { isNearBottom } from '../scroll';

describe('isNearBottom (inverted list: offset≈0 is bottom)', () => {
  it('true within threshold', () => {
    expect(isNearBottom(0)).toBe(true);
    expect(isNearBottom(80)).toBe(true);
  });
  it('false beyond threshold', () => {
    expect(isNearBottom(200)).toBe(false);
  });
});
