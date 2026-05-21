import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { getToday } from '@/lib/dateHelpers';
import { supabase } from '@/lib/supabase';

export function useTodayClip(userId: string | undefined) {
  const [hasClipInCurrentSlot, setHasClipInCurrentSlot] = useState(false);
  const [currentSlotLabel, setCurrentSlotLabel] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const hour = new Date().getHours();
      // 시 단위 슬롯 라벨 ("21:00") — 저장 정책과 일치 (useSaveLog 도 hour_slot 시 단위 저장)
      const label = `${String(hour).padStart(2, '0')}:00`;
      const today = getToday();

      setCurrentSlotLabel(label);
      setIsLoading(true);

      if (!userId) {
        setHasClipInCurrentSlot(false);
        setIsLoading(false);
        return;
      }

      supabase
        .from('logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('hour_slot', hour) // 정확히 같은 시 슬롯만 (카테고리 범위 아님)
        .gte('recorded_at', `${today}T00:00:00.000Z`)
        .lte('recorded_at', `${today}T23:59:59.999Z`)
        .then(({ count }) => {
          setHasClipInCurrentSlot((count ?? 0) > 0);
          setIsLoading(false);
        });
    }, [userId])
  );

  return { hasClipToday: hasClipInCurrentSlot, currentSlotLabel, isLoading };
}
