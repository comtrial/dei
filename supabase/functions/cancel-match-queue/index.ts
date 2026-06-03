import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { captureEdgeError } from '../_shared/log.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('method not allowed', 405, { code: 'METHOD_NOT_ALLOWED' });
  }

  let userId: string | undefined;

  try {
    const { supabase, user } = await getAuthenticatedUser(req);
    userId = user.id;

    const { data: teamMembers, error: teamError } = await supabase
      .from('team_member')
      .select('team_id')
      .eq('user_id', user.id);

    if (teamError) {
      throw teamError;
    }

    const teamIds = teamMembers?.map((team) => team.team_id) ?? [];
    if (teamIds.length === 0) {
      return jsonResponse({ cancelledCount: 0, ok: true });
    }

    const { data: queues, error: queueLookupError } = await supabase
      .from('match_queue')
      .select('id, team_id')
      .in('team_id', teamIds)
      .eq('status', 'waiting');

    if (queueLookupError) {
      throw queueLookupError;
    }

    const queueIds = queues?.map((queue) => queue.id) ?? [];
    const queuedTeamIds = [...new Set(queues?.map((queue) => queue.team_id) ?? [])];

    if (queueIds.length === 0) {
      return jsonResponse({ cancelledCount: 0, ok: true });
    }

    const { error: queueUpdateError } = await supabase
      .from('match_queue')
      .update({ status: 'cancelled' })
      .in('id', queueIds);

    if (queueUpdateError) {
      throw queueUpdateError;
    }

    const { error: teamUpdateError } = await supabase
      .from('team')
      .update({ disbanded_at: new Date().toISOString(), status: 'disbanded' })
      .in('id', queuedTeamIds);

    if (teamUpdateError) {
      throw teamUpdateError;
    }

    return jsonResponse({ cancelledCount: queueIds.length, ok: true });
  } catch (error) {
    // team_member/match_queue/team disband throw — 부분 적용된 취소가 invisible.
    captureEdgeError('cancel-match-queue', error, {
      stage: 'cancel_queue_pipeline',
      status: 500,
      userId,
      tags: { feature: 'matching', code: 'BAD_REQUEST' },
    });
    const message = error instanceof Error ? error.message : 'failed to cancel match queue';
    return errorResponse(message, 400, { code: 'BAD_REQUEST' });
  }
});
