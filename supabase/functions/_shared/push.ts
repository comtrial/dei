import { POLICY } from '../../../packages/shared/src/policy.ts';

export type PushCategory = 'match_alert' | 'chat_mention' | 'upload_reminder';

export type PushData = Record<string, string | number | boolean | null | undefined>;

export type PushDispatchInput = {
  body: string;
  category: PushCategory;
  data: PushData;
  now?: Date;
  quietHoursMode: 'respect' | 'exempt';
  title: string;
  userIds: string[];
};

export type PushDispatchResult = {
  attempted: number;
  failed: number;
  ok: boolean;
  sent: number;
  skipped: {
    disabled: number;
    duplicateUser: number;
    noToken: number;
    noUser: number;
    quietHours: number;
  };
};

type NotificationSettingRow = {
  chat_mention?: boolean | null;
  match_alert?: boolean | null;
  push_enabled?: boolean | null;
  upload_reminder?: boolean | null;
  user_id?: string | null;
};

type ProfileQuietHoursRow = {
  quiet_hours_end?: number | null;
  quiet_hours_start?: number | null;
  user_id?: string | null;
};

type PushTokenRow = {
  token?: string | null;
  user_id?: string | null;
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_CHUNK_SIZE = 100;

function uniqueUserIds(userIds: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  let duplicateUser = 0;
  let noUser = 0;

  for (const rawUserId of userIds) {
    const userId = rawUserId.trim();
    if (!userId) {
      noUser += 1;
      continue;
    }
    if (seen.has(userId)) {
      duplicateUser += 1;
      continue;
    }
    seen.add(userId);
    unique.push(userId);
  }

  return { duplicateUser, noUser, unique };
}

function getKstHour(now: Date) {
  const hourPart = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).formatToParts(now).find((part) => part.type === 'hour');
  const hour = Number(hourPart?.value ?? '0');
  return hour === 24 ? 0 : hour;
}

function isQuietHourKst(now: Date, startHour: number, endHour: number) {
  if (startHour === endHour) return false;

  const hour = getKstHour(now);
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  return hour >= startHour || hour < endHour;
}

function isSettingDisabled(setting: NotificationSettingRow | undefined, category: PushCategory) {
  return setting?.push_enabled === false || setting?.[category] === false;
}

