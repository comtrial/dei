/**
 * Chat data-access layer — Supabase 쿼리 / RPC / Edge Function / Realtime.
 *
 * Backend Agent 인터페이스 (작업 지시 그대로):
 *   - 테이블: conversations, messages
 *   - RPC: send_message(p_conversation_id, p_body) / leave_conversation(p_conversation_id)
 *   - Edge: POST /functions/v1/send-message , /functions/v1/leave-conversation
 *           (body { conversationId, body }) → 200 {message} / 4xx {error,reason,retryable}
 *   - Realtime: messages INSERT / conversations UPDATE
 *
 * 전송은 Edge Function 우선 (서버측 차단/상태 재검증 + 명시적 reason/retryable),
 * Edge 호출 자체가 실패하면 RPC 폴백 (race 방지 동일 트랜잭션).
 *
 * supabase 클라이언트는 chat 테이블 타입을 모르므로 (Docker 부재로 db.types
 * 미갱신) `as never` / 로컬 타입 캐스팅으로 우회. 스키마 권위 소스는
 * supabase/migrations/20260516120000_chat_conversations_messages.sql.
 */
import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

import { classifySendFailure, type SendFailure } from './message';
import type {
  ChatListItem,
  ConversationRow,
  MessageRow,
  SendMessageResult,
} from './types';

// chat 테이블은 generated Database 타입에 없음 (Docker 부재로 db.types 미갱신)
// → from() / rpc() 호출 시 타입 우회. 스키마 권위 소스는 chat 마이그레이션.
const tbl = (name: string) => (supabase as any).from(name);
const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase as unknown as {
    rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  }).rpc(name, args);

function otherUserId(c: Pick<ConversationRow, 'user_a_id' | 'user_b_id'>, me: string): string {
  return c.user_a_id === me ? c.user_b_id : c.user_a_id;
}

/**
 * CH1 채팅 목록. RLS 가 참여자 + 미차단만 노출하므로 추가 필터 불필요.
 * status=DELETED 는 제외 (양쪽 삭제 → 빈 상태로 흡수, DEV-SPEC CH3).
 * updated_at desc 정렬.
 */
export async function fetchChatList(myUserId: string): Promise<ChatListItem[]> {
  const { data: convs, error } = await tbl('conversations')
    .select(
      'id, match_id, user_a_id, user_b_id, status, last_message_preview, last_message_at, updated_at',
    )
    .neq('status', 'DELETED')
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message ?? 'failed to load conversations');
  }

  const rows = (convs ?? []) as ConversationRow[];
  if (rows.length === 0) return [];

  const otherIds = Array.from(new Set(rows.map((c) => otherUserId(c, myUserId))));

  const { data: profiles } = await tbl('profiles')
    .select('user_id, nickname, photo_url')
    .in('user_id', otherIds);

  const profileRows = (profiles ?? []) as {
    user_id: string;
    nickname: string | null;
    photo_url: string | null;
  }[];

  const nicknameById = new Map<string, string>(
    profileRows.map((p) => [p.user_id, p.nickname ?? '익명']),
  );

  // photo_url 은 storage 경로 → signed URL 로 변환 (병렬). 실패/부재 시 null.
  const photoEntries = await Promise.all(
    profileRows.map(async (p) => [p.user_id, await signedProfileImage(p.photo_url)] as const),
  );
  const photoById = new Map<string, string | null>(photoEntries);

  return rows.map((c) => {
    const oid = otherUserId(c, myUserId);
    return {
      conversationId: c.id,
      otherUserId: oid,
      otherNickname: nicknameById.get(oid) ?? '익명',
      otherPhotoUrl: photoById.get(oid) ?? null,
      lastMessagePreview: c.last_message_preview,
      updatedAt: c.updated_at,
      status: c.status,
    } satisfies ChatListItem;
  });
}

/** profile-images storage 경로 → 1시간 signed URL. 경로 없거나 실패 시 null. */
async function signedProfileImage(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from('profile-images')
    .createSignedUrl(path, 60 * 60);
  if (error) {
    logger.captureException(error, {
      tags: { feature: 'chat-list', storageBucket: 'profile-images' },
    });
    return null;
  }
  return data?.signedUrl ?? null;
}

/** CH2 헤더용 상대 프로필 (닉네임 + signed 사진 URL). */
export interface OtherProfile {
  nickname: string;
  photoUrl: string | null;
}

/**
 * 상대 user_id 로 공개 프로필(닉네임/사진) 조회. 채팅방 헤더 표시용.
 * profiles RLS 가 인증 유저에게 활성 프로필 읽기를 허용한다.
 */
export async function fetchOtherProfile(userId: string): Promise<OtherProfile | null> {
  const { data } = await tbl('profiles')
    .select('nickname, photo_url')
    .eq('user_id', userId)
    .maybeSingle();
  const row = data as { nickname: string | null; photo_url: string | null } | null;
  if (!row) return null;
  return {
    nickname: row.nickname ?? '익명',
    photoUrl: await signedProfileImage(row.photo_url),
  };
}

export interface ConversationGate {
  conversation: { status: ConversationRow['status']; otherUserId: string } | null;
  isBlocked: boolean;
}

/**
 * CH0 게이트용 조회. conversation row + 양방향 차단 여부.
 * RLS 로 차단 시 conversation 이 안 보일 수 있어 blocks 를 별도 RPC 로 조회한다.
 */
