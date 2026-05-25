// ROOMS-API · POST /functions/v1/room-report-user
//
// 사용자 신고 (방/사용자 단위).
//
// 입력 (JSON body):
//   reportedId:   uuid
//   reasonCode:   'verbal_abuse'|'spam'|'fake_profile'|'inappropriate_video'|'harassment'|'other'
//   reasonDetail: string | null   — 'other' 일 때 필수 (RPC 가 강제)
//   roomId:       uuid | null
//
// 응답:
//   200 { reportId: uuid }
//   400 { error, retryable:false }
//   401 { error, retryable:false }
//   500 { error, retryable:true }
//
// RPC: public.report_user
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

type Body = {
  reportedId?: unknown;
  reasonCode?: unknown;
  reasonDetail?: unknown;
  roomId?: unknown;
};

const REASON_CODES = new Set([
  'verbal_abuse',
  'spam',
  'fake_profile',
  'inappropriate_video',
  'harassment',
  'other',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method not allowed', 405, { retryable: false });

  try {
    const { supabaseAsUser } = await getAuthenticatedUser(req);

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return errorResponse('invalid json body', 400, { retryable: false });
    }

    const reportedId = typeof body.reportedId === 'string' ? body.reportedId.trim() : '';
    const reasonCode = typeof body.reasonCode === 'string' ? body.reasonCode.trim() : '';
    const reasonDetail =
      typeof body.reasonDetail === 'string' && body.reasonDetail.trim().length > 0
        ? body.reasonDetail.trim().slice(0, 2000)
        : null;
    const roomId =
      typeof body.roomId === 'string' && body.roomId.trim().length > 0
        ? body.roomId.trim()
        : null;

    if (!reportedId) {
      return errorResponse('reportedId is required', 400, { retryable: false });
    }
    if (!REASON_CODES.has(reasonCode)) {
      return errorResponse('invalid reasonCode', 400, { retryable: false });
    }
    if (reasonCode === 'other' && !reasonDetail) {
      return errorResponse('reasonDetail is required when reasonCode is "other"', 400, {
        retryable: false,
      });
    }

    const { data, error } = await supabaseAsUser.rpc('report_user', {
      p_reported_id: reportedId,
      p_reason_code: reasonCode,
      p_reason_detail: reasonDetail,
      p_room_id: roomId,
    });

    if (error) {
      if (error.code === '22023') {
        return errorResponse(error.message, 400, { retryable: false });
      }
      if (error.code === '42501') {
        return errorResponse('authentication required', 401, { retryable: false });
      }
      throw error;
    }

    return jsonResponse({ reportId: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message === 'authentication required') {
      return errorResponse(message, 401, { retryable: false });
    }
    return errorResponse(message, 500, { retryable: true });
  }
});
