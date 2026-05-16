import { useRouter } from 'expo-router';
import { Video } from 'lucide-react-native';
import { TouchableOpacity, View } from 'react-native';

import { Text } from '@/components/ui/text';

export function B2Banner() {
  const router = useRouter();

  return (
    <TouchableOpacity
      onPress={() => router.push('/(app)/record')}
      activeOpacity={0.85}
      className="mx-3 mb-2 flex-row items-center gap-2 rounded-xl bg-[#EDE4D0] p-3">
      <View className="h-8 w-8 items-center justify-center rounded-full bg-[#C0432A]/10">
        <Video size={15} color="#C0432A" />
      </View>
      <Text className="flex-1 text-xs leading-[18px] text-[#6E6354]">
        영상을 찍으면{'\n'}좋아요를 보낼 수 있어요
      </Text>
      <Text className="text-xs font-semibold text-[#C0432A]">촬영 →</Text>
    </TouchableOpacity>
  );
}
