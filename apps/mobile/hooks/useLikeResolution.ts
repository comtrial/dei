import { useState } from 'react';

import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

export type ResolveResult =
  | { kind: 'accepted'; matchId: string; counterpartId: string }
  | { kind: 'rejected' }
  | { kind: 'error'; reason: 'expired' | 'not_pending' | 'unknown' };

export function useLikeResolution(likeId: string) {
  const [pending, setPending] = useState(false);

  async function accept(): Promise<ResolveResult> {
    setPending(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('accept_like', { p_like_id: likeId });
      if (error) {
        const reason = parseReason(error.message);
        if (reason === 'unknown') {
          logger.captureException(error, { tags: { feature: 'like-accept', likeId } });
        }
        return { kind: 'error', reason };
      }
      const row = Array.isArray(data) ? data[0] : data;
      return { kind: 'accepted', matchId: row.match_id, counterpartId: row.counterpart_id };
    } finally {
      setPending(false);
    }
  }

  async function reject(): Promise<ResolveResult> {
    setPending(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('reject_like', { p_like_id: likeId });
      if (error) {
        const reason = parseReason(error.message);
        if (reason === 'unknown') {
          logger.captureException(error, { tags: { feature: 'like-reject', likeId } });
        }
        return { kind: 'error', reason };
      }
      return { kind: 'rejected' };
    } finally {
      setPending(false);
    }
  }

  return { accept, reject, pending };
}

function parseReason(message: string): 'expired' | 'not_pending' | 'unknown' {
  if (message.includes('like_expired')) return 'expired';
  if (message.includes('like_not_pending') || message.includes('like_not_rejectable'))
    return 'not_pending';
  return 'unknown';
}
