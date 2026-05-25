import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { logger } from '@dei/shared';

import type { AppNotification, RegisterPushTokenInput } from '@/lib/notifications';
import { requestAndRegisterPushToken as requestAndRegisterDevicePushToken } from '@/lib/push-notifications';
import { supabase } from '@/lib/supabase';

export function useNotifications(userId: string | undefined) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setUnreadCount(0);
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, user_id, type, title, body, route, metadata, dedupe_key, read_at, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const nextItems = (data ?? []) as AppNotification[];
      setItems(nextItems);
      setUnreadCount(nextItems.filter((item) => item.read_at === null).length);
    } catch (error) {
      logger.captureException(error, {
        tags: { feature: 'notifications', action: 'refresh' },
        extra: { userId },
      });
      setItems([]);
      setUnreadCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!userId) return false;

      try {
        const { error } = await supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', notificationId)
          .eq('user_id', userId)
          .is('read_at', null);

        if (error) throw error;
        await refresh();
        return true;
      } catch (error) {
        logger.captureException(error, {
          tags: { feature: 'notifications', action: 'mark-read' },
          extra: { notificationId, userId },
        });
        return false;
      }
    },
    [refresh, userId]
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return false;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('read_at', null);

      if (error) throw error;
      await refresh();
      return true;
    } catch (error) {
      logger.captureException(error, {
        tags: { feature: 'notifications', action: 'mark-all-read' },
        extra: { userId },
      });
      return false;
    }
  }, [refresh, userId]);

  const registerPushToken = useCallback(
    async (input: RegisterPushTokenInput) => {
      if (!userId) return false;

      try {
        const { error } = await supabase.rpc('register_user_push_token', {
          p_app_version: input.appVersion ?? undefined,
          p_device_label: input.deviceLabel ?? undefined,
          p_installation_id_hash: input.installationIdHash,
          p_platform: input.platform,
          p_push_provider: input.pushProvider ?? 'expo',
          p_push_token: input.pushToken,
        });

        if (error) throw error;
        return true;
      } catch (error) {
        logger.captureException(error, {
          tags: { feature: 'notifications', action: 'register-push-token' },
          extra: { platform: input.platform, userId },
        });
        return false;
      }
    },
    [userId]
  );

  const requestAndRegisterPushToken = useCallback(
    async () => requestAndRegisterDevicePushToken(userId),
    [userId]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;

    if (channelRef.current) {
      channelRef.current.unsubscribe();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channelName = `notifications-${userId}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `user_id=eq.${userId}`,
          schema: 'public',
          table: 'notifications',
        },
        () => refresh()
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [refresh, userId]);

  return useMemo(
    () => ({
      hasUnread: unreadCount > 0,
      isLoading,
      items,
      markAllRead,
      markRead,
      refresh,
      requestAndRegisterPushToken,
      registerPushToken,
      unreadCount,
    }),
    [
      isLoading,
      items,
      markAllRead,
      markRead,
      refresh,
      registerPushToken,
      requestAndRegisterPushToken,
      unreadCount,
    ]
  );
}
