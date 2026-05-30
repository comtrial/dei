import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics } from '@dei/shared';
import { AlertDialog, Text } from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { ROUTES } from '@/lib/routes';

export default function MatchCancelConfirmScreen() {
  const router = useRouter();

  const cancelQueue = () => {
    analytics.capture(ANALYTICS_EVENTS.match_cancelled_by_user);
    router.replace(ROUTES.home);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 items-center justify-center px-[24px]">
        <Text variant="h2" className="text-center">
          매칭 취소 확인
        </Text>
      </View>
      <AlertDialog
        visible
        tone="warn"
        icon="?"
        title="대기를 취소할까요?"
        description="지금 취소하면 홈으로 돌아가요. 이미 매칭된 방은 취소되지 않아요."
        actions={[
          { label: '계속 기다리기', variant: 'secondary', onPress: () => router.replace(ROUTES.queue) },
          { label: '대기 취소', variant: 'ink', onPress: cancelQueue },
        ]}
        onDismiss={() => router.replace(ROUTES.queue)}
      />
    </SafeAreaView>
  );
}
