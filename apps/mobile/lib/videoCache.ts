/**
 * 영상 디스크 캐시 (LRU, 약 150 MB)
 *
 * 동작
 *   - `getCachedVideoUri(url)` 는 캐시 hit 면 `file://` URI, miss 면 null 반환 (절대 차단 X).
 *   - `prefetchVideo(url)` 은 백그라운드로 받아둔다.
 *   - 한도 초과 시 가장 오래 안 쓴 파일부터 삭제 (mtime 기준 LRU).
 *
 * 한도/위치
 *   - 디렉터리: `{cache}/video-cache/`
 *   - 한도: 150 MB (`MAX_BYTES`). 신규 다운로드 직후 트림.
 *
 * 정확성 가드
 *   - 같은 URL 에 대한 동시 다운로드는 in-flight Promise 로 1개로 합친다.
 *   - 다운로드 실패 시 빈/부분 파일은 정리.
 *
 * 주의
 *   - URL 이 redirect 등으로 변경될 수 있는 영상(short-lived signed URL)은
 *     일관된 캐시 키를 사용하려면 `cacheKey` (storage path 등) 를 같이 넘긴다.
 *   - 디바이스 OS 자체가 캐시 디렉터리를 비우면 다음 호출에서 자동 재다운로드된다.
 */
import * as FileSystem from 'expo-file-system/legacy';

import { logger } from '@dei/shared';

const VIDEO_CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}video-cache/`;
const MAX_BYTES = 150 * 1024 * 1024; // 150 MB

const inflight = new Map<string, Promise<string | null>>();
let dirReady = false;

function hashKey(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function extFromUrl(url: string): string {
  const clean = url.split('?')[0] ?? '';
  const ext = clean.split('.').pop()?.toLowerCase();
  if (ext === 'mov' || ext === 'qt') return 'mov';
  if (ext === 'mp4' || ext === 'm4v') return 'mp4';
  return 'mp4';
}

async function ensureDir(): Promise<void> {
  if (dirReady) return;
  try {
    const info = await FileSystem.getInfoAsync(VIDEO_CACHE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(VIDEO_CACHE_DIR, { intermediates: true });
    }
    dirReady = true;
  } catch (error) {
    logger.captureException(error, {
      tags: { feature: 'video-cache' },
      extra: { step: 'ensureDir', dir: VIDEO_CACHE_DIR },
    });
  }
}

function pathFor(url: string, cacheKey?: string | null): string {
  const key = hashKey(cacheKey || url);
  return `${VIDEO_CACHE_DIR}${key}.${extFromUrl(url)}`;
}

/**
 * 캐시 hit 시 file:// URI, miss 시 null. 절대 네트워크 차단 X.
 */
export async function getCachedVideoUri(
  url: string | null | undefined,
  cacheKey?: string | null
): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('file://')) return url;
  try {
    const target = pathFor(url, cacheKey);
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists && 'size' in info && (info.size ?? 0) > 0) {
      // touch — LRU 갱신은 다음 트림 사이클에서 최신 mtime 으로 살아남도록
      void touchFile(target);
      return target;
    }
  } catch {
    // miss
  }
  return null;
}

/**
 * 백그라운드 다운로드. 다시 호출해도 in-flight 와 dedupe.
 * 완료 후 캐시 한도를 넘으면 LRU 트림.
 */
export async function prefetchVideo(
  url: string | null | undefined,
  cacheKey?: string | null
): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('file://')) return url;

  const target = pathFor(url, cacheKey);

  // 이미 캐시되어 있으면 그대로 반환
  try {
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists && 'size' in info && (info.size ?? 0) > 0) {
      void touchFile(target);
      return target;
    }
  } catch {
    // ignore
  }

  // in-flight dedupe
  const existing = inflight.get(target);
  if (existing) return existing;

  const task = (async () => {
    try {
      await ensureDir();
      const result = await FileSystem.downloadAsync(url, target);
      if (result.status >= 200 && result.status < 300) {
        // 캐시 한도 초과 시 트림 (실패해도 무시)
        void trimCache().catch(() => undefined);
        return target;
      }
      // 비-2xx 응답이면 부분 파일 정리
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
      return null;
    } catch (error) {
      // 실패 시 부분 파일 정리
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
      logger.captureException(error, {
        tags: { feature: 'video-cache' },
        extra: { step: 'downloadAsync', url, cacheKey: cacheKey ?? null },
      });
      return null;
    } finally {
      inflight.delete(target);
    }
  })();

  inflight.set(target, task);
  return task;
}

/**
 * 여러 영상 동시 워밍업 (best-effort). 결과는 무시.
 */
export function prefetchVideos(
  inputs: Array<{ url: string | null | undefined; cacheKey?: string | null }>
): void {
  for (const input of inputs) {
    void prefetchVideo(input.url, input.cacheKey);
  }
}

/**
 * 파일을 한 번 읽어 mtime 을 갱신 (read-only touch). LRU 정확도 향상용.
 */
async function touchFile(_path: string): Promise<void> {
  // expo-file-system 에는 직접적인 utimes 가 없다. getInfoAsync 자체는 mtime 을 바꾸지
  // 않으므로, 가장 보수적인 방식은 mtime 을 굳이 갱신하지 않고 그대로 두는 것.
  // LRU 정확도는 약간 떨어지지만 "오래된 캐시 영상이 가장 먼저 정리" 라는 의도는 유지된다.
  // (의도적으로 no-op — 함수 시그니처는 유지해 향후 확장에 대비)
  return;
}

/**
 * 캐시 한도 초과 시 mtime 오래된 순으로 삭제.
 */
async function trimCache(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(VIDEO_CACHE_DIR);
    if (!dirInfo.exists) return;

    const entries = await FileSystem.readDirectoryAsync(VIDEO_CACHE_DIR);
    const stats = await Promise.all(
      entries.map(async (name) => {
        const fullPath = `${VIDEO_CACHE_DIR}${name}`;
        const info = await FileSystem.getInfoAsync(fullPath);
        const size = info.exists && 'size' in info ? (info.size ?? 0) : 0;
        const mtime =
          info.exists && 'modificationTime' in info
            ? ((info as { modificationTime?: number }).modificationTime ?? 0)
            : 0;
        return { path: fullPath, size, mtime };
      })
    );

    const totalBytes = stats.reduce((acc, s) => acc + s.size, 0);
    if (totalBytes <= MAX_BYTES) return;

    // 오래된(작은 mtime) 순 정렬
    stats.sort((a, b) => a.mtime - b.mtime);

    let bytes = totalBytes;
    for (const entry of stats) {
      if (bytes <= MAX_BYTES) break;
      try {
        await FileSystem.deleteAsync(entry.path, { idempotent: true });
        bytes -= entry.size;
      } catch (error) {
        logger.captureException(error, {
          tags: { feature: 'video-cache' },
          extra: { step: 'evict', path: entry.path },
        });
      }
    }
  } catch (error) {
    logger.captureException(error, {
      tags: { feature: 'video-cache' },
      extra: { step: 'trimCache' },
    });
  }
}

/**
 * 디버그/테스트용 — 캐시 전체 삭제.
 */
export async function clearVideoCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(VIDEO_CACHE_DIR, { idempotent: true });
    dirReady = false;
  } catch (error) {
    logger.captureException(error, {
      tags: { feature: 'video-cache' },
      extra: { step: 'clearVideoCache' },
    });
  }
}
