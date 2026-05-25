// ROOMS-API · POST /functions/v1/room-send-message
//
// 방 단위 채팅 메시지 발송 + @멘션 파싱 + 멘션받은 멤버에게 push 알림.
// 멘션 파싱은 RPC 안에서 처리. push 발송은 mention 적재 직후 이 Edge 가 추가.
//
// 입력 (JSON body):
//   roomId: uuid
//   body:   string (1..500)
//
// 응답:
//   200 { messageId: uuid }
//   400 { error, retryable:false }
//   401 { error, retryable:false }
//   403 { error, retryable:false }
//   500 { error, retryable:true }
//
// RPC: public.send_chat_message
import { createAdminClient, getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { createNotificationAndPush, getProfileDisplayName } from '../_shared/push.ts';

type Body = { roomId?: unknown; body?: unknown };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method not allowed', 405, { retryable: false });

  try {
    const { supabaseAsUser, user } = await getAuthenticatedUser(req);

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return errorResponse('invalid json body', 400, { retryable: false });
    }
    const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
    const text = typeof body.body === 'string' ? body.body : '';

    if (!roomId) {
      return errorResponse('roomId is required', 400, { retryable: false });
    }
    if (text.length < 1 || text.length > 500) {
      return errorResponse('body must be 1..500 chars', 400, { retryable: false });
    }

    const { data: messageId, error } = await supabaseAsUser.rpc('send_chat_message', {
      p_room_id: roomId,
      p_body: text,
    });

    if (error) {
      if (error.code === '42501') {
        return errorResponse(
          error.message === 'unauthenticated' ? 'authentication required' : 'not a room member',
          error.message === 'unauthenticated' ? 401 : 403,
          { retryable: false },
        );
      }
      if (error.code === '22023') {
        return errorResponse(error.message, 400, { retryable: false });
      }
      throw error;
    }

    // 멘션 받은 멤버에게 push (admin client 로 발송 — 본인 RLS 우회 필요)
    const admin = createAdminClient();
    const { data: mentions } = await admin
      .from('chat_mentions')
      .select('mentioned_profile_id')
      .eq('message_id', messageId);

    if (mentions && mentions.length > 0) {
      const senderName = await getProfileDisplayName(admin, user.id);
      const route = `/room/${roomId}/chat?focusMessage=${messageId}`;

      await Promise.allSettled(
        mentions.map((m: { mentioned_profile_id: string }) =>
          createNotificationAndPush(admin, {
            userId: m.mentioned_profile_id,
            type: 'chat_mention',
            title: `${senderName}님이 멘션했어요`,
            body: text.length > 80 ? `${text.slice(0, 80)}…` : text,
            route,
            data: { roomId, messageId, kind: 'mention' },
            dedupeKey: `mention:${messageId}:${m.mentioned_profile_id}`,
            skipIfDedupeExists: true,
          }),
        ),
      );
    }

    return jsonResponse({ messageId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message === 'authentication required') {
      return errorResponse(message, 401, { retryable: false });
    }
    return errorResponse(message, 500, { retryable: true });
  }
});
