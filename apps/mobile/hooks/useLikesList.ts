import { useCallback, useState } from 'react';

import { useFocusEffect } from 'expo-router';

import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

export type LikeWithProfile = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  liked_at: string;
  expires_at: string;
  read_at: string | null;
  status: string;
  attached_log_id: string | null;
  counterpart: {
    user_id: string;
    nickname: string | null;
    birth_date: string | null;
    region_sido: string | null;
  };
};

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  return Math.floor(
    (Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );
}

export function getAge(item: LikeWithProfile): number | null {
  return calcAge(item.counterpart?.birth_date ?? null);
}

export function useLikesList(mode: 'received' | 'sent', userId: string | undefined) {
  const [items, setItems] = useState<LikeWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);

    try {
      // lazy expire — RPC는 마이그레이션 적용 후 활성화
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)('expire_overdue_likes', { p_user_id: userId });

      const selfField = mode === 'received' ? 'to_user_id' : 'from_user_id';
      const joinField = mode === 'received' ? 'from_user_id' : 'to_user_id';

      // 마이그레이션 전 타입에 status/expires_at 없음 → any 캐스트
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query = (supabase.from('likes') as any)
        .select(
          `id, from_user_id, to_user_id, liked_at, expires_at, read_at, status, attached_log_id,
           counterpart:profiles!likes_${joinField === 'from_user_id' ? 'from' : 'to'}_profile_fkey(user_id, nickname, birth_date, region_sido)`
        )
        .eq(selfField, userId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('liked_at', { ascending: false });

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setItems((data ?? []) as unknown as LikeWithProfile[]);

      // 받은 목록: 화면 진입 시 미열람 일괄 read 처리
      if (mode === 'received') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('likes') as any)
          .update({ read_at: new Date().toISOString() })
          .eq('to_user_id', userId)
          .eq('status', 'pending')
          .is('read_at', null);
      }
    } catch (e) {
      logger.captureException(e as Error, { tags: { feature: 'likes-list', mode } });
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [userId, mode]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return { items, loading, error, refresh };
}
