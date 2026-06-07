// apps/mobile/lib/chat/__tests__/unread.test.ts
import { describe, expect, it } from 'vitest';
import { hasUnread } from '../unread';

describe('hasUnread', () => {
  it('남의 메시지가 없으면 false', () => {
    expect(hasUnread(null, null)).toBe(false);
    expect(hasUnread(null, '2026-06-07T00:00:00Z')).toBe(false);
  });

  it('남의 메시지가 있고 한 번도 안 읽었으면(last_read=null) true', () => {
    expect(hasUnread('2026-06-07T00:00:00Z', null)).toBe(true);
  });

  it('마지막 읽음 이후 생성된 남의 메시지가 있으면 true', () => {
    expect(hasUnread('2026-06-07T00:00:10Z', '2026-06-07T00:00:00Z')).toBe(true);
  });

  it('마지막 읽음 이후 새 남의 메시지가 없으면 false (이전/동일)', () => {
    expect(hasUnread('2026-06-07T00:00:00Z', '2026-06-07T00:00:10Z')).toBe(false);
    expect(hasUnread('2026-06-07T00:00:00Z', '2026-06-07T00:00:00Z')).toBe(false);
  });
});
