import { useCallback, useEffect, useState } from 'react';

import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';
import type { Database } from '@dei/api';

type LogRow = Database['public']['Tables']['logs']['Row'];

export type DailyLogStatus = 'COMPLETED' | 'INCOMPLETE';

interface Params {
  userId: string;
  date: string;       // YYYY-MM-DD
  startLogId?: string;
}

export function useLogDetail({ userId, date, startLogId }: Params) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<DailyLogStatus>('INCOMPLETE');
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    await logger.withErrorCapture(
      'log-detail.fetch',
      async () => {
        const dayStart = `${date}T00:00:00`;
        const dayEnd = `${date}T23:59:59.999`;

        const { data: rows, error } = await supabase
          .from('logs')
          .select('*')
          .eq('user_id', userId)
          .gte('recorded_at', dayStart)
          .lte('recorded_at', dayEnd)
          .order('recorded_at', { ascending: true });

        if (error) throw error;

        const hourSet = new Set((rows ?? []).map((r) => r.hour_slot));
        setStatus(hourSet.size >= 3 ? 'COMPLETED' : 'INCOMPLETE');
        setLogs(rows ?? []);

        const startIdx = startLogId
          ? (rows ?? []).findIndex((r) => r.id === startLogId)
          : 0;
        setIndex(startIdx >= 0 ? startIdx : 0);
        setLoading(false);
      },
      { tags: { screen: 'log-detail', userId, date } }
    );
  }, [userId, date, startLogId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const next = useCallback(
    () => setIndex((i) => (logs.length > 0 ? (i + 1) % logs.length : 0)),
    [logs.length]
  );
  const prev = useCallback(
    () => setIndex((i) => (logs.length > 0 ? (i - 1 + logs.length) % logs.length : 0)),
    [logs.length]
  );

  return {
    logs,
    index,
    current: logs[index] ?? null,
    status,
    loading,
    next,
    prev,
    refetch: fetch,
  };
}
