import { describe, expect, it } from 'vitest';

import { uuidv4 } from '../uuid';

// client_msg_id(uuid) 캐스팅을 깨뜨렸던 비-UUID 폴백 회귀 방지.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('uuidv4 (RN-safe client_msg_id)', () => {
  it('always produces a valid RFC4122 v4 UUID (Postgres uuid 캐스팅 가능)', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(uuidv4()).toMatch(UUID_RE);
    }
  });

  it('produces unique values', () => {
    const set = new Set(Array.from({ length: 500 }, () => uuidv4()));
    expect(set.size).toBe(500);
  });
});
