import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { getTimeOfDay } from '@/lib/timeOfDay';
import { supabase } from '@/lib/supabase';

export function useTodayClip() {
  const [hasClipInCurrentSlot, setHasClipInCurrentSlot] = useState(false);
  const [currentSlotLabel, setCurrentSlotLabel] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // 화면 포커스마다 재조회 — 탭 이동 후 돌아와도 최신 상태 반영
  useFocusEffect(
    useCallback(() => {
      const hour = new Date().getHours();
      const label = getTimeOfDay(hour);
      const today = new Date().toISOString().slice(0, 10);

      setCurrentSlotLabel(label);
      setIsLoading(true);

      supabase
        .from('logs')
        .select('id', { count: 'exact', head: true })
        .eq('hour_slot', hour)
        .gte('recorded_at', `${today}T00:00:00.000Z`)
        .lte('recorded_at', `${today}T23:59:59.999Z`)
        .then(({ count }) => {
          setHasClipInCurrentSlot((count ?? 0) > 0);
          setIsLoading(false);
        });
    }, [])
  );

  return { hasClipToday: hasClipInCurrentSlot, currentSlotLabel, isLoading };
}
