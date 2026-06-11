import { POLICY } from '../../../packages/shared/src/policy.ts';
import { toMatchQueueMode } from '../../../packages/shared/src/college.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { captureEdgeError, captureEdgeMessage } from '../_shared/log.ts';
import { getCollegeEligibilityFailure } from '../_shared/college-eligibility.ts';

type EnqueueBody = {
  memberIds?: unknown;
  mode?: unknown;
};

type ProfileRow = {
  gender: string | null;
  is_adult: boolean;
  is_in_active_room: boolean;
  is_student: boolean | null;
  last_room_leave_at: string | null;
  nickname: string | null;
  onboarding_completed_at: string | null;
  photo_url: string | null;
  region: string | null;
  university_name: string | null;
  user_id: string;
};

type PassRow = {
  id: string;
  remaining: number;
};

type MatchPushSettingRow = {
  match_alert: boolean | null;
  push_enabled: boolean | null;
  user_id: string;
};

type MatchPushTokenRow = {
  token: string;
  user_id: string;
};

// 표준 UUID(8-4-4-4-12). 직전 패턴은 variant 그룹의 dash·길이가 빠져
// ([89ab][0-9a-f]{12}$ — 4번째 그룹 4자 + dash + 5번째 12자 누락) 어떤 실제 UUID 도
// 매칭 못 해 enqueue 가 전 사용자를 INVALID_MEMBERS 로 거부하던 버그(B 원본, main 동일). 수정.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toMemberIds(body: EnqueueBody, currentUserId: string) {
  const rawIds = Array.isArray(body.memberIds)
    ? body.memberIds
    : typeof body.memberIds === 'string'
      ? body.memberIds.split(',')
      : [];
  const ids = [currentUserId, ...rawIds]
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter(Boolean);

  return [...new Set(ids)];
}

function getRematchRestriction(lastRoomLeaveAt?: string | null) {
  if (!lastRoomLeaveAt) {
    return { availableAt: null, remainingMs: 0, restricted: false };
  }

  const leaveTime = new Date(lastRoomLeaveAt).getTime();
  if (!Number.isFinite(leaveTime)) {
    return { availableAt: null, remainingMs: 0, restricted: false };
  }

  const availableAtMs = leaveTime + POLICY.matching.rematchCooldownHours * 60 * 60 * 1000;
  const remainingMs = Math.max(availableAtMs - Date.now(), 0);

  return {
    availableAt: new Date(availableAtMs).toISOString(),
    remainingMs,
    restricted: remainingMs > 0,
  };
}