function isQuietForProfile(profile: ProfileQuietHoursRow | undefined, now: Date) {
  const start = profile?.quiet_hours_start ?? POLICY.notifications.quietHours.startHourKst;
  const end = profile?.quiet_hours_end ?? POLICY.notifications.quietHours.endHourKst;
  return isQuietHourKst(now, start, end);
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function sendExpoChunk(messages: Array<Record<string, unknown>>) {
  const response = await fetch(EXPO_PUSH_URL, {
    body: JSON.stringify(messages),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Expo push failed: HTTP ${response.status}`);
  }

  try {
    const payload = await response.json();
    const tickets = Array.isArray(payload?.data) ? payload.data : [];
    if (tickets.length === 0) {
      return { failed: 0, sent: messages.length };
    }

    return tickets.reduce(
      (acc: { failed: number; sent: number }, ticket: { status?: string }) => {
        if (ticket?.status === 'error') {
          acc.failed += 1;
        } else {
          acc.sent += 1;
        }
        return acc;
      },
      { failed: 0, sent: 0 },
    );
  } catch {
    return { failed: 0, sent: messages.length };
  }
}

export async function getActiveRoomMemberUserIds(
  admin: any,
  roomId: string,
  options: { excludeUserIds?: string[] } = {},
): Promise<string[]> {
  const { data, error } = await admin
    .from('room_member')
    .select('user_id')
    .eq('room_id', roomId)
    .eq('status', 'active');

  if (error) throw error;

  const excluded = new Set(options.excludeUserIds ?? []);
  return [
    ...new Set(
      ((data ?? []) as Array<{ user_id?: string | null }>)
        .map((member) => member.user_id)
        .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0)
        .filter((userId) => !excluded.has(userId)),
    ),
  ];
}

export async function getProfileNickname(admin: any, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('profile')
    .select('nickname')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  const nickname = (data as { nickname?: string | null } | null)?.nickname;
  return typeof nickname === 'string' && nickname.trim().length > 0 ? nickname.trim() : null;
}

export async function sendPushToUsers(
  admin: any,
  input: PushDispatchInput,
): Promise<PushDispatchResult> {
  const { duplicateUser, noUser, unique } = uniqueUserIds(input.userIds);
  const result: PushDispatchResult = {
    attempted: 0,
    failed: 0,
    ok: true,
    sent: 0,
    skipped: {
      disabled: 0,
      duplicateUser,
      noToken: 0,
      noUser,
      quietHours: 0,
    },
  };

  if (unique.length === 0) return result;

  const enabled = new Set(unique);

  const { data: settings, error: settingsError } = await admin
    .from('notification_setting')
    .select('user_id, push_enabled, match_alert, upload_reminder, chat_mention')
    .in('user_id', unique);
  if (settingsError) throw settingsError;

  for (const setting of (settings ?? []) as NotificationSettingRow[]) {
    const userId = setting.user_id;
    if (!userId || !enabled.has(userId)) continue;
    if (isSettingDisabled(setting, input.category)) {
      enabled.delete(userId);
      result.skipped.disabled += 1;
    }
  }

  if (enabled.size === 0) return result;

  if (input.quietHoursMode === 'respect') {
    const now = input.now ?? new Date();
    const { data: profiles, error: profilesError } = await admin
      .from('profile')
      .select('user_id, quiet_hours_start, quiet_hours_end')
      .in('user_id', [...enabled]);
    if (profilesError) throw profilesError;

    const profileByUserId = new Map<string, ProfileQuietHoursRow>();
    for (const profile of (profiles ?? []) as ProfileQuietHoursRow[]) {
      if (profile.user_id) profileByUserId.set(profile.user_id, profile);
    }

    for (const userId of [...enabled]) {
      if (isQuietForProfile(profileByUserId.get(userId), now)) {
        enabled.delete(userId);
        result.skipped.quietHours += 1;
      }
    }
  }

  if (enabled.size === 0) return result;

  const { data: tokens, error: tokensError } = await admin
    .from('push_token')
    .select('user_id, token')
    .in('user_id', [...enabled]);
  if (tokensError) throw tokensError;

  const messages = ((tokens ?? []) as PushTokenRow[])
    .filter((row) => row.user_id && row.token && enabled.has(row.user_id))
    .map((row) => ({
      body: input.body,
      channelId: 'default',
      data: input.data,
      sound: 'default',
      title: input.title,
      to: row.token,
    }));

  const usersWithTokens = new Set(
    ((tokens ?? []) as PushTokenRow[])
      .filter((row) => row.user_id && row.token && enabled.has(row.user_id))
      .map((row) => row.user_id as string),
  );
  result.skipped.noToken = Math.max(enabled.size - usersWithTokens.size, 0);

  if (messages.length === 0) return result;

  result.attempted = messages.length;
  for (const messagesChunk of chunk(messages, EXPO_CHUNK_SIZE)) {
    const chunkResult = await sendExpoChunk(messagesChunk);
    result.failed += chunkResult.failed;
    result.sent += chunkResult.sent;
  }
  result.ok = result.failed === 0;

  return result;
}

export async function sendPushToRoomMembers(
  admin: any,
  input: Omit<PushDispatchInput, 'userIds'> & {
    excludeUserIds?: string[];
    roomId: string;
  },
) {
  const userIds = await getActiveRoomMemberUserIds(admin, input.roomId, {
    excludeUserIds: input.excludeUserIds,
  });

  return sendPushToUsers(admin, {
    body: input.body,
    category: input.category,
    data: input.data,
    now: input.now,
    quietHoursMode: input.quietHoursMode,
    title: input.title,
    userIds,
  });
}
