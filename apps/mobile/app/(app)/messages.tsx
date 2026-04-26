import { View } from 'react-native';

import { Screen } from '@/components/app/screen';
import { Text } from '@/components/ui/text';

export default function MessagesScreen() {
  return (
    <Screen eyebrow="DM" title="매칭된 사람과만 대화합니다">
      <View className="border-border min-h-80 items-center justify-center rounded-md border p-6">
        <Text className="text-center text-lg font-semibold">대화가 없습니다</Text>
        <Text className="text-muted-foreground mt-2 text-center leading-6">
          MVP에서는 텍스트 DM과 신고·차단 버튼부터 연결합니다.
        </Text>
      </View>
    </Screen>
  );
}
