// supabase/functions/send-message/index.ts
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

function codePointLength(s: string): number {
  return [...s].length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  let auth;
  try {
    auth = await getAuthenticatedUser(req);
  } catch {
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

  // 멘션 푸시 디스패치 (Task 14에서 추가). 지금은 no-op.

  return jsonResponse({ ok: true, deduped, message }, { status: 200 });
});
