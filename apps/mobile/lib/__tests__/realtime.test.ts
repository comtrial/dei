import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      track: vi.fn(),
      presenceState: vi.fn(() => ({})),
    })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@dei/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dei/shared')>();
  return { ...actual };
});

import { roomChannelName } from '../realtime';

describe('roomChannelName', () => {
  it('roomId 를 room:{roomId} 형태로 반환', () => {
    expect(roomChannelName('abc')).toBe('room:abc');
  });

  it('UUID 형태 roomId 도 동일 패턴', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(roomChannelName(uuid)).toBe(`room:${uuid}`);
  });

  it('빈 문자열 roomId', () => {
    expect(roomChannelName('')).toBe('room:');
  });
});
