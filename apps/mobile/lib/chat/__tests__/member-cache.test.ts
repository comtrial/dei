import { describe, expect, it } from 'vitest';

import {
  getCachedRoomChatMembers,
  setCachedRoomChatMembers,
} from '../member-cache';

describe('room chat member cache', () => {
  it('stores a room member snapshot and returns cloned values', () => {
    setCachedRoomChatMembers('room-cache-test', [
      {
        avatarInitial: '수',
        name: '수아',
        photoUrl: 'https://cdn.test/u1.jpg',
        status: 'active',
        userId: 'u1',
      },
    ]);

    const first = getCachedRoomChatMembers('room-cache-test');
    expect(first).toEqual([
      {
        avatarInitial: '수',
        name: '수아',
        photoUrl: 'https://cdn.test/u1.jpg',
        status: 'active',
        userId: 'u1',
      },
    ]);

    first[0].name = '변경';

    expect(getCachedRoomChatMembers('room-cache-test')[0].name).toBe('수아');
  });
});
