import { View } from 'react-native';

import { Screen } from '@/components/app/screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAccountGate } from '@/providers/account-gate-provider';
import { useAuth } from '@/providers/auth-provider';

export default function AccountStatusScreen() {
  const { eligibility } = useAccountGate();
  const { signOut } = useAuth();

  return (
    <Screen
      eyebrow="Account"
      title="계정 상태를 확인해 주세요"
      description="운영자 조치가 걸린 계정은 매칭과 DM에 들어갈 수 없습니다.">
      <View className="gap-5">
        <View className="border-border rounded-md border p-4">
          <Text className="text-muted-foreground text-sm">현재 상태</Text>
          <Text className="mt-2 text-2xl font-semibold">
            {eligibility?.account_state ?? '확인 중'}
          </Text>
        </View>
        <Button onPress={signOut} variant="outline">
          <Text>로그아웃</Text>
        </Button>
      </View>
    </Screen>
  );
}
