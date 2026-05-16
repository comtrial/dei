import { useCallback, useState } from 'react';

import { getToday } from '@/lib/dateHelpers';
import { supabase } from '@/lib/supabase';

export type SendLikeResult = 'already-liked' | 'daily-limit' | 'failed' | 'sent';

export function useLike(userId: string | undefined) {
  const [likedUserIds, setLikedUserIds] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const likeUsed = likedUserIds.size > 0;

  const checkLikeUsed = useCallback(async () => {
    if (!userId) return;
    setChecking(true);
    const today = getToday();
    const { data } = await supabase
      .from('likes')
      .select('to_user_id')
      .eq('from_user_id', userId)
      .gte('liked_at', `${today}T00:00:00.000Z`);

    setLikedUserIds(new Set(data?.map((like) => like.to_user_id) ?? []));
    setChecking(false);
  }, [userId]);

  const hasLikedUser = useCallback(
    (toUserId: string) => likedUserIds.has(toUserId),
    [likedUserIds]
  );

  const sendLike = useCallback(async (toUserId: string): Promise<SendLikeResult> => {
    if (!userId) return 'failed';
    if (likedUserIds.has(toUserId)) return 'already-liked';
    if (likeUsed) return 'daily-limit';

    const { error } = await supabase.from('likes').insert({
      from_user_id: userId,
      to_user_id: toUserId,
      liked_at: new Date().toISOString(),
    });

    if (!error) {
      setLikedUserIds((prev) => new Set(prev).add(toUserId));
      return 'sent';
    }

    return 'failed';
  }, [likedUserIds, likeUsed, userId]);

  return { checking, checkLikeUsed, hasLikedUser, likeUsed, sendLike };
}
