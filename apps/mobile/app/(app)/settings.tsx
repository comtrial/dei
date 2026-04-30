import { View } from 'react-native';

import { Screen } from '@/components/app/screen';
import { StatusRow } from '@/components/app/status-row';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAccountGate } from '@/providers/account-gate-provider';
import { useAuth } from '@/providers/auth-provider';

export default function SettingsScreen() {
  const { eligibility, refresh } = useAccountGate();
  const { signOut, user } = useAuth();

  return (
    <Screen eyebrow="Settings" title="계정과 안전 상태">
      <View className="gap-6">
        <View>
          <StatusRow
            detail={user?.email ?? undefined}
            label="계정"
            tone={eligibility?.account_state === 'active' ? 'success' : 'warning'}
            value={eligibility?.account_state ?? '확인 중'}
          />
          <StatusRow
            label="다음 단계"
            tone={eligibility?.next_step === 'complete' ? 'success' : 'warning'}
            value={eligibility?.next_step ?? '확인 중'}
          />
        </View>

        <Button onPress={() => refresh()} variant="outline">
          <Text>상태 새로고침</Text>
        </Button>

        <Button onPress={signOut} variant="destructive">
          <Text>로그아웃</Text>
        </Button>
      </View>
    </Screen>
  );
}
