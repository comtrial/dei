import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('method not allowed', 405, { code: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { supabase, user } = await getAuthenticatedUser(req);

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
    const message = error instanceof Error ? error.message : 'failed to cancel match queue';
    return errorResponse(message, 400, { code: 'BAD_REQUEST' });
  }
});
