import { useCallback, useState } from 'react';

import { useSendLike } from '@/hooks/useSendLike';
import { getToday } from '@/lib/dateHelpers';
import { supabase } from '@/lib/supabase';

const FREE_DAILY_QUOTA = 1;

export type SendLikeResult = 'already-liked' | 'daily-limit' | 'failed' | 'sent';

export function useLike(userId: string | undefined) {
  const [likedUserIds, setLikedUserIds] = useState<Set<string>>(new Set());
  const [remainingLikes, setRemainingLikes] = useState(0);
  const [checking, setChecking] = useState(false);
  const { send } = useSendLike();
  const likeUsed = remainingLikes <= 0;

  const checkRemainingLikes = useCallback(async () => {
    if (!userId) return;
    setChecking(true);
    const today = getToday();
    const { data } = await supabase
      .from('likes')
      .select('to_user_id')
      .eq('from_user_id', userId)
      .gte('liked_at', `${today}T00:00:00.000Z`);

    const likedIds = data?.map((like) => like.to_user_id) ?? [];
    setLikedUserIds(new Set(likedIds));
    setRemainingLikes(Math.max(0, FREE_DAILY_QUOTA - likedIds.length));
    setChecking(false);
  }, [userId]);

  const hasLikedUser = useCallback(
    (toUserId: string) => likedUserIds.has(toUserId),
    [likedUserIds]
  );

  const sendLike = useCallback(async (toUserId: string): Promise<SendLikeResult> => {
    if (!userId) return 'failed';
    if (likedUserIds.has(toUserId)) return 'already-liked';
    if (remainingLikes <= 0) return 'daily-limit';

    const result = await send({ toUserId, attachedLogId: null });
    if (result.kind === 'ok') {
      setLikedUserIds((prev) => new Set(prev).add(toUserId));
      setRemainingLikes((prev) => Math.max(0, prev - 1));
      return 'sent';
    }

    if (result.reason === 'daily_quota_exceeded') {
      setRemainingLikes(0);
      return 'daily-limit';
    }

    if (result.reason === 'already_pending' || result.reason === 'already_matched') {
      setLikedUserIds((prev) => new Set(prev).add(toUserId));
      return 'already-liked';
    }

    return 'failed';
  }, [likedUserIds, remainingLikes, send, userId]);

  return {
    checking,
    checkRemainingLikes,
    hasLikedUser,
    likeUsed,
    remainingLikes,
    sendLike,
  };
}
