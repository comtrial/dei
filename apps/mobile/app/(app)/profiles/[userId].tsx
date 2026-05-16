import { useLocalSearchParams } from 'expo-router';

import { ProfileScreen } from '@/components/profile/ProfileScreen';

export default function PublicProfileRoute() {
  const { userId } = useLocalSearchParams<{ userId?: string }>();

  return <ProfileScreen mode="public" profileUserId={userId} />;
}
