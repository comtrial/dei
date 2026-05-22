import { useCallback, useState } from 'react';

import { useFocusEffect } from 'expo-router';

import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

export function useHeartBalance(userId: string | undefined) {
  const [heartCount, setHeartCount] = useState(0);
  const [isLoadingHeartBalance, setIsLoadingHeartBalance] = useState(false);

  const refreshHeartBalance = useCallback(async () => {
    if (!userId) {
      setHeartCount(0);
      return 0;
    }

    setIsLoadingHeartBalance(true);

    try {
      // Paid refresh grants are the current server-owned consumable heart ledger.
      const { data, error } = await supabase.rpc('get_available_refresh_item_count', {
        p_user_id: userId,
      });

      if (error) throw error;

      const nextCount = typeof data === 'number' ? data : 0;
      setHeartCount(nextCount);
      return nextCount;
    } catch (error) {
      logger.captureException(error, {
        tags: { feature: 'heart-balance' },
        extra: { userId },
      });
      setHeartCount(0);
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
    isLoadingHeartBalance,
    refreshHeartBalance,
    setHeartCount,
  };
}
