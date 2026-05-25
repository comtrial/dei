// ROOMS-API · POST /functions/v1/groups-create
//
// 묶음(과팅 그룹) 생성. 본인을 leader 로 + 닉네임 배열로 친구를 초대한다.
// D4 정책: 모든 멤버는 **이미 가입된 유저** 여야 한다 (`profiles.nickname_lower`
// 일치하는 user_id 가 반드시 존재해야 함). 수락 절차는 없다.
//
// 입력 (JSON body):
//   nicknames: string[]   — 본인 외 추가할 친구 닉네임 (최대 3, 본인 포함 그룹 size ≤ 4)
//
// 응답:
//   200 { groupId: uuid }                    생성됨
//   400 { error, retryable:false }           입력 검증 실패
//   401 { error, retryable:false }           인증 실패
//   404 { error, retryable:false }           닉네임 미존재
//   500 { error, retryable:true }            일시 장애
//
// RPC 위임: public.create_group(p_nicknames text[])
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

type Body = { nicknames?: unknown };

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

    const rawNicks = Array.isArray(body.nicknames) ? body.nicknames : null;
    if (!rawNicks) {
      return errorResponse('nicknames must be a string array', 400, { retryable: false });
    }
    const nicknames = rawNicks
      .filter((n): n is string => typeof n === 'string')
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    if (nicknames.length === 0) {
      return errorResponse('at least one nickname is required', 400, { retryable: false });
    }
    if (nicknames.length > 3) {
      return errorResponse('group too large (max 3 invitees, 4 total)', 400, {
        retryable: false,
      });
    }

    const { data, error } = await supabaseAsUser.rpc('create_group', {
      p_nicknames: nicknames,
    });

    if (error) {
      if (error.code === 'P0002') {
        return errorResponse(error.message, 404, { retryable: false });
      }
      if (error.code === '22023') {
        return errorResponse(error.message, 400, { retryable: false });
      }
      if (error.code === '42501') {
        return errorResponse('authentication required', 401, { retryable: false });
      }
      throw error;
    }

    return jsonResponse({ groupId: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message === 'authentication required') {
      return errorResponse(message, 401, { retryable: false });
    }
    return errorResponse(message, 500, { retryable: true });
  }
});