export async function loadConversationGate(
  conversationId: string,
  myUserId: string,
): Promise<ConversationGate> {
  const { data: conv } = await tbl('conversations')
    .select('id, user_a_id, user_b_id, status')
    .eq('id', conversationId)
    .maybeSingle();

  const row = conv as Pick<ConversationRow, 'id' | 'user_a_id' | 'user_b_id' | 'status'> | null;

  let isBlocked = false;
  if (row) {
    const other = otherUserId(row, myUserId);
    const { data: blocked } = await rpc('chat_is_blocked_between', {
      p_user_a: myUserId,
      p_user_b: other,
    });
    isBlocked = blocked === true;
  }

  return {
    conversation: row
      ? { status: row.status, otherUserId: otherUserId(row, myUserId) }
      : null,
    isBlocked,
  };
}

export async function fetchMessages(conversationId: string): Promise<MessageRow[]> {
  const { data, error } = await tbl('messages')
    .select('id, conversation_id, sender_user_id, body, status, deleted_at, created_at')
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message ?? 'failed to load messages');
  }
  return (data ?? []) as MessageRow[];
}

export type SendOk = { ok: true; message: SendMessageResult };
export type SendErr = { ok: false; failure: SendFailure };

/**
 * 메시지 전송 (CH-API1 / B-CH2). Edge Function 우선 → 실패 시 RPC 폴백.
 * 성공: { ok:true, message }. 실패: { ok:false, failure } (classifySendFailure).
 */
export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<SendOk | SendErr> {
  // 1) Edge Function — 서버측 재검증 + 명시적 reason/retryable.
  try {
    const { data, error } = await supabase.functions.invoke<{
      message?: SendMessageResult;
      error?: string;
      reason?: string;
      retryable?: boolean;
    }>('send-message', { body: { conversationId, body } });

    if (!error && data?.message) {
      return { ok: true, message: data.message };
    }

    // FunctionsHttpError: 4xx/5xx 본문 파싱.
    if (error && 'context' in error) {
      try {
        const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
        const payload = (await ctx?.json?.()) as
          | { error?: string; reason?: string; retryable?: boolean }
          | undefined;
        if (payload) {
          return {
            ok: false,
            failure: classifySendFailure({
              reason: payload.reason,
              retryable: payload.retryable,
              message: payload.error,
            }),
          };
        }
      } catch {
        // fallthrough to RPC.
      }
    }

    if (!error && data?.error) {
      return {
        ok: false,
        failure: classifySendFailure({
          reason: data.reason,
          retryable: data.retryable,
          message: data.error,
        }),
      };
    }
  } catch (err) {
    logger.captureException(err, { tags: { feature: 'chat-send', layer: 'edge' } });
  }

  // 2) RPC 폴백.
  const { data, error } = await rpc('send_message', {
    p_conversation_id: conversationId,
    p_body: body,
  });

  if (error) {
    return {
      ok: false,
      failure: classifySendFailure({ message: error.message }),
    };
  }

  const msg = (Array.isArray(data) ? data[0] : data) as SendMessageResult | undefined;
  if (!msg) {
    return {
      ok: false,
      failure: classifySendFailure({ message: 'no message returned' }),
    };
  }
  return { ok: true, message: msg };
}

/**
 * 채팅방 나가기 (CH-API2 / B-CH5). Edge Function 우선 → RPC 폴백.
 * 양쪽 영구 삭제 + matches UNMATCHED. 상대에게는 conversations UPDATE 가
 * realtime 으로 전파 (CH-RT conversation_ended_received).
 */
export async function leaveConversation(conversationId: string): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      status?: string;
      error?: string;
    }>('leave-conversation', { body: { conversationId } });

    if (!error && data?.status) {
      return;
    }
  } catch (err) {
    logger.captureException(err, { tags: { feature: 'chat-leave', layer: 'edge' } });
  }

  const { error } = await rpc('leave_conversation', {
    p_conversation_id: conversationId,
  });
  if (error) {
    throw new Error(error.message ?? 'failed to leave conversation');
  }
}

export type RealtimeUnsubscribe = () => void;

/**
 * CH-RT 구독: 신규 메시지(messages INSERT) + 상대 나감/종료(conversations UPDATE).
 * 반환값 호출 시 채널 해제.
 */
export function subscribeConversation(
  conversationId: string,
  handlers: {
    onMessage: (m: MessageRow) => void;
    onConversationEnded: () => void;
    /**
     * 채널이 SUBSCRIBED 된 시점에 호출. e2e 에서 확인된 갭:
     * SUBSCRIBED 직후 RLS 바인딩 적용 전 INSERT 는 유실될 수 있으므로,
     * 호출자는 onReady 이후에 첫 송신/낙관 갱신을 하는 것이 안전하다.
     */
    onReady?: () => void;
  },
): RealtimeUnsubscribe {
  const channel = (supabase as any)
    .channel(`chat:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload: any) => {
        const row = payload?.new as MessageRow | undefined;
        if (row && !row.deleted_at) handlers.onMessage(row);
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `id=eq.${conversationId}`,
      },
      (payload: any) => {
        const row = payload?.new as { status?: string } | undefined;
        if (row?.status === 'ENDED' || row?.status === 'DELETED') {
          handlers.onConversationEnded();
        }
      },
    )
    .subscribe((status: string) => {
      if (status === 'SUBSCRIBED') handlers.onReady?.();
    });

  return () => {
    (supabase as any).removeChannel(channel);
  };
}
