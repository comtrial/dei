import { Image } from 'expo-image';

import { POLICY } from '@dei/shared';

export function prefetchVideoSiblings(
  videoUrls: string[],
  currentIndex: number,
): void {
  const count = POLICY.video.prefetchSiblingCount;
  const targets: string[] = [];

  for (let offset = 1; offset <= count; offset++) {
    const prev = currentIndex - offset;
    const next = currentIndex + offset;
    if (prev >= 0) targets.push(videoUrls[prev]);
    if (next < videoUrls.length) targets.push(videoUrls[next]);
  }

  for (const url of targets) {
    Image.prefetch(url);
  }
}

export function prefetchThumbnailSiblings(
  thumbnailUrls: string[],
  currentIndex: number,
): void {
  const count = POLICY.video.prefetchSiblingCount;
  const targets: string[] = [];

  for (let offset = 1; offset <= count; offset++) {
    const prev = currentIndex - offset;
    const next = currentIndex + offset;
    if (prev >= 0) targets.push(thumbnailUrls[prev]);
    if (next < thumbnailUrls.length) targets.push(thumbnailUrls[next]);
  }

  for (const url of targets) {
    Image.prefetch(url);
  }
}
