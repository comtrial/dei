import { View } from 'react-native';

import { Screen } from '@/components/app/screen';
import { Text } from '@/components/ui/text';

export default function MatchesScreen() {
  return (
    <Screen eyebrow="Matches" title="서로 좋아요를 보낸 사람들">
      <View className="border-border min-h-80 items-center justify-center rounded-md border p-6">
        <Text className="text-center text-lg font-semibold">아직 매칭이 없습니다</Text>
        <Text className="text-muted-foreground mt-2 text-center leading-6">
          매칭 로직은 승인 게이트 다음 단계에서 붙입니다.
        </Text>
      </View>
    </Screen>
  );
}
