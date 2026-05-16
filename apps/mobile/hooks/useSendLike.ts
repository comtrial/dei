import { useState } from 'react';

import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

export type SendLikeError =
  | 'no_video_history'
  | 'daily_quota_exceeded'
  | 'already_pending'
  | 'already_matched'
  | 'attached_log_not_owned'
  | 'self_like_forbidden'
  | 'unknown';

export type SendResult =
  | { kind: 'ok' }
  | { kind: 'error'; reason: SendLikeError };

export function useSendLike() {
  const [pending, setPending] = useState(false);

  async function send({
    toUserId,
    attachedLogId,
  }: {
    toUserId: string;
    attachedLogId: string | null;
  }): Promise<SendResult> {
    setPending(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('send_like', {
        p_to_user_id: toUserId,
        p_attached_log_id: attachedLogId,
      });

      if (error) {
        const reason = parseReason(error.message);
        if (reason === 'unknown') {
          logger.captureException(error, { tags: { feature: 'send-like', toUserId } });
        }
        return { kind: 'error', reason };
      }

      return { kind: 'ok' };
    } finally {
      setPending(false);
    }
  }

  return { send, pending };
}

function parseReason(message: string): SendLikeError {
  if (message.includes('no_video_history')) return 'no_video_history';
  if (message.includes('daily_quota_exceeded')) return 'daily_quota_exceeded';
  if (message.includes('already_pending')) return 'already_pending';
  if (message.includes('already_matched')) return 'already_matched';
  if (message.includes('attached_log_not_owned')) return 'attached_log_not_owned';
  if (message.includes('self_like_forbidden')) return 'self_like_forbidden';
  return 'unknown';
}
