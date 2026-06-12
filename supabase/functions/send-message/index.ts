// supabase/functions/send-message/index.ts
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { captureEdgeError } from '../_shared/log.ts';
import { getProfileNickname, sendPushToRoomMembers, sendPushToUsers } from '../_shared/push.ts';

function codePointLength(s: string): number {
  return [...s].length;
}

type SentMessage = {
  body: string;
  id: string;
  room_id: string;
  user_id: string;
  whisper_to_user_id: string | null;
};

async function dispatchMessagePush(admin: any, message: SentMessage) {
  const senderNickname = await getProfileNickname(admin, message.user_id).catch(() => null);

  if (message.whisper_to_user_id) {
    return sendPushToUsers(admin, {
      body: '귓속말이 도착했어요',
      category: 'chat_mention',
      data: {
        messageId: message.id,
        roomId: message.room_id,
        senderUserId: message.user_id,
        type: 'whisper_mention',
      },
      quietHoursMode: 'exempt',
      title: senderNickname ?? '귓속말',
      userIds: [message.whisper_to_user_id],
    });
  }

  return sendPushToRoomMembers(admin, {
    body: '새 메시지가 도착했어요',
    category: 'chat_mention',
    data: {
      messageId: message.id,
      roomId: message.room_id,
      senderUserId: message.user_id,
      type: 'room_message',
    },
    excludeUserIds: [message.user_id],
    quietHoursMode: 'respect',
    roomId: message.room_id,
    title: senderNickname ?? '새 메시지',
  });
}
function data_is_dedup_echo(deduped: boolean) { return deduped; }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  let auth;
  try {
    auth = await getAuthenticatedUser(req);
  } catch (e) {
    // 토큰 형식 비호환(ES256/JWKS 회귀 등) 은 여기서만 드러난다(CLAUDE.md item 9).
    captureEdgeError('send-message', e, {
      stage: 'auth',
      status: 401,
      tags: { feature: 'chat' },
    });
    return errorResponse('unauthenticated', 401);
  }
  const { supabaseAsUser } = auth;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('invalid_payload', 400);
  }

  const roomId = payload.room_id;
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  const whisperTo = (payload.whisper_to_user_id ?? null) as string | null;
  const clientMsgId = payload.client_msg_id;

  if (typeof roomId !== 'string' || typeof clientMsgId !== 'string') {
    return errorResponse('invalid_payload', 400);
  }
  const len = codePointLength(body);
  if (len < 1 || len > 500) return errorResponse('body_length', 422);

  // RPC는 supabaseAsUser(user JWT)로 — auth.uid()=발신자. 서버 측 재검증은 RPC 내부에서도 수행(이중).
  const { data, error } = await supabaseAsUser.rpc('send_room_message', {
    p_room_id: roomId,
    p_body: body,
    p_whisper_to_user_id: whisperTo,
    p_client_msg_id: clientMsgId,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('not_room_member')) return errorResponse('not_room_member', 403);
    if (msg.includes('room_not_active')) return errorResponse('room_not_active', 409);
    if (msg.includes('body_length')) return errorResponse('body_length', 422);
    if (msg.startsWith('invalid_whisper_target')) {
      const reason = msg.split(':')[1] ?? 'not_member';
      return errorResponse('invalid_whisper_target', 422, { reason });
    }
    if (msg.includes('authentication required')) return errorResponse('unauthenticated', 401);
    // send_failed uuid 버그가 서버에 안 남던 그 지점 — RPC 예기치 못한 실패.
    captureEdgeError('send-message', error, {
      stage: 'send_room_message_rpc',
      status: 500,
      userId: auth.user.id,
      tags: { feature: 'chat', code: 'send_failed' },
      extra: {
        roomId,
        clientMsgId,
        isWhisper: whisperTo != null,
        rpcCode: error.code ?? null,
        rpcMessage: msg,
      },
    });
    return errorResponse('send_failed', 500, { detail: msg });
  }

  const deduped = false; // RPC ON CONFLICT 시 동일 행 반환 — 멱등이므로 클라는 동일 처리. (필요 시 RPC가 deduped 플래그 반환하도록 확장)
  const message = {
    id: data.id,
    room_id: data.room_id,
    user_id: data.user_id,
    body: data.body,
    whisper_to_user_id: data.whisper_to_user_id,
    created_at: data.created_at,
  };

  // 메시지 푸시(best-effort) — 실패가 채팅 전송 실패를 만들지 않는다.
  if (!data_is_dedup_echo(deduped)) {
    void dispatchMessagePush(auth.supabase, message).catch((err) =>
      captureEdgeError('send-message', err, {
        stage: message.whisper_to_user_id ? 'whisper_push' : 'room_message_push',
        status: 200,
        userId: auth.user.id,
        level: 'warning',
        tags: {
          feature: 'chat-push',
          code: message.whisper_to_user_id ? 'whisper_push_failed' : 'room_message_push_failed',
        },
        extra: { roomId: message.room_id, targetUserId: message.whisper_to_user_id },
      })
    );
  }

  return jsonResponse({ ok: true, deduped, message }, { status: 200 });
});
