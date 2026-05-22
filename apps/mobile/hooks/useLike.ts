import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { logger } from '@dei/shared';

import { useSendLike } from '@/hooks/useSendLike';
import { getToday } from '@/lib/dateHelpers';
import { supabase } from '@/lib/supabase';

const FREE_DAILY_QUOTA = 1;

export type SendLikeResult =
  | 'already-liked'
  | 'daily-limit'
  | 'failed'
  | 'heart-required'
  | 'sent';

export function useLike(userId: string | undefined) {
  const [likedUserIds, setLikedUserIds] = useState<Set<string>>(new Set());
  const [remainingLikes, setRemainingLikes] = useState(0);
  const [checking, setChecking] = useState(false);
  const { send } = useSendLike();
  const likeUsed = remainingLikes <= 0;

  const checkRemainingLikes = useCallback(async () => {
    if (!userId) {
      setLikedUserIds(new Set());
      setRemainingLikes(0);
      return;
    }

    setChecking(true);
    const today = getToday();
    const todayStart = new Date(`${today}T00:00:00.000+09:00`);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const nowIso = new Date().toISOString();

    try {
      const [todayLikesResult, sentLikesResult] = await Promise.all([
        supabase
          .from('likes')
          .select('id')
          .eq('from_user_id', userId)
          .gte('liked_at', todayStart.toISOString())
          .lt('liked_at', tomorrowStart.toISOString()),
        supabase
          .from('likes')
          .select('to_user_id, status, expires_at')
          .eq('from_user_id', userId)
          .in('status', ['pending', 'accepted']),
      ]);

      if (todayLikesResult.error) throw todayLikesResult.error;
      if (sentLikesResult.error) throw sentLikesResult.error;

      const activeLikedIds =
        sentLikesResult.data
          ?.filter(
            (like) => like.status === 'accepted' || new Date(like.expires_at).toISOString() > nowIso
          )
          .map((like) => like.to_user_id) ?? [];
      const todayLikeCount = todayLikesResult.data?.length ?? 0;

      setLikedUserIds(new Set(activeLikedIds));
      setRemainingLikes(Math.max(0, FREE_DAILY_QUOTA - todayLikeCount));
    } catch (error) {
      logger.captureException(error, {
        tags: { feature: 'likes', action: 'check-remaining' },
        extra: { userId },
      });
      setLikedUserIds(new Set());
      setRemainingLikes(0);
    } finally {
      setChecking(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void checkRemainingLikes();
    }, [checkRemainingLikes])
  );

  const hasLikedUser = useCallback(
    (toUserId: string) => likedUserIds.has(toUserId),
    [likedUserIds]
  );

  const sendLike = useCallback(async (toUserId: string): Promise<SendLikeResult> => {
    if (!userId) return 'failed';
    if (likedUserIds.has(toUserId)) return 'already-liked';

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

    if (result.reason === 'heart_required') {
      setRemainingLikes(0);
      return 'heart-required';
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
