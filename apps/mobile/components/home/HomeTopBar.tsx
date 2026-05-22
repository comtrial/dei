import { useRouter } from 'expo-router';
import { UserCircle } from 'lucide-react-native';
import { TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeartBalancePill, RefreshTicketBalancePill } from '@/components/home/HeartBalancePill';
import { Text } from '@/components/ui/text';
import { ROUTES } from '@/lib/routes';

type HomeTopBarProps = {
  heartCount?: number;
  refreshItemCount?: number;
};

export function HomeTopBar({ heartCount, refreshItemCount }: HomeTopBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      className="flex-row items-center justify-between bg-[#F5EDDB] px-4 pb-3"
      style={{ paddingTop: insets.top + 8 }}>
      <Text className="text-lg font-bold tracking-tight text-[#171310]">dei.</Text>
      <View className="flex-row items-center gap-2">
        <HeartBalancePill heartCount={heartCount} />
        <RefreshTicketBalancePill refreshItemCount={refreshItemCount} />

        <TouchableOpacity
          accessibilityLabel="내 프로필"
          hitSlop={12}
          onPress={() => router.push(ROUTES.myProfile as never)}
        >
          <View className="h-7 w-7 items-center justify-center">
            <UserCircle size={21} color="#171310" />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}
