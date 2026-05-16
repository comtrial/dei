import { useEffect, useState } from 'react';

import { getToday } from '@/lib/dateHelpers';
import { getTimeOfDay } from '@/lib/timeOfDay';
import { supabase } from '@/lib/supabase';

function getSlotRange(hour: number): { min: number; max: number } {
  if (hour < 5)  return { min: 0,  max: 4  }; // 새벽
  if (hour < 12) return { min: 5,  max: 11 }; // 오전
  if (hour < 17) return { min: 12, max: 16 }; // 낮
  if (hour < 21) return { min: 17, max: 20 }; // 저녁
  return           { min: 21, max: 23 };       // 밤
}

export function useTodayClip(userId: string | undefined) {
  const [hasClipInCurrentSlot, setHasClipInCurrentSlot] = useState(false);
  const [currentSlotLabel, setCurrentSlotLabel] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const hour = new Date().getHours();
    const label = getTimeOfDay(hour);
    const { min, max } = getSlotRange(hour);
    const today = getToday();

    setCurrentSlotLabel(label);

    if (!userId) {
      setHasClipInCurrentSlot(false);
      setIsLoading(false);
      return;
    }

    supabase
      .from('logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('hour_slot', min)
      .lte('hour_slot', max)
      .gte('recorded_at', `${today}T00:00:00.000Z`)
      .lte('recorded_at', `${today}T23:59:59.999Z`)
      .then(({ count }) => {
        setHasClipInCurrentSlot((count ?? 0) > 0);
        setIsLoading(false);
      });
  }, [userId]);

  return { hasClipToday: hasClipInCurrentSlot, currentSlotLabel, isLoading };
}
