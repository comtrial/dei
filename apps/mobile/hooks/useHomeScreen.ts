import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';

export type HomeScreenType = 'loading' | 'H2' | 'H3';

export interface CurationVideo {
  poolId: string;
  logId: string;
  videoUrl: string;
}

export interface CurationItem {
  userId: string;
  displayName: string;
  gender: string | null;
  age: number | null;
  region: string | null;
  videos: CurationVideo[];
}

type PaidRefreshCurationRow = {
  display_name: string | null;
  gender: string | null;
  log_id: string;
  pool_id: string;
  user_id: string;
  video_path: string | null;
  video_url: string | null;
};

function groupToCurationItems(rows: PaidRefreshCurationRow[]): CurationItem[] {
  const userMap = new Map<string, CurationItem>();

  for (const row of rows) {
    const rawPath = row.video_path ?? row.video_url ?? '';
    const videoUrl = rawPath
      ? supabase.storage.from('logs').getPublicUrl(rawPath).data.publicUrl
      : '';

    const video: CurationVideo = { poolId: row.pool_id, logId: row.log_id, videoUrl };

    if (userMap.has(row.user_id)) {
      userMap.get(row.user_id)!.videos.push(video);
    } else {
      userMap.set(row.user_id, {
        userId: row.user_id,
        displayName: row.display_name ?? '—',
        gender: row.gender ?? null,
        age: null,
        region: null,
        videos: [video],
      });
    }
  }

  return Array.from(userMap.values());
}

async function fetchCurationPool(
  userId: string,
  excludeUserIds: string[] = []
): Promise<CurationItem[]> {
  // Step 0: 본인 성별 조회 → 이성만 추천 (소개팅 앱 매칭 정책)
  // gender 미설정/비표준 값(NULL, 'M'/'F' 외) → 빈 풀 반환 (온보딩 미완료 등)
  const { data: selfProfile } = await supabase
    .from('profiles')
    .select('gender')
    .eq('user_id', userId)
    .maybeSingle();
  const selfGender = selfProfile?.gender;
  if (selfGender !== 'M' && selfGender !== 'F') return [];
  const targetGender: 'M' | 'F' = selfGender === 'M' ? 'F' : 'M';

  // Step 0b: 이성 user_id 목록 확보 (curation_pool ↔ profiles 직접 FK 없어 in 필터로 처리)
  const { data: oppositeProfiles } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('gender', targetGender);
  const allowedUserIds = (oppositeProfiles ?? []).map((row) => row.user_id);
  if (allowedUserIds.length === 0) return [];

  // Step 1: 3명의 서로 다른 유저를 찾고 각자의 가장 최신 pool_date를 확정
  const step1 = supabase
    .from('curation_pool')
    .select('user_id, pool_date')
    .neq('user_id', userId)
    .eq('검수_YN', 'Y')
    .eq('차단_YN', 'N')
    .in('user_id', allowedUserIds)
    .order('pool_date', { ascending: false })
    .limit(300);

  if (excludeUserIds.length > 0) {
    step1.not('user_id', 'in', `(${excludeUserIds.join(',')})`);
  }

  const { data: entries } = await step1;
  if (!entries || entries.length === 0) return [];

  // 유저별 최신 pool_date 추출 (정렬이 DESC이므로 첫 등장 = 최신)
  const userLatestDate = new Map<string, string>();
  for (const entry of entries) {
    if (!userLatestDate.has(entry.user_id)) {
      userLatestDate.set(entry.user_id, entry.pool_date);
    }
    if (userLatestDate.size === 3) break;
  }

  if (userLatestDate.size < 3) return [];

  // Step 2: 각 유저의 최신 pool_date 영상 전부 조회 (시간 오름차순)
  const videoResults = await Promise.all(
    Array.from(userLatestDate.entries()).map(([uid, date]) =>
      supabase
        .from('curation_pool')
        .select('id, user_id, log_id, video_path, logs(video_url)')
        .eq('user_id', uid)
        .eq('pool_date', date)
        .eq('검수_YN', 'Y')
        .eq('차단_YN', 'N')
        .order('created_at', { ascending: true })
    )
  );

  // Step 3: 프로필 조회
  const targetUserIds = Array.from(userLatestDate.keys());
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, nickname, gender, birth_date, region_sido')
    .in('user_id', targetUserIds);

  const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);

  // Step 4: CurationItem 조립
  return videoResults
    .map((result) => {
      const poolEntries = result.data ?? [];
      if (poolEntries.length === 0) return null;

      const uid = poolEntries[0].user_id;
      const profile = profileMap.get(uid);

      const videos: CurationVideo[] = poolEntries.map((entry) => {
        const rawPath = (entry.video_path ?? (entry.logs as any)?.video_url ?? '') as string;
        const videoUrl = rawPath
          ? supabase.storage.from('logs').getPublicUrl(rawPath).data.publicUrl
          : '';
        return { poolId: entry.id, logId: entry.log_id, videoUrl };
      });

      const age = profile?.birth_date
        ? Math.floor(
            (Date.now() - new Date(profile.birth_date).getTime()) /
              (365.25 * 24 * 60 * 60 * 1000)
          )
        : null;

      return {
        userId: uid,
        displayName: profile?.nickname ?? '—',
        gender: profile?.gender ?? null,
        age,
        region: profile?.region_sido ?? null,
        videos,
      };
    })
    .filter((item): item is CurationItem => item !== null);
}

