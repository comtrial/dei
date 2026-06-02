import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';

type LeaveRoomBody = {
  detail?: unknown;
  reason?: unknown;
  roomId?: unknown;
};

// 표준 UUID(8-4-4-4-12). 직전 패턴은 4번째 그룹의 dash·길이가 빠져
// ([89ab][0-9a-f]{12}$) 어떤 실제 UUID(roomId) 도 매칭 못 해 leave-room 이
// 전 요청을 거부하던 버그. enqueue-match-queue 와 동일 결함. 수정.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEAVE_REASONS = new Set(['mood', 'mistake', 'bad_member', 'other']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('method not allowed', 405, { code: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { supabase, user } = await getAuthenticatedUser(req);
    const body = await req.json().catch(() => ({})) as LeaveRoomBody;
    const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const detail = typeof body.detail === 'string' ? body.detail.trim() : '';

    if (!UUID_PATTERN.test(roomId)) {
      return errorResponse('방 정보를 확인할 수 없어요.', 400, { code: 'INVALID_ROOM' });
    }

    if (!LEAVE_REASONS.has(reason)) {
      return errorResponse('이탈 사유를 선택해주세요.', 400, { code: 'INVALID_REASON' });
    }

    if (reason === 'other' && detail.length === 0) {
      return errorResponse('이탈 사유를 적어주세요.', 400, { code: 'DETAIL_REQUIRED' });
    }

    const { data: membership, error: membershipError } = await supabase
      .from('room_member')
      .select('room_id, status')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      throw membershipError;
    }

    if (!membership || membership.status !== 'active') {
      return errorResponse('이미 나간 방이에요.', 409, { code: 'NOT_ACTIVE_MEMBER' });
    }

    const leftAt = new Date().toISOString();
    const [{ error: memberError }, { error: profileError }] = await Promise.all([
      supabase
        .from('room_member')
        .update({ left_at: leftAt, status: 'left' })
        .eq('room_id', roomId)
        .eq('user_id', user.id),
      supabase
        .from('profile')
        .update({ is_in_active_room: false, last_room_leave_at: leftAt })
        .eq('user_id', user.id),
    ]);

    if (memberError || profileError) {
      throw memberError ?? profileError;
    }

    const { error: lifecycleError } = await supabase.from('room_lifecycle').insert({
      actor_user_id: user.id,
      detail: {
        detail: detail || null,
        reason,
      },
      event: 'member_left',
      room_id: roomId,
    });

    if (lifecycleError) {
      throw lifecycleError;
    }

    const { count, error: countError } = await supabase
      .from('room_member')
      .select('user_id', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('status', 'active');

    if (countError) {
      throw countError;
    }

    const activeMemberCount = count ?? 0;
    const roomEnded = activeMemberCount === 0;
    const { error: roomError } = await supabase
      .from('room')
      .update({
        active_member_count: activeMemberCount,
        ...(roomEnded
          ? { ended_at: leftAt, ended_reason: 'all_left', status: 'ended' }
          : {}),
      })
      .eq('id', roomId);

    if (roomError) {
      throw roomError;
    }

    if (roomEnded) {
      const { error: endLifecycleError } = await supabase.from('room_lifecycle').insert({
        actor_user_id: user.id,
        detail: { reason: 'all_left' },
        event: 'ended',
        room_id: roomId,
      });

      if (endLifecycleError) {
        throw endLifecycleError;
      }
    }

    return jsonResponse({ activeMemberCount, ok: true, roomEnded });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'failed to leave room';
    return errorResponse(message, 400, { code: 'BAD_REQUEST' });
  }
});
