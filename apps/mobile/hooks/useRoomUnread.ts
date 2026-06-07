// apps/mobile/hooks/useRoomUnread.ts
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';
import { subscribeRoomMessages } from '@/lib/realtime';
import { hasUnread } from '@/lib/chat/unread';

/**
 * 방 화면 채팅 버튼의 unread 점 상태.
 *  - 진입/재포커스 시 본인 room_member.last_read_at 조회(채팅 보고 오면 점 사라짐).
 *  - "내가 안 보낸 최신 메시지" 시각을 초기 1회 + realtime 으로 추적.
 *  - 조회 실패는 회복 가능(점 부정확) → 캡처만, 기본은 "점 숨김"(미탐) 안전측.
 */
export function useRoomUnread(roomId: string | undefined, selfId: string | null) {
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [latestOthersAt, setLatestOthersAt] = useState<string | null>(null);

  // 본인 last_read_at 조회(진입 + 재포커스). 채팅에서 돌아오면 갱신 → 점 사라짐.
  const refetchLastRead = useCallback(async () => {
    if (!roomId || !selfId) return;
    const { data, error } = await supabase
      .from('room_member')
      .select('last_read_at')
      .eq('room_id', roomId)
      .eq('user_id', selfId)
      .maybeSingle();
    if (error) {
      logger.captureException(error, {
        tags: { feature: 'chat-unread', step: 'last-read', room_id: roomId },
      });
      return;
    }
    setLastReadAt((data?.last_read_at as string | null) ?? null);
  }, [roomId, selfId]);

  useFocusEffect(
    useCallback(() => {
      void refetchLastRead();
    }, [refetchLastRead]),
  );

  // "내가 안 보낸" 최신 메시지 시각: 초기 1회 조회.
  useEffect(() => {
    if (!roomId || !selfId) return;
    let alive = true;
    void (async () => {
      const { data, error } = await supabase
        .from('message')
        .select('created_at,user_id')
        .eq('room_id', roomId)
        .neq('user_id', selfId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (!alive) return;
      if (error) {
        logger.captureException(error, {
          tags: { feature: 'chat-unread', step: 'latest-others', room_id: roomId },
        });
        return;
      }
      const latest = data?.[0]?.created_at as string | undefined;
      if (latest) setLatestOthersAt((prev) => (prev && prev > latest ? prev : latest));
    })();
    return () => {
      alive = false;
    };
  }, [roomId, selfId]);

  // realtime: 들어온 메시지가 "남의 것"이면 최신 시각 갱신.
  useEffect(() => {
    if (!roomId || !selfId) return;
    const unsub = subscribeRoomMessages(roomId, (row) => {
      if (String(row.user_id) === selfId) return;
      const at = row.created_at as string | undefined;
      if (!at) return;
      setLatestOthersAt((prev) => (prev && prev > at ? prev : at));
    });
    return unsub;
  }, [roomId, selfId]);

  return { hasUnread: hasUnread(latestOthersAt, lastReadAt) };
}
