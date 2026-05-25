import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';

/**
 * Phase 1 placeholder — 옛 큐레이션 홈을 폐기한 직후의 임시 화면.
 *
 * 새 도메인(과팅 / 방) 홈은 Phase 3 에서 정식 구현 예정.
 * 그 전까지 (app) 그룹의 진입점이 비면 expo-router 가 깨지므로
 * 안전한 빈 화면을 유지한다.
 *
 * 작업 추적: docs/rooms-spec/screens.md — `(app)/home.tsx`
 */
export default function HomePlaceholderScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-6" testID="home-placeholder">
        <Text className="mb-2 text-center text-lg font-semibold text-foreground">
          새 도메인 준비 중
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          그룹 소개팅(방) 흐름은 곧 이 자리에 들어옵니다.
        </Text>
      </View>
    </SafeAreaView>
  );
}
