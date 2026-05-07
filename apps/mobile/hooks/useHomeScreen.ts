import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getDailyLogProgress, type DailyLogProgress, type TodayLog } from '@/lib/dailyLog';
import { getToday, getYesterday } from '@/lib/dateHelpers';
import { supabase } from '@/lib/supabase';

export type HomeScreenType = 'loading' | 'H2' | 'H3';

export interface CurationItem {
  poolId: string;
  userId: string;
  logId: string;
  videoUrl: string;
  displayName: string;
  gender: string | null;
}

async function fetchCurationPool(
  userId: string,
  excludeUserIds: string[] = []
): Promise<CurationItem[]> {
  const hour = new Date().getHours();
  const poolDate = hour < 12 ? getYesterday() : getToday();

  const query = supabase
    .from('curation_pool')
    .select('id, user_id, log_id, video_path, logs(video_url)')
    .eq('pool_date', poolDate)
    .neq('user_id', userId)
    .eq('검수_YN', 'Y')
    .eq('차단_YN', 'N')
    .limit(3);

  if (excludeUserIds.length > 0) {
    query.not('user_id', 'in', `(${excludeUserIds.join(',')})`);
  }

  const { data: poolData } = await query;
  if (!poolData || poolData.length === 0) return [];

  const userIds = poolData.map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, nickname, gender')
    .in('user_id', userIds);

  const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);

  return poolData.map((entry) => {
    const profile = profileMap.get(entry.user_id);
    const rawPath = (entry.video_path ?? (entry.logs as any)?.video_url ?? '') as string;
    const videoUrl = rawPath
      ? supabase.storage.from('logs').getPublicUrl(rawPath).data.publicUrl
      : '';

    return {
      poolId: entry.id,
      userId: entry.user_id,
      logId: entry.log_id,
      videoUrl,
      displayName: profile?.nickname ?? '—',
      gender: profile?.gender ?? null,
    };
  });
}

async function fetchTodayLogs(userId: string): Promise<TodayLog[]> {
  const today = getToday();
  const { data } = await supabase
    .from('logs')
    .select('id, recorded_at, hour_slot')
    .eq('user_id', userId)
    .gte('recorded_at', `${today}T00:00:00.000Z`);
  return (data as TodayLog[]) ?? [];
}

export function useHomeScreen(userId: string | undefined) {
  const [screen, setScreen] = useState<HomeScreenType>('loading');
  const [pages, setPages] = useState<CurationItem[][]>([]);
  const [seenUserIds, setSeenUserIds] = useState<string[]>([]);
  const [todayLogs, setTodayLogs] = useState<TodayLog[]>([]);
  const [noonBanner, setNoonBanner] = useState(false);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setScreen('loading');
    const [pool, logs] = await Promise.all([
      fetchCurationPool(userId),
      fetchTodayLogs(userId),
    ]);
    setTodayLogs(logs);
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

  const handleNoonRefresh = useCallback(async () => {
    setNoonBanner(false);
    await fetchAll();
  }, [fetchAll]);

  const logProgress: DailyLogProgress = getDailyLogProgress(todayLogs);

  return {
    screen,
    pages,
    currentPool: pages[0] ?? [],
    logProgress,
    hasLog: todayLogs.length > 0,
    noonBanner,
    handleRefresh,
    handleNoonRefresh,
    dismissNoonBanner: () => setNoonBanner(false),
    refresh: fetchAll,
  };
}