async function checkHasAnyVideo(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('logs')
    .select('id')
    .eq('user_id', userId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export function useHomeScreen(userId: string | undefined) {
  const [screen, setScreen] = useState<HomeScreenType>('loading');
  const [pages, setPages] = useState<CurationItem[][]>([]);
  const [seenUserIds, setSeenUserIds] = useState<string[]>([]);
  const [hasAnyVideo, setHasAnyVideo] = useState(false);
  const [noonBanner, setNoonBanner] = useState(false);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setScreen('loading');
    const [pool, anyVideo] = await Promise.all([
      fetchCurationPool(userId),
      checkHasAnyVideo(userId),
    ]);
    setHasAnyVideo(anyVideo);
    if (pool.length >= 3) {
      setScreen('H2');
      setPages([pool]);
      setSeenUserIds(pool.map((p) => p.userId));
    } else {
      setScreen('H3');
      setPages([]);
    }
  }, [userId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // H2일 때 정오 30초 polling
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      if (now.getHours() === 12 && now.getMinutes() === 0) {
        setNoonBanner(true);
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  // H3일 때 1분 polling — H2 전환 감지
  useEffect(() => {
    if (screen !== 'H3' || !userId) return;
    const timer = setInterval(async () => {
      const pool = await fetchCurationPool(userId);
      if (pool.length >= 3) {
        setScreen('H2');
        setPages([pool]);
        setSeenUserIds(pool.map((p) => p.userId));
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [screen, userId]);

  // foreground 복귀 시 재분기
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchAll();
    });
    return () => sub.remove();
  }, [fetchAll]);

  const handleRefresh = useCallback(async (): Promise<'ok' | 'exhausted'> => {
    if (!userId) return 'exhausted';
    const newPool = await fetchCurationPool(userId, seenUserIds);
    if (newPool.length < 3) return 'exhausted';
    setPages((prev) => [newPool, ...prev]);
    setSeenUserIds((prev) => [...prev, ...newPool.map((p) => p.userId)]);
    return 'ok';
  }, [userId, seenUserIds]);

  const handleDeveloperPaidRefresh = useCallback(async (): Promise<'ok' | 'failed'> => {
    if (!userId || !__DEV__) return 'failed';

    const nextPool = await fetchCurationPool(userId, seenUserIds);
    const fallbackPool = nextPool.length >= 3 ? nextPool : await fetchCurationPool(userId);

    if (fallbackPool.length < 3) return 'failed';

    setPages((prev) => [fallbackPool, ...prev]);
    setSeenUserIds((prev) =>
      Array.from(new Set([...prev, ...fallbackPool.map((p) => p.userId)]))
    );

    return 'ok';
  }, [userId, seenUserIds]);

  const handlePaidRefresh = useCallback(async (): Promise<'ok' | 'exhausted' | 'failed'> => {
    if (!userId) return 'failed';

    const { data, error } = await supabase.rpc('consume_refresh_item', {
      p_seen_user_ids: seenUserIds,
    });

    if (error) {
      if (
        error.message.includes('NO_CANDIDATES') ||
        error.message.includes('NO_AVAILABLE_REFRESH_ITEM')
      ) {
        return 'exhausted';
      }
      return 'failed';
    }

    const nextPool = groupToCurationItems((data ?? []) as PaidRefreshCurationRow[]);

    if (nextPool.length < 3) {
      return 'exhausted';
    }

    setPages((prev) => [nextPool, ...prev]);
    setSeenUserIds((prev) =>
      Array.from(new Set([...prev, ...nextPool.map((p) => p.userId)]))
    );

    return 'ok';
  }, [userId, seenUserIds]);

  const handleNoonRefresh = useCallback(async () => {
    setNoonBanner(false);
    await fetchAll();
  }, [fetchAll]);

  return {
    screen,
    pages,
    currentPool: pages[0] ?? [],
    hasAnyVideo,
    noonBanner,
    handleDeveloperPaidRefresh,
    handlePaidRefresh,
    handleRefresh,
    handleNoonRefresh,
    dismissNoonBanner: () => setNoonBanner(false),
    refresh: fetchAll,
  };
}
