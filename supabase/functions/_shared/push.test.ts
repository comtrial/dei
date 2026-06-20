import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getActiveRoomMemberUserIds,
  sendPushToUsers,
} from './push.ts';

function query(data: unknown[] = [], error: unknown = null) {
  const chain: Record<string, unknown> = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    order: vi.fn(() => chain),
    select: vi.fn(() => chain),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data, error }).then(resolve, reject),
  };
  return chain;
}

function adminMock(rows: Record<string, unknown[]>) {
  return {
    from: vi.fn((table: string) => query(rows[table] ?? [])),
  };
}

describe('sendPushToUsers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('respects push settings and user quiet hours for regular chat notifications', async () => {
    const admin = adminMock({
      notification_setting: [
        { user_id: 'u2', push_enabled: true, chat_mention: false },
        { user_id: 'u3', push_enabled: false, chat_mention: true },
        { user_id: 'u4', push_enabled: true, chat_mention: true },
      ],
      profile: [
        { user_id: 'u1', quiet_hours_start: 0, quiet_hours_end: 7 },
        { user_id: 'u2', quiet_hours_start: 0, quiet_hours_end: 7 },
        { user_id: 'u3', quiet_hours_start: 0, quiet_hours_end: 7 },
        { user_id: 'u4', quiet_hours_start: 2, quiet_hours_end: 4 },
      ],
      push_token: [
        { user_id: 'u1', token: 'ExponentPushToken[u1]' },
        { user_id: 'u2', token: 'ExponentPushToken[u2]' },
        { user_id: 'u3', token: 'ExponentPushToken[u3]' },
        { user_id: 'u4', token: 'ExponentPushToken[u4]' },
      ],
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [{ status: 'ok' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendPushToUsers(admin, {
      body: 'body',
      category: 'chat_mention',
      data: { type: 'room_message' },
      now: new Date('2026-06-10T16:00:00.000Z'), // KST 01:00
      quietHoursMode: 'respect',
      title: 'title',
      userIds: ['u1', 'u2', 'u3', 'u4'],
    });

    expect(result.sent).toBe(1);
    expect(result.skipped).toEqual(expect.objectContaining({
      disabled: 2,
      quietHours: 1,
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual([
      expect.objectContaining({ to: 'ExponentPushToken[u4]' }),
    ]);
  });

  it('can exempt whisper notifications from quiet hours', async () => {
    const admin = adminMock({
      notification_setting: [],
      profile: [
        { user_id: 'u1', quiet_hours_start: 0, quiet_hours_end: 7 },
      ],
      push_token: [
        { user_id: 'u1', token: 'ExponentPushToken[u1]' },
      ],
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [{ status: 'ok' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendPushToUsers(admin, {
      body: '귓속말이 도착했어요',
      category: 'chat_mention',
      data: { type: 'whisper_mention' },
      now: new Date('2026-06-10T16:00:00.000Z'), // KST 01:00
      quietHoursMode: 'exempt',
      title: '보낸 사람',
      userIds: ['u1'],
    });

    expect(result.sent).toBe(1);
    expect(result.skipped.quietHours).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('getActiveRoomMemberUserIds', () => {
  it('returns active room members excluding provided user ids', async () => {
    const admin = adminMock({
      room_member: [
        { user_id: 'sender' },
        { user_id: 'u2' },
        { user_id: 'u3' },
        { user_id: null },
      ],
    });

    await expect(
      getActiveRoomMemberUserIds(admin, 'room-1', { excludeUserIds: ['sender'] }),
    ).resolves.toEqual(['u2', 'u3']);
  });
});
