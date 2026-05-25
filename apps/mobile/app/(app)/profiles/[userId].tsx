import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { logger } from '@dei/shared';

import { ProfileScreen } from '@/components/profile/ProfileScreen';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export default function PublicProfileRoute() {
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const { user } = useAuth();
  const profileUserId = userId?.trim() || undefined;

  useEffect(() => {
    if (!profileUserId || !user?.id || profileUserId === user.id) {
      return;
    }

    let cancelled = false;

    supabase.functions
      .invoke('record-profile-view', { body: { viewedUserId: profileUserId } })
      .then(({ error }) => {
        if (!error || cancelled) {
          return;
        }

        logger.captureMessage('profile-view-notification.failed', 'warning', {
          extra: { viewedUserId: profileUserId },
          tags: { feature: 'profile-view', layer: 'edge' },
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        logger.captureException(error, {
          extra: { viewedUserId: profileUserId },
          tags: { feature: 'profile-view', layer: 'edge' },
        });
      });

    return () => {
      cancelled = true;
    };
  }, [profileUserId, user?.id]);

  return <ProfileScreen mode="public" profileUserId={profileUserId} />;
}
