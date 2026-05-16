import { Pressable, View } from 'react-native';

import { useRouter } from 'expo-router';

import { Text } from '@/components/ui/text';

export function ReceivedLikesEmpty() {
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="w-28 h-28 rounded-full bg-muted items-center justify-center mb-6">
        <Text className="text-4xl">🤍</Text>
      </View>
      <Text className="text-foreground text-lg font-semibold text-center">
        아직 받은 좋아요가 없어요
      </Text>
      <Text className="text-muted-foreground text-sm text-center mt-2 leading-5">
        데일리 로그를 만들어{'\n'}더 많은 사람을 만나보세요
      </Text>
      <Pressable
        onPress={() => router.push('/(app)/record')}
        className="mt-8 bg-primary rounded-xl px-8 py-3 active:opacity-80"
        testID="likes-empty-cta"
      >
        <Text className="text-primary-foreground font-medium">로그 촬영하러 가기</Text>
      </Pressable>
    </View>
  );
}
