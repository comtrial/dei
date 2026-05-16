import { ProfileScreen } from '@/components/profile/ProfileScreen';
import { useAuth } from '@/providers/auth-provider';

export default function MyProfileRoute() {
  const { user } = useAuth();

  return <ProfileScreen mode="self" profileUserId={user?.id} />;
}
