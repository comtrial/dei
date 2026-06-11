import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearCachedProfileSnapshot,
  getCachedProfileSnapshot,
  mergeCachedProfileSnapshot,
} from './profile-session-cache';

describe('profile-session-cache', () => {
  beforeEach(() => {
    clearCachedProfileSnapshot();
  });

  it('merges onboarding profile fields by user and returns copies', () => {
    const first = mergeCachedProfileSnapshot('user-1', {
      gender: 'female',
      nickname: '수아',
    });
    const second = mergeCachedProfileSnapshot('user-1', {
      isStudent: true,
      photoDisplayUrl: 'file:///profile.jpg',
      photoUrl: 'user-1/profile.jpg',
      universityName: '한국대학교',
    });

    expect(first).toEqual({
      gender: 'female',
      nickname: '수아',
      userId: 'user-1',
    });
    expect(second).toEqual({
      gender: 'female',
      isStudent: true,
      nickname: '수아',
      photoDisplayUrl: 'file:///profile.jpg',
      photoUrl: 'user-1/profile.jpg',
      universityName: '한국대학교',
      userId: 'user-1',
    });

    second.nickname = 'mutated';
    expect(getCachedProfileSnapshot('user-1')?.nickname).toBe('수아');
  });

  it('clears a single user or the entire cache', () => {
    mergeCachedProfileSnapshot('user-1', { nickname: '수아' });
    mergeCachedProfileSnapshot('user-2', { nickname: '민준' });

    clearCachedProfileSnapshot('user-1');

    expect(getCachedProfileSnapshot('user-1')).toBeNull();
    expect(getCachedProfileSnapshot('user-2')?.nickname).toBe('민준');

    clearCachedProfileSnapshot();
    expect(getCachedProfileSnapshot('user-2')).toBeNull();
  });
});
