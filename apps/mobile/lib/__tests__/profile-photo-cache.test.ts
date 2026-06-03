import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  createSignedUrl: vi.fn(),
  createSignedUrls: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock('@dei/shared', () => ({
  logger: {
    captureException: mocks.captureException,
    captureMessage: mocks.captureMessage,
  },
}));

vi.mock('react-native', () => ({
  Image: {
    prefetch: (...args: unknown[]) => mocks.prefetch(...args),
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: mocks.createSignedUrl,
        createSignedUrls: mocks.createSignedUrls,
      }),
    },
  },
}));

// eslint-disable-next-line import/first
import {
  getCachedProfilePhotoUrl,
  resolveProfilePhotoUrl,
  resolveProfilePhotoUrls,
} from '../profile-photo-cache';

beforeEach(() => {
  mocks.captureException.mockReset();
  mocks.captureMessage.mockReset();
  mocks.createSignedUrl.mockReset();
  mocks.createSignedUrls.mockReset();
  mocks.prefetch.mockReset();
  mocks.prefetch.mockResolvedValue(true);
});

describe('profile-photo-cache', () => {
  it('signs, prefetches, and reuses a cached profile photo URL', async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://cdn.test/u1-signed.jpg' },
      error: null,
    });

    const first = await resolveProfilePhotoUrl(
      { path: 'u1/profile.jpg', userId: 'u1' },
      { screen: 'room', roomId: 'room-1' },
    );
    const second = await resolveProfilePhotoUrl(
      { path: 'u1/profile.jpg', userId: 'u1' },
      { screen: 'room-chat', roomId: 'room-1' },
    );

    expect(first).toBe('https://cdn.test/u1-signed.jpg');
    expect(second).toBe('https://cdn.test/u1-signed.jpg');
    expect(getCachedProfilePhotoUrl('u1', 'u1/profile.jpg')).toBe('https://cdn.test/u1-signed.jpg');
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(mocks.prefetch).toHaveBeenCalledWith('https://cdn.test/u1-signed.jpg');
  });

  it('returns remote photo URLs without signing them', async () => {
    const result = await resolveProfilePhotoUrl(
      { path: 'https://cdn.test/u2.jpg', userId: 'u2' },
      { screen: 'room-chat' },
    );

    expect(result).toBe('https://cdn.test/u2.jpg');
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
    expect(mocks.prefetch).toHaveBeenCalledWith('https://cdn.test/u2.jpg');
  });

  it('resolves many profile photo URLs into a user map', async () => {
    mocks.createSignedUrls.mockResolvedValue({
      data: [
        { path: 'u3-batch/profile.jpg', signedUrl: 'https://cdn.test/u3.jpg' },
        { path: 'u4-batch/profile.jpg', signedUrl: 'https://cdn.test/u4.jpg' },
      ],
      error: null,
    });

    const result = await resolveProfilePhotoUrls(
      [
        { path: 'u3-batch/profile.jpg', userId: 'u3-batch' },
        { path: 'u4-batch/profile.jpg', userId: 'u4-batch' },
      ],
      { screen: 'room-chat' },
    );

    expect(result).toEqual(
      new Map([
        ['u3-batch', 'https://cdn.test/u3.jpg'],
        ['u4-batch', 'https://cdn.test/u4.jpg'],
      ]),
    );
    expect(mocks.createSignedUrls).toHaveBeenCalledWith(
      ['u3-batch/profile.jpg', 'u4-batch/profile.jpg'],
      60 * 60,
    );
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });
});
