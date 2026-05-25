import { useState } from 'react';

import { analytics, logger } from '@dei/shared';

import { getFunctionErrorMessage } from '@/lib/function-errors';
import { supabase } from '@/lib/supabase';

export type ResolveResult =
  | { kind: 'accepted'; matchId: string; counterpartId: string; conversationId?: string | null }
  | { kind: 'rejected' }
  | { kind: 'error'; reason: 'expired' | 'not_pending' | 'unknown' };

export function useLikeResolution(likeId: string, likedAt?: string) {
  const [pending, setPending] = useState(false);

  async function accept(): Promise<ResolveResult> {
    setPending(true);
    try {
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke<{
        conversationId?: string | null;
        counterpartId?: string;
        error?: string;
        matchId?: string;
      }>('accept-like', { body: { likeId } });

      if (!edgeError && edgeData?.matchId && edgeData.counterpartId) {
        captureAcceptedLikeAnalytics(edgeData.counterpartId, likedAt);

        return {
          kind: 'accepted',
          conversationId: edgeData.conversationId ?? null,
          matchId: edgeData.matchId,
          counterpartId: edgeData.counterpartId,
        };
      }

      if (edgeError) {
        logger.captureException(edgeError, {
          tags: { feature: 'like-accept', layer: 'edge', likeId },
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('accept_like', { p_like_id: likeId });
      if (error) {
        const message = edgeError ? await getFunctionErrorMessage(edgeError, error.message) : error.message;
        const reason = parseReason(error.message || message);
        if (reason === 'unknown') {
          logger.captureException(error, { tags: { feature: 'like-accept', likeId } });
        }
        return { kind: 'error', reason };
      }
      const row = Array.isArray(data) ? data[0] : data;
      const counterpartId = row.counterpart_id;

      captureAcceptedLikeAnalytics(counterpartId, likedAt);

      return { kind: 'accepted', matchId: row.match_id, counterpartId };
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

function captureAcceptedLikeAnalytics(counterpartId: string, likedAt?: string) {
  // LK5 받은 좋아요 수락 성공.
  analytics.capture('like_accepted', {
    peer_user_id: counterpartId,
    since_received_sec: likedAt
      ? Math.max(0, Math.round((Date.now() - new Date(likedAt).getTime()) / 1000))
      : undefined,
  });

  // 매칭 생성을 client 가 확인한 시점.
  analytics.capture('match_created_in_db', {
    peer_user_id: counterpartId,
    source: 'accept',
  });
}

function parseReason(message: string): 'expired' | 'not_pending' | 'unknown' {
  if (message.includes('like_expired')) return 'expired';
  if (message.includes('like_not_pending') || message.includes('like_not_rejectable'))
    return 'not_pending';
  return 'unknown';
}
