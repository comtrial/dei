/**
 * 원격 영상 URL → 디스크 캐시 hit 시 `file://` URI 로 치환해 돌려준다.
 *
 * 사용
 *   const cachedUrl = useCachedVideoSource(item.videoUrl, item.logId);
 *   const player = useVideoPlayer(cachedUrl, (p) => { ... });
 *
 * 동작
 *   - 첫 렌더: 원본 URL 그대로 반환 (재생 차단 X)
 *   - 마운트 직후 백그라운드로 캐시 lookup → hit 면 file:// 로 setState 해서 swap
 *   - miss 면 `prefetchVideo` 로 백그라운드 다운로드 (다음 진입에서 hit)
 *
 * 주의
 *   - `cacheKey` 는 같은 영상이 시간에 따라 다른 signed URL 로 발급될 때를 대비한
 *     안정적 식별자(예: storage path 또는 log_id). 기본값은 URL 자체.
 *   - `cached` 가 도착해 source 가 바뀌면 `useVideoPlayer` 는 새 source 로 재초기화될 수
 *     있다(expo-video 가 prop 변경을 감지). 첫 프레임은 그때 한 번 더 디코딩되지만
 *     VideoWithPoster 의 포스터가 그 갭을 가린다.
 */
import { useEffect, useState } from 'react';

import { getCachedVideoUri, prefetchVideo } from '@/lib/videoCache';

export function useCachedVideoSource(
  url: string | null | undefined,
  cacheKey?: string | null
): string | null {
  const [resolved, setResolved] = useState<string | null>(url ?? null);

  useEffect(() => {
    if (!url) {
      setResolved(null);
      return;
    }
    if (url.startsWith('file://')) {
      setResolved(url);
      return;
    }

    let alive = true;
    setResolved(url);

    (async () => {
      const cached = await getCachedVideoUri(url, cacheKey);
      if (alive && cached) {
        setResolved(cached);
        return;
      }
      // 캐시 miss → 백그라운드 다운로드 (다음 진입에서 hit)
      void prefetchVideo(url, cacheKey);
    })();

    return () => {
      alive = false;
    };
  }, [url, cacheKey]);

  return resolved;
}
