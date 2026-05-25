/**
 * useMatchQueue — 본인의 매칭 큐 상태 + realtime.
 *
 * `match_queue.consumed_at` 가 NULL → NULL 아님 으로 바뀌면 매칭 성사.
 * RPC `admin_create_room` 이 trigger 하므로 클라는 status 변화만 감지.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

export type MatchQueueState = {
  queueId: string | null;
  groupId: string | null;
  enqueuedAt: string | null;
  consumedAt: string | null;
  /** true 면 곧 방으로 라우팅 (matched_room_id 확인 후) */
  matched: boolean;
};

const EMPTY: MatchQueueState = {
  queueId: null,
  groupId: null,
  enqueuedAt: null,
  consumedAt: null,
  matched: false,
};

export function useMatchQueue(groupId: string | null | undefined) {
  const [state, setState] = useState<MatchQueueState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const refresh = useCallback(async () => {
    if (!groupId) {
      setState(EMPTY);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('match_queue')
      .select('id, group_id, enqueued_at, consumed_at')
      .eq('group_id', groupId)
      .maybeSingle();

    if (error) {
      logger.captureException(error, {
        tags: { feature: 'group', action: 'fetch-queue' },
        extra: { groupId },
      });
      setState(EMPTY);
    } else if (data) {
      setState({
        queueId: data.id,
        groupId: data.group_id,
        enqueuedAt: data.enqueued_at,
        consumedAt: data.consumed_at,
        matched: Boolean(data.consumed_at),
      });
    } else {
      setState(EMPTY);
    }
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    void refresh();

    const channel = supabase
      .channel(`match-queue-${groupId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `group_id=eq.${groupId}`,
          schema: 'public',
          table: 'match_queue',
        },
        () => {
          void refresh();
        },
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [groupId, refresh]);

  return { state, loading, refresh };
}
