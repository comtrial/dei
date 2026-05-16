// CH-API2 · POST /conversations/:id/leave
//
// 사용자 나가기 API. 서버:
//   - conversation.status = DELETED
//   - messages soft-delete (deleted_at)
//   - matches.status = UNMATCHED
//   - 상대에게 conversation.ended 실시간 push (conversations UPDATE → realtime)
// B-CH5: 양쪽 영구 삭제 (한쪽 보존 비대칭 없음).
//
// 라우팅: /functions/v1/leave-conversation/<conversationId>
//      또는 body { conversationId }
//
// 응답:
//   200 { conversationId, matchId, otherUserId, status: 'DELETED' }
//   4xx { error }
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

type LeaveBody = {
  conversationId?: string;
};

function resolveConversationId(req: Request, body: LeaveBody): string | null {
  const fromBody = body.conversationId?.trim();
  if (fromBody) return fromBody;

  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const idx = segments.indexOf('leave-conversation');
  if (idx >= 0 && segments[idx + 1]) {
    return decodeURIComponent(segments[idx + 1]);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('method not allowed', 405);
  }

  try {
    const { supabase } = await getAuthenticatedUser(req);

    let body: LeaveBody = {};
    try {
      const raw = await req.text();
      body = raw ? (JSON.parse(raw) as LeaveBody) : {};
    } catch {
      return errorResponse('invalid json body', 400);
    }

    const conversationId = resolveConversationId(req, body);
    if (!conversationId) {
      return errorResponse('conversationId is required', 400);
    }

    // leave_conversation RPC: 단일 트랜잭션에서 conversation→DELETED,
    // messages soft-delete, matches→UNMATCHED 를 모두 수행.
    // 상대에게의 conversation.ended push 는 conversations UPDATE 가
    // supabase_realtime publication 을 통해 전파되는 것으로 충족 (CH-RT).
    const { data, error } = await supabase.rpc('leave_conversation', {
      p_conversation_id: conversationId,
    });

    if (error) {
      const msg = error.message ?? 'failed to leave conversation';
      if (/not a participant/i.test(msg)) {
        return errorResponse('forbidden', 403);
      }
      if (/conversation not found/i.test(msg)) {
        return errorResponse('conversation not found', 404);
      }
      if (/authentication required/i.test(msg)) {
        return errorResponse(msg, 401);
      }
      return errorResponse(msg, 500);
    }

    const row = Array.isArray(data) ? data[0] : data;
    return jsonResponse(
      {
        conversationId: row?.conversation_id ?? conversationId,
        matchId: row?.match_id ?? null,
        otherUserId: row?.other_user_id ?? null,
        status: row?.status ?? 'DELETED',
      },
      { status: 200 },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'failed to leave conversation';
    if (/authentication required/i.test(msg)) {
      return errorResponse(msg, 401);
    }
    return errorResponse(msg, 500);
  }
});
