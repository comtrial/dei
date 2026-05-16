import { useState } from 'react';

import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

export type DeleteResult =
  | { kind: 'ok-remaining'; remainingStatus: 'COMPLETED' | 'INCOMPLETE'; remainingCount: number }
  | { kind: 'ok-day-empty' }
  | { kind: 'error'; message: string };

interface DeleteArgs {
  logId: string;
  videoUrl: string;
  date: string;
  userId: string;
}

export function useDeleteLog() {
  const [pending, setPending] = useState(false);

  async function deleteLog({ logId, videoUrl, date, userId }: DeleteArgs): Promise<DeleteResult> {
    setPending(true);
    try {
      // 1) Storage 삭제 — 실패해도 row 삭제 진행 (orphan 허용)
      const { error: storageErr } = await supabase.storage.from('logs').remove([videoUrl]);
      if (storageErr) {
        logger.captureMessage('log-delete: storage remove failed', 'warning');
      }

      // 2) logs row 삭제
      const { error: deleteErr } = await supabase
        .from('logs')
        .delete()
        .eq('id', logId)
        .eq('user_id', userId);

      if (deleteErr) {
        logger.captureException(deleteErr, {
          tags: { feature: 'log-delete', stage: 'row-delete' },
          extra: { logId, userId },
        });
        return { kind: 'error', message: deleteErr.message };
      }

      // 3) 재계산 RPC — 마이그레이션 후 활성화
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dailyRow, error: rpcErr } = await (supabase.rpc as any)(
        'recalculate_daily_log_for_date',
        { p_user_id: userId, p_log_date: date }
      );

      if (rpcErr) {
        logger.captureException(rpcErr, {
          tags: { feature: 'log-delete', stage: 'recalc' },
          extra: { logId, userId, date },
        });
        return { kind: 'error', message: rpcErr.message };
      }

      if (!dailyRow) {
        return { kind: 'ok-day-empty' };
      }

      // 남은 로그 수
      const { count } = await supabase
        .from('logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('recorded_at', `${date}T00:00:00`)
        .lte('recorded_at', `${date}T23:59:59.999`);

      return {
        kind: 'ok-remaining',
        remainingStatus: (dailyRow as { status: string }).status as 'COMPLETED' | 'INCOMPLETE',
        remainingCount: count ?? 0,
      };
    } finally {
      setPending(false);
    }
  }

  return { deleteLog, pending };
}
