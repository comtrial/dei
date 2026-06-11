import { createAdminClient, isServiceRoleRequest } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { captureEdgeError } from '../_shared/log.ts';
import { sendPushToUsers, type PushDispatchResult } from '../_shared/push.ts';

type NotifyHourlyUploadBody = {
  dryRun?: unknown;
  limit?: unknown;
  now?: unknown;
};

type RoomRow = {
  id: string;
};

type RoomMemberRow = {
  room_id: string;
  user_id: string;
};

type VideoUploadRow = {
  room_id: string;
  user_id: string;
};

function getCurrentKstHourWindow(now: Date) {
  const kstMs = now.getTime() + 9 * 60 * 60_000;
  const kstHourStart = new Date(kstMs);
  kstHourStart.setUTCMinutes(0, 0, 0);

  const start = new Date(kstHourStart.getTime() - 9 * 60 * 60_000);
  const end = new Date(start.getTime() + 60 * 60_000);

  return {
    end,
    hourSlot: kstHourStart.getUTCHours(),
    start,
  };
}

function toLimit(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 500;
  return Math.max(1, Math.min(Math.floor(value), 1000));
}

function mergePushTotals(total: PushDispatchResult, next: PushDispatchResult) {
  total.attempted += next.attempted;
  total.failed += next.failed;
  total.sent += next.sent;
  total.ok = total.ok && next.ok;
  total.skipped.disabled += next.skipped.disabled;
  total.skipped.duplicateUser += next.skipped.duplicateUser;
  total.skipped.noToken += next.skipped.noToken;
  total.skipped.noUser += next.skipped.noUser;
  total.skipped.quietHours += next.skipped.quietHours;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  if (!isServiceRoleRequest(req)) {
    return errorResponse('forbidden', 403, { code: 'SERVICE_ROLE_REQUIRED' });
  }

  let hourSlot: number | undefined;

  try {
    const body = await req.json().catch(() => ({})) as NotifyHourlyUploadBody;
    const now = typeof body.now === 'string' ? new Date(body.now) : new Date();
    if (Number.isNaN(now.getTime())) {
      return errorResponse('invalid_now', 400, { code: 'INVALID_NOW' });
    }

    const { end, start, hourSlot: currentHourSlot } = getCurrentKstHourWindow(now);
    hourSlot = currentHourSlot;
    const dryRun = body.dryRun === true;
    const limit = toLimit(body.limit);
    const supabase = createAdminClient();

    const { data: rooms, error: roomsError } = await supabase
      .from('room')
      .select('id')
      .eq('status', 'active')
      .limit(limit);
    if (roomsError) throw roomsError;

    const roomIds = ((rooms ?? []) as RoomRow[])
      .map((room) => room.id)
      .filter((roomId): roomId is string => typeof roomId === 'string' && roomId.length > 0);

    if (roomIds.length === 0) {
      return jsonResponse({
        dryRun,
        eligible: 0,
        hourSlot,
        ok: true,
        push: null,
      });
    }

    const { data: members, error: membersError } = await supabase
      .from('room_member')
      .select('room_id, user_id')
      .in('room_id', roomIds)
      .eq('status', 'active')
      .limit(limit);
    if (membersError) throw membersError;

    const memberRows = ((members ?? []) as RoomMemberRow[])
      .filter((member) => member.room_id && member.user_id);
    const userIds = [...new Set(memberRows.map((member) => member.user_id))];

    if (memberRows.length === 0 || userIds.length === 0) {
      return jsonResponse({
        dryRun,
        eligible: 0,
        hourSlot,
        ok: true,
        push: null,
      });
    }

    const { data: uploads, error: uploadsError } = await supabase
      .from('video')
      .select('room_id, user_id')
      .in('room_id', roomIds)
      .in('user_id', userIds)
      .eq('status', 'ready')
      .eq('hour_slot', hourSlot)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString());
    if (uploadsError) throw uploadsError;

    const uploadedKeys = new Set(
      ((uploads ?? []) as VideoUploadRow[])
        .map((upload) => `${upload.room_id}:${upload.user_id}`),
    );

    const usersByRoomId = new Map<string, string[]>();
    for (const member of memberRows) {
      if (uploadedKeys.has(`${member.room_id}:${member.user_id}`)) continue;
      const users = usersByRoomId.get(member.room_id) ?? [];
      users.push(member.user_id);
      usersByRoomId.set(member.room_id, users);
    }

    const eligible = [...usersByRoomId.values()].reduce((sum, users) => sum + users.length, 0);
    if (dryRun || eligible === 0) {
      return jsonResponse({
        dryRun,
        eligible,
        hourSlot,
        ok: true,
        push: null,
        window: { end: end.toISOString(), start: start.toISOString() },
      });
    }

    const pushTotal: PushDispatchResult = {
      attempted: 0,
      failed: 0,
      ok: true,
      sent: 0,
      skipped: {
        disabled: 0,
        duplicateUser: 0,
        noToken: 0,
        noUser: 0,
        quietHours: 0,
      },
    };

    for (const [roomId, roomUserIds] of usersByRoomId.entries()) {
      const push = await sendPushToUsers(supabase, {
        body: '지금 방에 오늘의 3초를 남겨주세요',
        category: 'upload_reminder',
        data: {
          hourSlot,
          roomId,
          type: 'upload_reminder',
        },
        quietHoursMode: 'respect',
        title: '영상을 올릴 시간이에요',
        userIds: roomUserIds,
      });
      mergePushTotals(pushTotal, push);
    }

    return jsonResponse({
      dryRun,
      eligible,
      hourSlot,
      ok: pushTotal.ok,
      push: pushTotal,
      window: { end: end.toISOString(), start: start.toISOString() },
    });
  } catch (error) {
    captureEdgeError('notify-hourly-upload', error, {
      stage: 'notify_hourly_upload',
      status: 500,
      tags: { feature: 'video-push', code: 'notify_hourly_upload_failed' },
      extra: { hourSlot },
    });
    return errorResponse('notify_failed', 500, { code: 'NOTIFY_FAILED' });
  }
});
