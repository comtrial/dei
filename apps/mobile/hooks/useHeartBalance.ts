import { useCallback, useState } from 'react';

import { useFocusEffect } from 'expo-router';

import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

export function useHeartBalance(userId: string | undefined) {
  const [heartCount, setHeartCount] = useState(0);
  const [refreshItemCount, setRefreshItemCount] = useState(0);
  const [isLoadingHeartBalance, setIsLoadingHeartBalance] = useState(false);

  const refreshHeartBalance = useCallback(async () => {
    if (!userId) {
      setHeartCount(0);
      setRefreshItemCount(0);
      return 0;
    }

    setIsLoadingHeartBalance(true);

    try {
      const [heartResult, refreshItemResult] = await Promise.all([
        supabase.rpc('get_available_heart_count', {
          p_user_id: userId,
        }),
        supabase.rpc('get_available_refresh_item_count', {
          p_user_id: userId,
        }),
      ]);

      if (heartResult.error) throw heartResult.error;
      if (refreshItemResult.error) throw refreshItemResult.error;

      const nextHeartCount = typeof heartResult.data === 'number' ? heartResult.data : 0;
      const nextRefreshItemCount =
        typeof refreshItemResult.data === 'number' ? refreshItemResult.data : 0;

      setHeartCount(nextHeartCount);
      setRefreshItemCount(nextRefreshItemCount);
      return nextHeartCount;
    } catch (error) {
      logger.captureException(error, {
        tags: { feature: 'consumable-balance' },
        extra: { userId },
      });
      setHeartCount(0);
      setRefreshItemCount(0);
      return 0;
    } finally {
      setIsLoadingHeartBalance(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      refreshHeartBalance();
    }, [refreshHeartBalance])
  );

  return {
    heartCount,
    refreshItemCount,
    isLoadingHeartBalance,
    refreshHeartBalance,
    setHeartCount,
    setRefreshItemCount,
  };
}
