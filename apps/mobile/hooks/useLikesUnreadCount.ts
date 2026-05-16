import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

export function useLikesUnreadCount(userId: string | undefined) {
  const [count, setCount] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;

    if (channelRef.current) {
      channelRef.current.unsubscribe();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    async function fetch() {
      try {
        const { count: c } = await supabase
          .from('likes')
          .select('id', { count: 'exact', head: true })
          .eq('to_user_id', userId!)
          .eq('status', 'pending')
          .is('read_at', null)
          .gt('expires_at', new Date().toISOString());
        if (alive) setCount(c ?? 0);
      } catch {
        if (alive) setCount(0);
      }
    }

    fetch();

    const channelName = `likes-unread-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ch = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'likes',
          filter: `to_user_id=eq.${userId}`,
        },
        () => fetch()
      )
      .subscribe();

    channelRef.current = ch;

    return () => {
      alive = false;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId]);

  return count;
}
