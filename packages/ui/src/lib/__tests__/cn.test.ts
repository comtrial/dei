import { describe, expect, it } from 'vitest';

import { cn } from '../cn';

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('bg-accent', 'text-ink-3')).toBe('bg-accent text-ink-3');
  });

  it('drops falsy / conditional values', () => {
    expect(cn('rounded-md', false && 'hidden', undefined, null, 'p-4')).toBe(
      'rounded-md p-4',
    );
  });

  it('merges conflicting tailwind utilities (last wins)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('is exported from the lib barrel', async () => {
    const lib = await import('../index');
    expect(lib.cn).toBe(cn);
  });
});
