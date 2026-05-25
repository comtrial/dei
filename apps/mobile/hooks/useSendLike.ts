import { useState } from 'react';

import { analytics, logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

export type SendLikeError =
  | 'no_video_history'
  | 'daily_quota_exceeded'
  | 'already_pending'
  | 'already_matched'
  | 'attached_log_not_owned'
  | 'heart_required'
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
    usedGrant,
  }: {
    toUserId: string;
    attachedLogId: string | null;
    usedGrant?: boolean;
  }): Promise<SendResult> {
    setPending(true);
    try {
      // LK12 보내기: 좋아요 제출 시점(검증 통과 후 RPC 호출 직전).
      analytics.capture('like_sent', {
        peer_user_id: toUserId,
        attached_log_id: attachedLogId ?? undefined,
        used_grant: usedGrant,
      });

      const { error } = await supabase.rpc('send_like', {
        p_to_user_id: toUserId,
        p_attached_log_id: attachedLogId ?? undefined,
      });

      if (error) {
        const reason = parseReason(error.message);
        if (reason === 'unknown') {
          logger.captureException(error, { tags: { feature: 'send-like', toUserId } });
        }
        return { kind: 'error', reason };
      }

      // send_like RPC 200 응답 직후 — client 가 발송 성공을 확인한 시점.
      // RPC(SQL)는 HTTP 를 못 쏘므로 호출자 측에서 persisted 를 capture 한다.
      analytics.capture('like_send_persisted', {
        peer_user_id: toUserId,
      });

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
  if (message.includes('heart_required')) return 'heart_required';
  if (message.includes('self_like_forbidden')) return 'self_like_forbidden';
  return 'unknown';
}
