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
      // 1) Storage 삭제가 실패하면 DB row 삭제도 중단해 재시도 가능하게 둔다.
      const { error: storageErr } = await supabase.storage.from('logs').remove([videoUrl]);
      if (storageErr) {
        logger.captureException(storageErr, {
          tags: { feature: 'log-delete', stage: 'storage-remove' },
          extra: { logId, userId, date },
        });
        return { kind: 'error', message: storageErr.message };
      }

      const { data, error: rpcErr } = await supabase.rpc('delete_own_log_and_recalculate', {
        p_log_id: logId,
      });

      if (rpcErr) {
        logger.captureException(rpcErr, {
          tags: { feature: 'log-delete', stage: 'delete-and-recalc' },
          extra: { logId, userId, date },
        });
        return { kind: 'error', message: rpcErr.message };
      }

      const resultRow = Array.isArray(data) ? data[0] : data;

      if (!resultRow || resultRow.remaining_count === 0 || resultRow.status == null) {
        return { kind: 'ok-day-empty' };
      }

      return {
        kind: 'ok-remaining',
        remainingStatus: resultRow.status as 'COMPLETED' | 'INCOMPLETE',
        remainingCount: resultRow.remaining_count,
      };
    } finally {
      setPending(false);
    }
  }

  return { deleteLog, pending };
}
