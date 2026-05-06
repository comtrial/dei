import { IdentityVerification } from '@portone/react-native-sdk';
import type { IdentityVerificationRequest } from '@portone/browser-sdk/v2';
import { ShieldCheck } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Screen } from '@/components/app/screen';
import { StatusRow } from '@/components/app/status-row';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { isLocalDevAuthEnabled } from '@/lib/dev-auth';
import {
  confirmIdentityVerification,
  startIdentityVerification,
} from '@/lib/identity-verification';
import { ROUTES } from '@/lib/routes';
import { useAccountGate } from '@/providers/account-gate-provider';

export default function PhoneScreen() {
  const router = useRouter();
  const { completeLocalDevIdentityVerification, eligibility, refresh } = useAccountGate();
  const [message, setMessage] = useState<string | null>(null);
  const [isCompletingDevVerification, setIsCompletingDevVerification] = useState(false);
  const [isStartingVerification, setIsStartingVerification] = useState(false);
  const [isConfirmingVerification, setIsConfirmingVerification] = useState(false);
  const [verificationRequest, setVerificationRequest] =
    useState<IdentityVerificationRequest | null>(null);
  const canUseDevVerification = isLocalDevAuthEnabled();

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

  const handleStartIdentityVerification = async () => {
    setIsStartingVerification(true);
    setMessage(null);

    try {
      const request = await startIdentityVerification();
      setVerificationRequest(request);
    } catch (startError) {
      setMessage(
        startError instanceof Error
          ? startError.message
          : '본인확인을 시작할 수 없어요.',
      );
    } finally {
      setIsStartingVerification(false);
    }
  };

  if (verificationRequest) {
    return (
      <SafeAreaView className="bg-background flex-1">
        <View className="border-border flex-row items-center justify-between border-b px-4 py-3">
          <View className="gap-1">
            <Text className="text-base font-semibold">본인 명의 확인</Text>
            <Text className="text-muted-foreground text-sm">PortOne 인증창</Text>
          </View>
          <Button
            disabled={isConfirmingVerification}
            onPress={() => setVerificationRequest(null)}
            size="sm"
            variant="ghost">
            <Text>닫기</Text>
          </Button>
        </View>
        <View className="flex-1">
          <IdentityVerification
            onComplete={async (response) => {
              setIsConfirmingVerification(true);

              try {
                await confirmIdentityVerification(response);
                await refresh();
                setVerificationRequest(null);
                router.replace(ROUTES.profile as never);
              } catch (confirmError) {
                setMessage(
                  confirmError instanceof Error
                    ? confirmError.message
                    : '본인확인 결과를 저장할 수 없어요.',
                );
                setVerificationRequest(null);
              } finally {
                setIsConfirmingVerification(false);
              }
            }}
            onError={(verificationError) => {
              setMessage(verificationError.message);
              setVerificationRequest(null);
            }}
            request={verificationRequest}
            style={{ flex: 1 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <Screen
      eyebrow="04 · IDENTITY"
      title="본인 명의 확인이 필요합니다"
      description="카카오 로그인 후 본인 명의 휴대폰 확인을 완료하면 프로필을 작성할 수 있어요.">
      <View className="gap-6">
        <View className="border-border bg-card items-center gap-4 rounded-md border p-6">
          <View className="bg-muted h-14 w-14 items-center justify-center rounded-full">
            <ShieldCheck color="#8F6A2C" size={30} />
          </View>
          <Text className="text-center text-lg font-semibold">PortOne 본인확인 게이트</Text>
          <Text className="text-muted-foreground text-center leading-6">
            앱은 인증창만 열고, 인증 결과는 Supabase Edge Function이 PortOne 서버에 다시 확인합니다.
          </Text>
        </View>

        <View>
          <StatusRow
            label="본인 인증"
            tone={eligibility?.identity_verified ? 'success' : 'warning'}
            value={eligibility?.identity_verified ? '완료' : '대기'}
          />
        </View>

        {message ? <Text className="text-muted-foreground text-sm">{message}</Text> : null}
        {isConfirmingVerification ? (
          <View className="border-border bg-card flex-row items-center gap-3 rounded-md border p-4">
            <ActivityIndicator />
            <Text className="text-muted-foreground flex-1 text-sm">인증 결과를 저장하고 있어요.</Text>
          </View>
        ) : null}

        <Button
          disabled={isStartingVerification || isCompletingDevVerification || isConfirmingVerification}
          onPress={handleStartIdentityVerification}
          size="lg"
          variant="default">
          {isStartingVerification ? <ActivityIndicator color="#F2EADA" /> : <Text>PortOne 본인확인 시작</Text>}
        </Button>

        {canUseDevVerification ? (
          <Button
            disabled={isCompletingDevVerification || isStartingVerification || isConfirmingVerification}
            onPress={handleLocalDevVerification}
            size="lg"
            variant="outline">
            <Text>{isCompletingDevVerification ? '처리 중...' : '개발자 전용: 본인확인 완료 처리'}</Text>
          </Button>
        ) : null}

        <Button onPress={() => refresh()} variant="outline">
          <Text>상태 새로고침</Text>
        </Button>
      </View>
    </Screen>
  );
}