async function dispatchMatchPush(admin: any, roomId: string) {
  const { data: members, error: membersError } = await admin
    .from('room_member')
    .select('user_id')
    .eq('room_id', roomId)
    .eq('status', 'active');
  if (membersError) throw membersError;

  const userIds = [
    ...new Set(
      (members ?? [])
        .map((member: { user_id?: string | null }) => member.user_id)
        .filter((id: string | null | undefined): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  if (userIds.length === 0) return;

  const { data: settings, error: settingsError } = await admin
    .from('notification_setting')
    .select('user_id, push_enabled, match_alert')
    .in('user_id', userIds);
  if (settingsError) throw settingsError;

  const pushEnabledUserIds = new Set(userIds);
  for (const setting of (settings ?? []) as MatchPushSettingRow[]) {
    if (setting.push_enabled === false || setting.match_alert === false) {
      pushEnabledUserIds.delete(setting.user_id);
    }
  }
  if (pushEnabledUserIds.size === 0) return;

  const { data: tokens, error: tokensError } = await admin
    .from('push_token')
    .select('user_id, token')
    .in('user_id', [...pushEnabledUserIds]);
  if (tokensError) throw tokensError;

  const messages = ((tokens ?? []) as MatchPushTokenRow[])
    .filter((token) => pushEnabledUserIds.has(token.user_id))
    .map((token) => ({
      to: token.token,
      title: '매칭이 성사됐어요',
      body: '새 룸에서 오늘의 일상을 시작해보세요',
      sound: 'default',
      channelId: 'default',
      data: { roomId, type: 'match_created' },
    }));
  if (messages.length === 0) return;

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('method not allowed', 405, { code: 'METHOD_NOT_ALLOWED' });
  }

  // catch 에서 식별자를 잃지 않도록 hoist(user/memberIds 는 try 내부 선언).
  let userId: string | undefined;
  let memberCount: number | undefined;

  try {
    const { supabase, supabaseAsUser, user } = await getAuthenticatedUser(req);
    userId = user.id;
    const body = await req.json().catch(() => ({})) as EnqueueBody;
    const mode = toMatchQueueMode(body.mode);
    const memberIds = toMemberIds(body, user.id);
    memberCount = memberIds.length;

    if (
      memberIds.length < POLICY.team.minMembers
      || memberIds.length > POLICY.team.maxMembers
      || memberIds.some((id) => !UUID_PATTERN.test(id))
    ) {
      return errorResponse('묶음 인원을 다시 확인해주세요.', 400, { code: 'INVALID_MEMBERS' });
    }

    const { data: ownerProfileForQueue, error: ownerProfileForQueueError } = await supabase
      .from('profile')
      .select('last_room_leave_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (ownerProfileForQueueError) {
      throw ownerProfileForQueueError;
    }

    const { data: existingTeams, error: existingTeamsError } = await supabase
      .from('team_member')
      .select('team_id')
      .eq('user_id', user.id);

    if (existingTeamsError) {
      throw existingTeamsError;
    }

    const existingTeamIds = existingTeams?.map((row) => row.team_id) ?? [];
    if (existingTeamIds.length > 0) {
      const now = new Date().toISOString();
      const { data: existingQueue, error: existingQueueError } = await supabase
        .from('match_queue')
        .select('id, team_id, enqueued_at, expires_at')
        .in('team_id', existingTeamIds)
        .eq('status', 'waiting')
        .order('enqueued_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingQueueError) {
        throw existingQueueError;
      }

      if (existingQueue) {
        const lastRoomLeaveAt = ownerProfileForQueue?.last_room_leave_at ?? null;
        if (lastRoomLeaveAt && existingQueue.enqueued_at <= lastRoomLeaveAt) {
          const { data: staleQueues, error: staleQueueLookupError } = await supabase
            .from('match_queue')
            .select('id, team_id')
            .in('team_id', existingTeamIds)
            .eq('status', 'waiting')
            .lte('enqueued_at', lastRoomLeaveAt);

          if (staleQueueLookupError) {
            throw staleQueueLookupError;
          }

          const staleQueueIds = staleQueues?.map((queue) => queue.id) ?? [];
          const staleTeamIds = [...new Set(staleQueues?.map((queue) => queue.team_id) ?? [])];

          if (staleQueueIds.length > 0) {
            const [{ error: staleQueueUpdateError }, { error: staleTeamUpdateError }] = await Promise.all([
              supabase
                .from('match_queue')
                .update({ status: 'cancelled' })
                .in('id', staleQueueIds),
              supabase
                .from('team')
                .update({ disbanded_at: now, status: 'disbanded' })
                .in('id', staleTeamIds),
            ]);

            if (staleQueueUpdateError || staleTeamUpdateError) {
              throw staleQueueUpdateError ?? staleTeamUpdateError;
            }
          }
        } else if (!existingQueue.expires_at || existingQueue.expires_at > now) {
          return jsonResponse({
            enqueuedAt: existingQueue.enqueued_at,
            expiresAt: existingQueue.expires_at,
            memberCount: null,
            queueId: existingQueue.id,
            reused: true,
            teamId: existingQueue.team_id,
          });
        }

        const { error: expireQueueError } = await supabase
          .from('match_queue')
          .update({ status: 'expired' })
          .eq('id', existingQueue.id);

        if (expireQueueError) {
          throw expireQueueError;
        }

        const { error: expireTeamError } = await supabase
          .from('team')
          .update({ disbanded_at: now, status: 'disbanded' })
          .eq('id', existingQueue.team_id);

        if (expireTeamError) {
          throw expireTeamError;
        }
      }
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profile')
      .select('gender, is_adult, is_in_active_room, is_student, last_room_leave_at, nickname, onboarding_completed_at, photo_url, region, university_name, user_id')
      .in('user_id', memberIds);

    if (profilesError) {
      throw profilesError;
    }

    const profileRows = (profiles ?? []) as ProfileRow[];
    if (profileRows.length !== memberIds.length) {
      return errorResponse('초대할 수 없는 친구예요.', 400, { code: 'MEMBER_NOT_FOUND' });
    }

    const ownerProfile = profileRows.find((profile) => profile.user_id === user.id);
    if (!ownerProfile?.is_adult || !ownerProfile.gender || !ownerProfile.nickname || !ownerProfile.photo_url || !ownerProfile.onboarding_completed_at) {
      return errorResponse('프로필을 먼저 완성해주세요.', 403, { code: 'PROFILE_INCOMPLETE' });
    }

    if (profileRows.some((profile) => !profile.nickname || !profile.photo_url || !profile.onboarding_completed_at)) {
      return errorResponse('프로필을 먼저 완성해주세요.', 403, { code: 'PROFILE_INCOMPLETE' });
    }

    if (profileRows.some((profile) => profile.is_in_active_room)) {
      return errorResponse('초대할 수 없는 친구예요.', 409, { code: 'MEMBER_BUSY' });
    }

    if (profileRows.some((profile) => profile.gender !== ownerProfile.gender)) {
      return errorResponse('같은 성별 친구만 묶음에 포함할 수 있어요.', 400, { code: 'GENDER_MISMATCH' });
    }

    const collegeEligibilityFailure = getCollegeEligibilityFailure(mode, profileRows, memberIds.length);
    if (collegeEligibilityFailure) {
      return errorResponse(
        collegeEligibilityFailure === 'COLLEGE_TEAM_REQUIRED'
          ? '과팅은 친구를 1명 이상 추가해야 시작할 수 있어요.'
          : '과팅은 대학생 프로필을 완료한 친구만 참여할 수 있어요.',
        403,
        { code: collegeEligibilityFailure },
      );
    }

    const rematchRestriction = getRematchRestriction(ownerProfile.last_room_leave_at);
    let passToConsume: PassRow | null = null;

    if (rematchRestriction.restricted) {
      if (ownerProfile.gender === 'female' && POLICY.payment.femaleInstantRematchFree) {
        // 여성 사용자는 PRD §13에 따라 방 이탈 후 재매칭 제한을 자동 면제한다.
      } else {
        const { data: activePass, error: passError } = await supabase
          .from('pass')
          .select('id, remaining')
          .eq('user_id', user.id)
          .eq('kind', 'booster')
          .eq('status', 'active')
          .gt('remaining', 0)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (passError) {
          throw passError;
        }

        if (!activePass) {
          return errorResponse('다음 매칭은 12시간 후부터 가능해요.', 402, {
            availableAt: rematchRestriction.availableAt,
            code: 'REMATCH_RESTRICTED',
            remainingMs: rematchRestriction.remainingMs,
          });
        }

        passToConsume = activePass;
      }
    }

    for (const memberId of memberIds) {
      if (memberId === user.id) continue;
      const { data: isBlocked, error: blockError } = await supabase.rpc('is_blocked_between', {
        a: user.id,
        b: memberId,
      });

      if (blockError) {
        throw blockError;
      }

      if (isBlocked) {
        return errorResponse('초대할 수 없는 친구예요.', 409, { code: 'BLOCKED_MEMBER' });
      }
    }

    const { data: team, error: teamError } = await supabase
      .from('team')
      .insert({
        gender: ownerProfile.gender,
        owner_user_id: user.id,
        status: 'matching',
        target_size: memberIds.length,
      })
      .select('id')
      .single();

    if (teamError || !team) {
      throw teamError ?? new Error('team was not created');
    }

    const { error: memberInsertError } = await supabase.from('team_member').insert(
      memberIds.map((memberId) => ({
        role: memberId === user.id ? 'owner' : 'member',
        team_id: team.id,
        user_id: memberId,
      })),
    );

    if (memberInsertError) {
      throw memberInsertError;
    }

    const expiresAt = new Date(
      Date.now() + POLICY.matching.queueExpiryHours * 60 * 60 * 1000,
    ).toISOString();

    const requiredGender = ownerProfile.gender === 'male' ? 'female' : 'male';
    const { data: queue, error: queueError } = await supabase
      .from('match_queue')
      .insert({
        desired_size: memberIds.length,
        expires_at: expiresAt,
        gender: ownerProfile.gender,
        mode,
        region: ownerProfile.region,
        required_gender: requiredGender,
        status: 'waiting',
        team_id: team.id,
      })
      .select('id, enqueued_at, expires_at')
      .single();

    if (queueError || !queue) {
      throw queueError ?? new Error('queue was not created');
    }

    // 자동 즉시 매칭 (config 게이트 — 앱 재빌드 없이 DB 토글). 매칭 규칙·임계값은
    // 전부 RPC(try_match) + match_config 에 있어 Edge 는 게이트만 본다.
    const { data: cfg } = await supabase
      .from('match_config')
      .select('value')
      .eq('key', 'automation')
      .maybeSingle();
    // match_config.value 는 jsonb — supabase-js 는 jsonb 문자열을 따옴표 포함
    // (예: "\"auto_immediate\"") 또는 이미 파싱된 string 으로 줄 수 있다. 둘 다 정규화.
    const rawAutomation = cfg?.value;
    let automation = 'manual_admin_curation';
    if (typeof rawAutomation === 'string') {
      try {
        const parsed = JSON.parse(rawAutomation);
        automation = typeof parsed === 'string' ? parsed : rawAutomation;
      } catch {
        automation = rawAutomation; // 이미 plain string 이면 그대로
      }
    } else if (rawAutomation != null) {
      automation = String(rawAutomation);
    }

    let matchId: string | null = null;
    if (automation === 'auto_immediate' || automation === 'auto_scored') {
      // SECURITY DEFINER RPC 를 호출 사용자 JWT(authenticated grant)로 트리거.
      // try_match 호출 실패/누락(상대는 큐에 있는데 트리거만 실패한 좁은 케이스)에
      // 대비해 1회 재시도(sweep cron 대체 — 명세 §8). 재시도도 실패하면 'queued'.
      for (let attempt = 0; attempt < 2 && !matchId; attempt += 1) {
        const { data: gm, error: matchError } = await supabaseAsUser.rpc('try_match', {
          p_queue_id: queue.id,
        });
        if (!matchError && gm) {
          matchId = gm as string;
          break;
        }
        if (!matchError) break; // 정상 호출인데 매칭 미성사(null) → 재시도 불필요, 대기 잔류
        // matchError 발생 — 마지막 시도까지 실패하면 조용한 매칭 실패(CLAUDE.md 경고).
        if (attempt === 1) {
          captureEdgeMessage('enqueue-match-queue', 'try_match RPC failed — queued fallback', {
            stage: 'try_match',
            level: 'warning',
            userId: user.id,
            tags: { feature: 'matching' },
            extra: { attempt, queueId: queue.id, detail: matchError.message },
          });
        }
      }
    }

    if (matchId) {
      const { data: gm } = await supabase
        .from('group_match')
        .select('room_id')
        .eq('id', matchId)
        .maybeSingle();
      const roomId = gm?.room_id ?? null;
      if (roomId) {
        await dispatchMatchPush(supabase, roomId).catch((error) => {
          captureEdgeError('enqueue-match-queue', error, {
            stage: 'match_push',
            status: 200,
            userId: user.id,
            level: 'warning',
            tags: { feature: 'matching-push', code: 'match_push_failed' },
            extra: { matchId, roomId },
          });
        });
      }
      return jsonResponse({
        enqueuedAt: queue.enqueued_at,
        expiresAt: queue.expires_at,
        freeRematchWaived:
          rematchRestriction.restricted
          && ownerProfile.gender === 'female'
          && POLICY.payment.femaleInstantRematchFree,
        matched: true,
        matchId,
        memberCount: memberIds.length,
        passConsumed: Boolean(passToConsume),
        queueId: queue.id,
        reused: false,
        roomId,
        status: 'matched',
        teamId: team.id,
      });
    }

    return jsonResponse({
      enqueuedAt: queue.enqueued_at,
      expiresAt: queue.expires_at,
      freeRematchWaived:
        rematchRestriction.restricted
        && ownerProfile.gender === 'female'
        && POLICY.payment.femaleInstantRematchFree,
      matched: false,
      memberCount: memberIds.length,
      passConsumed: false,
      queueId: queue.id,
      reused: false,
      status: 'queued',
      teamId: team.id,
    });
  } catch (error) {
    // team/match_queue/pass/profile/is_blocked_between 어디서 throw 하든 지금까지
    // generic 400 으로 가려졌다. 실제 enqueue 파이프라인 실패를 기록.
    captureEdgeError('enqueue-match-queue', error, {
      stage: 'enqueue_pipeline',
      status: 500,
      userId,
      tags: { feature: 'matching', code: 'BAD_REQUEST' },
      extra: { memberCount },
    });
    const message = error instanceof Error ? error.message : 'failed to enqueue match queue';
    return errorResponse(message, 400, { code: 'BAD_REQUEST' });
  }
});
