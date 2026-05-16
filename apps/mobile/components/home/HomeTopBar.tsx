import { useRouter } from 'expo-router';
import { Bell, UserCircle } from 'lucide-react-native';
import { TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useNotifications } from '@/hooks/useNotifications';
import { ROUTES } from '@/lib/routes';

export function HomeTopBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { hasUnread } = useNotifications();

  return (
    <View
      className="flex-row items-center justify-between bg-[#F5EDDB] px-4 pb-3"
      style={{ paddingTop: insets.top + 8 }}>
      <Text className="text-lg font-bold tracking-tight text-[#171310]">dei.</Text>
      <View className="flex-row items-center gap-2">
        <TouchableOpacity
          accessibilityLabel="내 프로필"
          hitSlop={12}
          onPress={() => router.push(ROUTES.myProfile as never)}
        >
          <View className="h-7 w-7 items-center justify-center">
            <UserCircle size={21} color="#171310" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity hitSlop={12}>
          <View className="relative h-7 w-7 items-center justify-center">
            <Bell size={20} color="#171310" />
            {hasUnread && (
              <View
                className="absolute right-0 top-0 h-[7px] w-[7px] rounded-full bg-[#C0432A]"
                style={{ borderWidth: 1.5, borderColor: '#F5EDDB' }}
              />
            )}
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}
