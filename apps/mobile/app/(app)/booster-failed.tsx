import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlertDialog, Banner, Card, Text } from '@dei/ui';

import { ROUTES } from '@/lib/routes';

export default function BoosterFailedScreen() {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 px-[24px] pt-[90px]">
        <Banner tone="info" icon="i" title="추가 페널티 없음">
          결제가 실패해도 24시간 제한 시간이 늘어나지는 않아요.
        </Banner>
        <Pressable accessibilityRole="button" onPress={() => setCopied(true)}>
          <Card className="mt-[18px] px-[16px] py-[14px]">
            <Text className="text-[11px] font-bold text-ink-3">PG ERROR</Text>
            <Text className="mt-[4px] text-[14px] font-extrabold text-ink">
              portone_payment_not_ready
            </Text>
            <Text className="mt-[4px] text-[11.5px] text-ink-3">
              {copied ? '복사됨' : '탭하면 고객센터에 전달할 코드를 표시해요.'}
            </Text>
          </Card>
        </Pressable>
      </View>

      <AlertDialog
        visible
        tone="danger"
        icon="!"
        title="결제가 완료되지 않았어요"
        description="결제 도중 문제가 생겼어요. 제한 상태는 그대로 유지됩니다."
        actions={[
          { label: '다른 결제 수단으로 재시도', variant: 'ink', onPress: () => router.replace(ROUTES.booster) },
          { label: '고객센터 문의', variant: 'secondary', onPress: () => router.replace(ROUTES.support) },
          { label: '닫기', variant: 'tertiary', onPress: () => router.replace(ROUTES.home) },
        ]}
        onDismiss={() => router.replace(ROUTES.home)}
      />
    </SafeAreaView>
  );
}
