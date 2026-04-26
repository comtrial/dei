import { ShieldCheck } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/app/screen';
import { StatusRow } from '@/components/app/status-row';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { canUseLocalDevOtp } from '@/lib/dev-auth';
import { ROUTES } from '@/lib/routes';
import { useAccountGate } from '@/providers/account-gate-provider';
import { useAuth } from '@/providers/auth-provider';

export default function PhoneScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { completeLocalDevIdentityVerification, eligibility, refresh } = useAccountGate();
  const [message, setMessage] = useState<string | null>(null);
  const [isCompletingDevVerification, setIsCompletingDevVerification] = useState(false);
  const canUseDevVerification = canUseLocalDevOtp(user?.email ?? '');

  const handleLocalDevVerification = async () => {
    setIsCompletingDevVerification(true);
    setMessage(null);

    try {
      await completeLocalDevIdentityVerification();
      router.replace(ROUTES.profile as never);
    } catch (devVerificationError) {
      setMessage(
        devVerificationError instanceof Error
          ? devVerificationError.message
          : '개발용 인증 통과에 실패했어요.',
      );
    } finally {
      setIsCompletingDevVerification(false);
    }
  };

  return (
    <Screen
      eyebrow="04 · ADULT CHECK"
      title="성인 인증이 필요합니다"
      description="실제 연동에서는 PortOne 인증 결과를 서버에서 검증합니다. 지금은 개발용 통과 버튼으로 흐름만 확인합니다.">
      <View className="gap-6">
        <View className="border-border bg-card items-center gap-4 rounded-md border p-6">
          <View className="bg-muted h-14 w-14 items-center justify-center rounded-full">
            <ShieldCheck color="#8F6A2C" size={30} />
          </View>
          <Text className="text-center text-lg font-semibold">실명·나이 확인 게이트</Text>
          <Text className="text-muted-foreground text-center leading-6">
            PortOne 계약과 API 키가 준비되면 앱이 인증창을 열고, Edge Function이 결과를 검증합니다.
          </Text>
        </View>

        <View>
          <StatusRow
            label="본인 인증"
            tone={eligibility?.identity_verified ? 'success' : 'warning'}
            value={eligibility?.identity_verified ? '완료' : '대기'}
          />
          <StatusRow
            label="성인 여부"
            tone={eligibility?.age_eligible ? 'success' : 'warning'}
            value={eligibility?.age_eligible ? '통과' : '대기'}
          />
        </View>

        {message ? <Text className="text-muted-foreground text-sm">{message}</Text> : null}

        {canUseDevVerification ? (
          <Button
            disabled={isCompletingDevVerification}
            onPress={handleLocalDevVerification}
            size="lg">
            <Text>{isCompletingDevVerification ? '처리 중...' : '개발용 인증 통과'}</Text>
          </Button>
        ) : null}

        <Button
          onPress={() => {
            setMessage('PortOne 계약과 API 키가 준비되면 이 버튼이 실제 본인인증을 시작합니다.');
          }}
          size="lg"
          variant={canUseDevVerification ? 'outline' : 'default'}>
          <Text>PortOne 본인인증 시작</Text>
        </Button>

        <Button onPress={() => refresh()} variant="outline">
          <Text>상태 새로고침</Text>
        </Button>
      </View>
    </Screen>
  );
}
