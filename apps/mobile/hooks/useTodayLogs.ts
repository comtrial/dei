import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Database } from '@dei/api';
import { getTodayKST } from '@/lib/formatters';

type LogRow = Database['public']['Tables']['logs']['Row'];

export function useTodayLogs(userId: string | undefined) {
  const [items, setItems] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let alive = true;

    (async () => {
      const today = getTodayKST();
      const { data } = await supabase
        .from('logs')
        .select('*')
        .eq('user_id', userId)
        .gte('recorded_at', `${today}T00:00:00`)
        .lt('recorded_at', `${today}T23:59:59.999`)
        .order('hour_slot', { ascending: true });
      if (alive) {
        setItems(data ?? []);
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [userId]);

  return { items, loading };
}
