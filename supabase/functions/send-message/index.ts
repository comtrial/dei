// CH-API1 · POST /conversations/:id/messages
//
// 메시지 전송 API. 서버 측에서 차단/conversation 상태를 재검증한 뒤
// messages row 를 insert (status=SENT) 한다. (B-CH2)
//
// 라우팅: Supabase Edge Function 은 /functions/v1/send-message 로 호출된다.
// conversation id 는 (1) path 의 끝 세그먼트 또는 (2) body.conversationId 로 받는다.
//   POST /functions/v1/send-message/<conversationId>   body: { body: string }
//   POST /functions/v1/send-message                    body: { conversationId, body }
//
// 응답:
//   200 { message: {...} }                전송 성공 → 클라이언트 버블 확정
//   4xx { error }                         차단/종료/검증 실패 → retry 마커 (재시도 무의미한 경우 명시)
//   5xx { error }                         일시 장애 → 클라이언트 retry
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

type SendMessageBody = {
  body?: string;
  conversationId?: string;
};

function resolveConversationId(req: Request, body: SendMessageBody): string | null {
  const fromBody = body.conversationId?.trim();
  if (fromBody) return fromBody;

  // /functions/v1/send-message/<conversationId>
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const idx = segments.indexOf('send-message');
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

    let body: SendMessageBody;
    try {
      body = (await req.json()) as SendMessageBody;
    } catch {
      return errorResponse('invalid json body', 400);
    }

    const conversationId = resolveConversationId(req, body);
    if (!conversationId) {
      return errorResponse('conversationId is required', 400);
    }

    const text = body.body;
    if (typeof text !== 'string' || text.length < 1 || text.length > 500) {
      // 클라이언트 입력 검증 실패 — 재시도해도 동일. retryable=false.
      return errorResponse('message body must be 1..500 chars', 422, {
        retryable: false,
      });
    }

    // 서버측 재검증 + insert 는 send_message RPC 에서 단일 트랜잭션으로 수행.
    // (race 방지: 입장 후 상대가 차단/나가기 한 경우를 전송 직전 잡는다 — B-CH2)
    const { data, error } = await supabase.rpc('send_message', {
      p_conversation_id: conversationId,
      p_body: text,
    });

    if (error) {
      const msg = error.message ?? 'failed to send message';

      // 명시적 비즈니스 거절 → 4xx, 재시도 무의미.
      if (/blocked/i.test(msg)) {
        return errorResponse('blocked', 403, { reason: 'BLOCKED', retryable: false });
      }
      if (/not active/i.test(msg)) {
        return errorResponse('conversation ended', 409, {
          reason: 'ENDED',
          retryable: false,
        });
      }
      if (/not a participant/i.test(msg)) {
        return errorResponse('forbidden', 403, { retryable: false });
      }
      if (/conversation not found/i.test(msg)) {
        return errorResponse('conversation not found', 404, { retryable: false });
      }
      if (/1\.\.500/i.test(msg)) {
        return errorResponse(msg, 422, { retryable: false });
      }

      // 알 수 없는 오류 → 5xx, 클라이언트 retry 마커.
      return errorResponse(msg, 500, { retryable: true });
    }

    const message = Array.isArray(data) ? data[0] : data;
    return jsonResponse({ message }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'failed to send message';
    if (/authentication required/i.test(msg)) {
      return errorResponse(msg, 401, { retryable: false });
    }
    return errorResponse(msg, 500, { retryable: true });
  }
});
