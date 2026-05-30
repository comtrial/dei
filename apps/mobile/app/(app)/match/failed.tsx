import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlertDialog, Text } from '@dei/ui';

import { ROUTES } from '@/lib/routes';

export default function MatchFailedScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center px-[24px]">
        <Text variant="h2" className="text-center">
          매칭 실패 안내
        </Text>
      </View>
      <AlertDialog
        visible
        tone="danger"
        icon="!"
        title="이번에는 매칭되지 않았어요"
        description="큐 시간이 만료됐거나 조건이 맞지 않았어요. 제한 상태라면 바로 매치를 사용할 수 있어요."
        actions={[
          { label: '다시 대기하기', variant: 'ink', onPress: () => router.replace(ROUTES.permissionNotification) },
          { label: '바로 매치 보기', variant: 'secondary', onPress: () => router.replace(ROUTES.booster) },
          { label: '홈으로', variant: 'tertiary', onPress: () => router.replace(ROUTES.home) },
        ]}
        onDismiss={() => router.replace(ROUTES.home)}
      />
    </SafeAreaView>
  );
}
