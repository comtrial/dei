import { getAuthenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { captureEdgeError } from '../_shared/log.ts';
import { getProfileNickname, sendPushToRoomMembers } from '../_shared/push.ts';

type NotifyVideoUploadedBody = {
  room_id?: unknown;
  video_id?: unknown;
};

type VideoRow = {
  id: string;
  room_id: string;
  status: string;
  user_id: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  let userId: string | undefined;
  let roomId: string | undefined;
  let videoId: string | undefined;

  try {
    const { supabase, user } = await getAuthenticatedUser(req);
    userId = user.id;

    const body = await req.json().catch(() => ({})) as NotifyVideoUploadedBody;
    roomId = typeof body.room_id === 'string' ? body.room_id : undefined;
    videoId = typeof body.video_id === 'string' ? body.video_id : undefined;

    if (!roomId || !videoId) {
      return errorResponse('invalid_payload', 400, { code: 'INVALID_PAYLOAD' });
    }

    const { data: video, error: videoError } = await supabase
      .from('video')
      .select('id, room_id, user_id, status')
      .eq('id', videoId)
      .eq('room_id', roomId)
      .maybeSingle();

    if (videoError) throw videoError;
    if (!video) {
      return errorResponse('video_not_found', 404, { code: 'VIDEO_NOT_FOUND' });
    }

    const videoRow = video as VideoRow;
    if (videoRow.user_id !== user.id) {
      return errorResponse('forbidden', 403, { code: 'FORBIDDEN' });
    }

    if (videoRow.status !== 'ready') {
      return jsonResponse({ ok: true, skipped: 'video_not_ready' });
    }

    const { data: membership, error: membershipError } = await supabase
      .from('room_member')
      .select('status')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership || (membership as { status?: string }).status !== 'active') {
      return errorResponse('not_room_member', 403, { code: 'NOT_ROOM_MEMBER' });
    }

    const nickname = await getProfileNickname(supabase, user.id).catch(() => null);
    const push = await sendPushToRoomMembers(supabase, {
      body: '방에서 바로 확인해보세요',
      category: 'upload_reminder',
      data: {
        roomId,
        type: 'room_video_uploaded',
        uploaderUserId: user.id,
        videoId,
      },
      excludeUserIds: [user.id],
      quietHoursMode: 'respect',
      roomId,
      title: `${nickname ?? '룸 참가자'}님이 영상을 올렸어요`,
    });

    return jsonResponse({ ok: true, push });
  } catch (error) {
    captureEdgeError('notify-video-uploaded', error, {
      stage: 'notify_video_uploaded',
      status: 500,
      userId,
      tags: { feature: 'video-push', code: 'notify_video_uploaded_failed' },
      extra: { roomId, videoId },
    });
    return errorResponse('notify_failed', 500, { code: 'NOTIFY_FAILED' });
  }
});
