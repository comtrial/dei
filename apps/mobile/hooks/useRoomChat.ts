/**
 * useRoomChat — 방 채팅: select + send (optimistic) + realtime + retry.
 *
 * 패턴 (옛 1:1 채팅 useChatRoom 구조의 방 단위 일반화):
 *   - 최초 진입 시 최근 N 건 select
 *   - send 시 optimistic insert (status='sending'), Edge 응답 후 sent 로 reconcile
 *   - 실패 시 status='failed' + retry callback 노출
 *   - realtime INSERT 가 들어오면 본인 optimistic 과 dedupe 후 prepend
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { logger } from '@dei/shared';

import { sendChatMessage } from '@/lib/rooms/rooms-service';
import type { ChatBubble } from '@/lib/rooms/types';
import { supabase } from '@/lib/supabase';

const PAGE = 50;

type Row = {
  id: string;
  room_id: string;
  author_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
};

type MentionRow = { message_id: string; mentioned_profile_id: string };

function toBubble(
  row: Row,
  mentions: Map<string, string[]>,
): ChatBubble {
  return {
    id: row.id,
    roomId: row.room_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
    mentions: mentions.get(row.id) ?? [],
    status: 'sent',
  };
}

export function useRoomChat(roomId: string | null | undefined, userId: string | null | undefined) {
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const optimisticRef = useRef<Map<string, ChatBubble>>(new Map());

  const refresh = useCallback(async () => {
    if (!roomId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    const { data: msgs, error } = await supabase
      .from('chat_messages')
      .select('id, room_id, author_id, body, created_at, deleted_at')
      .eq('room_id', roomId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(PAGE);

    if (error) {
      logger.captureException(error, {
        tags: { feature: 'rooms', action: 'fetch-chat' },
        extra: { roomId },
      });
      setMessages([]);
      setLoading(false);
      return;
    }

    const ids = (msgs ?? []).map((m) => m.id);
    const mentionMap = new Map<string, string[]>();
    if (ids.length > 0) {
      const { data: mentions } = await supabase
        .from('chat_mentions')
        .select('message_id, mentioned_profile_id')
        .in('message_id', ids);
      for (const m of (mentions ?? []) as MentionRow[]) {
        const arr = mentionMap.get(m.message_id) ?? [];
        arr.push(m.mentioned_profile_id);
        mentionMap.set(m.message_id, arr);
      }
    }

    setMessages(((msgs ?? []) as Row[]).map((row) => toBubble(row, mentionMap)));
    setLoading(false);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    void refresh();

    const channel = supabase
      .channel(`room-chat-${roomId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', filter: `room_id=eq.${roomId}`, schema: 'public', table: 'chat_messages' },
        async (payload) => {
          const row = payload.new as Row;
          if (row.deleted_at) return;
          // 본인 optimistic 과 dedupe: 같은 author + 같은 body + 1초 이내면 본인 것
          if (row.author_id === userId) {
            const matched = [...optimisticRef.current.values()].find(
              (b) =>
                b.authorId === userId &&
                b.body === row.body &&
                Math.abs(new Date(row.created_at).getTime() - new Date(b.createdAt).getTime()) < 2000,
            );
            if (matched) {
              optimisticRef.current.delete(matched.id);
              setMessages((prev) => prev.map((m) => (m.id === matched.id ? toBubble(row, new Map()) : m)));
              return;
            }
          }
          // 멘션은 별도 select (race 가드)
          const { data: mentions } = await supabase
            .from('chat_mentions')
            .select('mentioned_profile_id')
            .eq('message_id', row.id);
          const ids = (mentions ?? []).map((m) => m.mentioned_profile_id as string);
          setMessages((prev) => [{ ...toBubble(row, new Map([[row.id, ids]])) }, ...prev]);
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
  }, [roomId, userId, refresh]);

  const send = useCallback(
    async (body: string) => {
      if (!roomId || !userId) return { ok: false, reason: 'no-room' as const };
      const trimmed = body.trim();
      if (trimmed.length < 1 || trimmed.length > 500) {
        return { ok: false, reason: 'invalid-length' as const };
      }

      const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const bubble: ChatBubble = {
        id: tempId,
        roomId,
        authorId: userId,
        body: trimmed,
        createdAt: new Date().toISOString(),
        mentions: [],
        isOptimistic: true,
        status: 'sending',
      };
      optimisticRef.current.set(tempId, bubble);
      setMessages((prev) => [bubble, ...prev]);
      setSending(true);

      try {
        await sendChatMessage({ roomId, body: trimmed });
        // 실제 row 가 realtime 으로 들어오면 dedupe → optimistic 제거 됨.
        // 만약 realtime 이 늦으면 optimistic 이 'sending' 상태로 남으므로 1.5s 후
        // status='sent' 로 자체 마킹 (race-safe).
        setTimeout(() => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId && m.status === 'sending' ? { ...m, status: 'sent' } : m,
            ),
          );
        }, 1500);
        return { ok: true as const };
      } catch (e) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)),
        );
        return { ok: false, reason: 'send-error' as const, error: e };
      } finally {
        setSending(false);
      }
    },
    [roomId, userId],
  );

  const retry = useCallback(
    async (tempId: string) => {
      const bubble = messages.find((m) => m.id === tempId && m.status === 'failed');
      if (!bubble) return { ok: false as const };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'sending' } : m)),
      );
      try {
        await sendChatMessage({ roomId: bubble.roomId, body: bubble.body });
        setTimeout(() => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId && m.status === 'sending' ? { ...m, status: 'sent' } : m,
            ),
          );
        }, 1500);
        return { ok: true as const };
      } catch (e) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)),
        );
        return { ok: false as const, error: e };
      }
    },
    [messages],
  );

  return useMemo(
    () => ({ messages, loading, sending, send, retry, refresh }),
    [messages, loading, sending, send, retry, refresh],
  );
}
