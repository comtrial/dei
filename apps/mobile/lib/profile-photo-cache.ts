import { Image as RNImage } from 'react-native';

import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

type CacheEntry = {
  expiresAtMs: number;
  path: string;
  url: string;
};

type ResolveOptions = {
  expiresIn?: number;
  roomId?: string;
  screen: string;
};

type ProfilePhotoInput = {
  path: string | null;
  userId: string;
};

const DEFAULT_EXPIRES_IN = 60 * 60;
const REFRESH_SKEW_MS = 5 * 60 * 1000;
const signedUrlByUser = new Map<string, CacheEntry>();
const prefetchedUrls = new Set<string>();

function isRemoteUrl(path: string) {
  return /^https?:\/\//i.test(path);
}

function isFresh(entry: CacheEntry | undefined, path: string): entry is CacheEntry {
  return (
    entry != null &&
    entry.path === path &&
    entry.expiresAtMs - REFRESH_SKEW_MS > Date.now()
  );
}

export function getCachedProfilePhotoUrl(userId: string, path: string | null) {
  if (!path) return null;
  const cached = signedUrlByUser.get(userId);
  return isFresh(cached, path) ? cached.url : null;
}

export async function cacheProfilePhotoUrl({
  expiresIn = DEFAULT_EXPIRES_IN,
  path,
  url,
  userId,
}: {
  expiresIn?: number;
  path: string;
  url: string;
  userId: string;
}) {
  signedUrlByUser.set(userId, {
    expiresAtMs: isRemoteUrl(path) ? Number.MAX_SAFE_INTEGER : Date.now() + expiresIn * 1000,
    path,
    url,
  });
  await prefetchProfilePhotoUrl(url);
}

export async function prefetchProfilePhotoUrl(url: string) {
  if (prefetchedUrls.has(url)) return;
  prefetchedUrls.add(url);
  try {
    await RNImage.prefetch(url);
  } catch (error) {
    prefetchedUrls.delete(url);
    logger.captureMessage('profile photo prefetch failed', 'warning', {
      tags: { feature: 'profile-photo-cache' },
      extra: { reason: error instanceof Error ? error.message : String(error) },
    });
  }
}

export async function resolveProfilePhotoUrl(
  { path, userId }: ProfilePhotoInput,
  options: ResolveOptions,
) {
  if (!path) return null;

  if (isRemoteUrl(path)) {
    await cacheProfilePhotoUrl({ path, url: path, userId });
    return path;
  }

  const cached = getCachedProfilePhotoUrl(userId, path);
  if (cached) {
    await prefetchProfilePhotoUrl(cached);
    return cached;
  }

  const expiresIn = options.expiresIn ?? DEFAULT_EXPIRES_IN;
  const { data, error } = await supabase.storage
    .from('profile-photos')
    .createSignedUrl(path, expiresIn);

  if (error) {
    logger.captureException(error, {
      tags: {
        feature: 'avatar-photo-sign',
        room_id: options.roomId ?? '',
        screen: options.screen,
      },
      extra: { user_id: userId },
    });
    return null;
  }

  const url = data?.signedUrl ?? null;
  if (!url) return null;

  await cacheProfilePhotoUrl({ expiresIn, path, url, userId });
  return url;
}

export async function resolveProfilePhotoUrls(
  photos: ProfilePhotoInput[],
  options: ResolveOptions,
) {
  const expiresIn = options.expiresIn ?? DEFAULT_EXPIRES_IN;
  const result = new Map<string, string>();
  const toSign: { path: string; userId: string }[] = [];

  for (const photo of photos) {
    if (!photo.path) continue;

    if (isRemoteUrl(photo.path)) {
      result.set(photo.userId, photo.path);
      continue;
    }

    const cached = getCachedProfilePhotoUrl(photo.userId, photo.path);
    if (cached) {
      result.set(photo.userId, cached);
      continue;
    }

    toSign.push({ path: photo.path, userId: photo.userId });
  }

  if (toSign.length > 0) {
    const { data, error } = await supabase.storage
      .from('profile-photos')
      .createSignedUrls(toSign.map((photo) => photo.path), expiresIn);

    if (error) {
      logger.captureException(error, {
        tags: {
          feature: 'avatar-photo-sign',
          room_id: options.roomId ?? '',
          screen: options.screen,
        },
        extra: { count: toSign.length },
      });
      const fallback = await Promise.all(
        toSign.map(async (photo) => ({
          url: await resolveProfilePhotoUrl(photo, options),
          userId: photo.userId,
        })),
      );
      for (const photo of fallback) {
        if (photo.url) result.set(photo.userId, photo.url);
      }
    } else {
      const signedRows = (data ?? []) as { path?: string | null; signedUrl?: string | null }[];
      const signedByPath = new Map(
        signedRows
          .filter((row): row is { path: string; signedUrl: string } =>
            row.path != null && row.signedUrl != null,
          )
          .map((row) => [row.path, row.signedUrl]),
      );

      for (const photo of toSign) {
        const url = signedByPath.get(photo.path);
        if (!url) continue;
        result.set(photo.userId, url);
      }
    }
  }

  await Promise.all(
    photos.map((photo) => {
      const url = result.get(photo.userId);
      return photo.path && url
        ? cacheProfilePhotoUrl({ expiresIn, path: photo.path, url, userId: photo.userId })
        : Promise.resolve();
    }),
  );
  return result;
}
