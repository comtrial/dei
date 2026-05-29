/**
 * Realtime 채널 규약 (A↔C 합의 · spec §3.3)
 * ------------------------------------------------------------------
 * 방 도메인의 presence·채팅·라이프사이클 신호는 전부 단일 네이밍 규약
 * `room:{roomId}` 채널 위에서 흐른다. 화면/훅은 채널 이름을 직접 문자열로
 * 짜지 말고 반드시 이 모듈의 헬퍼를 거친다 — 그래야 A(방 채팅)·C(영상/방)
 * 가 같은 채널을 보고, 구독 누수 없이 해제된다.
 *
 * 서버 측 RLS·Edge 는 `room` / `room_member` / `message` 테이블만
 * realtime publication 으로 노출한다(spec §5.1). Postgres changes 구독은
 * 그 세 테이블에 한정한다.
 *
 * 담당 경계:
 *   - 채널 네이밍·구독/해제 유틸 = A (이 파일)
 *   - 방 내부 채팅 메시지 송수신 = A
 *   - presence(누가 방에 있나)·영상 신호 = C  (이 규약 위에 구현)
 */
import type { RealtimeChannel } from '@supabase/supabase-js';

import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

/** 방 채널 이름 규약. 다른 곳에서 `room:` 문자열을 직접 쓰지 말 것. */
export function roomChannelName(roomId: string): string {
  return `room:${roomId}`;
}

/**
 * 방 채널을 생성한다(아직 subscribe 하지 않음). presence key 는 호출자가
 * 자신의 user id 로 지정해 누가 들어와 있는지 식별한다.
 */
export function roomChannel(roomId: string, selfUserId?: string): RealtimeChannel {
  return supabase.channel(roomChannelName(roomId), {
    config: {
      presence: selfUserId ? { key: selfUserId } : undefined,
    },
  });
}

/**
 * 방 `message` 행 INSERT 를 구독한다(채팅 수신 경로의 기본 블록).
 * 반환된 unsubscribe 를 effect cleanup 에서 반드시 호출한다(구독 누수 방지).
 */
export function subscribeRoomMessages(
  roomId: string,
  onInsert: (row: Record<string, unknown>) => void,
): () => void {
  const channel = roomChannel(roomId)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'message', filter: `room_id=eq.${roomId}` },
      (payload) => onInsert(payload.new as Record<string, unknown>),
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        logger.captureMessage(`realtime: room ${roomId} 구독 ${status}`, 'warning', {
          tags: { feature: 'realtime', room_id: roomId },
        });
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
