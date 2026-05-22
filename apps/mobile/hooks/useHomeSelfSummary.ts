import { useEffect, useState } from 'react';

import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

/**
 * 홈 상단 카드(home_top_layout B/C)용 "내" 요약 데이터.
 *   - photoUrl: 내 프로필 사진 (profile-images signed URL)
 *   - latestVideoThumbUrl: 내 최근 영상 썸네일 (logs.thumbnail_urls[0], logs signed URL)
 *   - daysSinceVideo: 최근 영상 업로드 후 경과 일수
 * 실패/부재 시 각 필드 null. 홈은 이게 없어도 fallback(회색)으로 동작한다.
 */
export type HomeSelfSummary = {
  photoUrl: string | null;
  latestVideoThumbUrl: string | null;
  daysSinceVideo: number | null;
};

async function signed(bucket: string, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error) {
    if (!/not\s*found/i.test(error.message ?? '')) {
      logger.captureException(error, { tags: { feature: 'home-self-summary', bucket } });
    }
    return null;
  }
  return data?.signedUrl ?? null;
}

export function useHomeSelfSummary(userId: string | null | undefined): HomeSelfSummary {
  const [summary, setSummary] = useState<HomeSelfSummary>({
    photoUrl: null,
    latestVideoThumbUrl: null,
    daysSinceVideo: null,
  });

  useEffect(() => {
    if (!userId) {
      setSummary({ photoUrl: null, latestVideoThumbUrl: null, daysSinceVideo: null });
      return;
    }
    let active = true;
    void logger.withErrorCapture(
      'home.self-summary.fetch',
      async () => {
        // 내 프로필 사진
        const { data: profile } = await supabase
          .from('profiles')
          .select('photo_url')
          .eq('user_id', userId)
          .maybeSingle();

        // 내 최근 영상 (썸네일 + 촬영시각)
        const { data: log } = await (supabase.from('logs') as never as {
          select: (c: string) => {
            eq: (k: string, v: string) => {
              order: (
                c: string,
                o: { ascending: boolean },
              ) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{
                    data: { thumbnail_urls: string[] | null; recorded_at: string } | null;
                  }>;
                };
              };
            };
          };
        })
          .select('thumbnail_urls, recorded_at')
          .eq('user_id', userId)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const photoUrl = await signed('profile-images', profile?.photo_url ?? null);
        const thumbPath = log?.thumbnail_urls?.[0] ?? null;
        const latestVideoThumbUrl = await signed('logs', thumbPath);
        const daysSinceVideo = log?.recorded_at
          ? Math.floor((Date.now() - new Date(log.recorded_at).getTime()) / 86400000)
          : null;

        if (active) setSummary({ photoUrl, latestVideoThumbUrl, daysSinceVideo });
      },
      { tags: { feature: 'home-self-summary' } },
    );
    return () => {
      active = false;
    };
  }, [userId]);

  return summary;
}
