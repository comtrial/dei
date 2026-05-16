import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export function SentLikesEmpty() {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="w-28 h-28 rounded-full bg-muted items-center justify-center mb-6">
        <Text className="text-4xl">💌</Text>
      </View>
      <Text className="text-foreground text-lg font-semibold text-center">
        아직 보낸 좋아요가 없어요
      </Text>
      <Text className="text-muted-foreground text-sm text-center mt-2 leading-5">
        홈 화면에서 마음에 드는 사람에게{'\n'}좋아요를 보내보세요
      </Text>
    </View>
  );
}
