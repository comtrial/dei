// apps/mobile/lib/__tests__/notifications.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const getExpoPushTokenAsync = vi.fn();
const getPermissionsAsync = vi.fn();
const requestPermissionsAsync = vi.fn();
vi.mock('expo-notifications', () => ({
  getExpoPushTokenAsync: (...a: unknown[]) => getExpoPushTokenAsync(...a),
  getPermissionsAsync: (...a: unknown[]) => getPermissionsAsync(...a),
  requestPermissionsAsync: (...a: unknown[]) => requestPermissionsAsync(...a),
}));
const upsert = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ upsert }) } }));

import { registerPushToken } from '../notifications';

beforeEach(() => { getExpoPushTokenAsync.mockReset(); upsert.mockClear(); getPermissionsAsync.mockReset(); });

describe('registerPushToken', () => {
  it('upserts token when permission granted', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    getExpoPushTokenAsync.mockResolvedValue({ data: 'ExpoTok[xyz]' });
    await registerPushToken('user-1', 'ios');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', token: 'ExpoTok[xyz]', platform: 'ios' }),
      expect.any(Object),
    );
  });

  it('skips upsert when permission denied', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'denied' });
    requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    await registerPushToken('user-1', 'ios');
    expect(upsert).not.toHaveBeenCalled();
  });
});
