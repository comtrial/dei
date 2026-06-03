// apps/mobile/lib/notifications.ts
import * as Notifications from 'expo-notifications';
import { logger } from '@dei/shared';

import { supabase } from '@/lib/supabase';

export async function registerPushToken(userId: string, platform: 'ios' | 'android'): Promise<void> {
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return;
    const { data: token } = await Notifications.getExpoPushTokenAsync();
    if (!token) return;
    await supabase.from('push_token').upsert(
      { user_id: userId, token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' },
    );
  } catch (err) {
    logger.captureException(err, { tags: { feature: 'push-register' } });
  }
}
