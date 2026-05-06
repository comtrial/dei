import { Bell } from 'lucide-react-native';
import { TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useNotifications } from '@/hooks/useNotifications';

export function HomeTopBar() {
  const insets = useSafeAreaInsets();
  const { hasUnread } = useNotifications();

  return (
    <View
      className="flex-row items-center justify-between px-4 pb-3"
      style={{ paddingTop: insets.top + 8 }}>
      <Text className="text-lg font-bold tracking-tight text-[#171310]">dei.</Text>
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
  );
}
