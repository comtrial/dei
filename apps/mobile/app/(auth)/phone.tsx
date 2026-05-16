import { IdentityVerification } from '@portone/react-native-sdk';
import type { IdentityVerificationRequest } from '@portone/browser-sdk/v2';
import { AlertTriangle, ShieldCheck } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Screen } from '@/components/app/screen';
import { StatusRow } from '@/components/app/status-row';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Text } from '@/components/ui/text';
import { isLocalDevAuthEnabled } from '@/lib/dev-auth';
import {
  confirmIdentityVerification,
  startIdentityVerification,
} from '@/lib/identity-verification';
import { ROUTES, routeForEligibility } from '@/lib/routes';
import { useAccountGate } from '@/providers/account-gate-provider';

type FailureDialogState = {
  title: string;
  message: string;
};

const getFailureDialog = (message: string): FailureDialogState => {
  if (
    message.includes('EXISTING_MEMBER_FOUND')
    || message.includes('IDENTITY_ALREADY_REGISTERED')
    || message.includes('이미 가입')
  ) {
    return {
      title: '기존 회원 연결에 실패했습니다',
      message:
        '이 본인확인 정보로 가입된 계정이 있지만 연결을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',
    };
  }

  if (message.includes('canceled') || message.includes('cancel')) {
    return {
      title: '본인확인이 취소되었습니다',
      message: '다시 시도하면 본인확인 창을 새로 열 수 있어요.',
    };
  }

  if (message.includes('설정값') || message.includes('configured')) {
    return {
      title: '본인확인 설정이 필요합니다',
      message: '실제 키가 아직 없어 본인확인을 시작할 수 없어요. 로컬 개발 중이면 개발자 전용 버튼으로 다음 단계까지 확인할 수 있습니다.',
    };
  }

  return {
    title: '인증 실패',
    message: message || '본인확인을 완료할 수 없어요. 잠시 후 다시 시도해 주세요.',
  };
};

export default function PhoneScreen() {
  const router = useRouter();
  const { completeLocalDevIdentityVerification, eligibility, refresh } = useAccountGate();
  const [message, setMessage] = useState<string | null>(null);
  const [failureDialog, setFailureDialog] = useState<FailureDialogState | null>(null);
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
      const updatedEligibility = await completeLocalDevIdentityVerification();
      router.replace((updatedEligibility ? routeForEligibility(updatedEligibility) : ROUTES.profile) as never);
    } catch (devVerificationError) {
      const errorMessage =
        devVerificationError instanceof Error
          ? devVerificationError.message
          : '개발용 인증 통과에 실패했어요.';
      setFailureDialog(getFailureDialog(errorMessage));
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
      const errorMessage =
        startError instanceof Error ? startError.message : '본인확인을 시작할 수 없어요.';
      setFailureDialog(getFailureDialog(errorMessage));
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
                const result = await confirmIdentityVerification(response);
                const nextEligibility = await refresh();
                setVerificationRequest(null);
                router.replace(
                  (
                    nextEligibility
                      ? routeForEligibility(nextEligibility)
                      : result.existingMember
                        ? ROUTES.home
                        : ROUTES.profile
                  ) as never,
                );
              } catch (confirmError) {
                const errorMessage =
                  confirmError instanceof Error
                    ? confirmError.message
                    : '본인확인 결과를 저장할 수 없어요.';
                setFailureDialog(getFailureDialog(errorMessage));
                setVerificationRequest(null);
              } finally {
                setIsConfirmingVerification(false);
              }
            }}
            onError={(verificationError) => {
              setFailureDialog(getFailureDialog(verificationError.message));
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
      eyebrow="L5 · IDENTITY"
      title="휴대폰 본인확인을 진행해 주세요"
      description="본인 명의 휴대폰 확인을 완료하면 기존 회원 여부를 확인하고, 신규 회원은 프로필 작성으로 이동합니다.">
      <View className="gap-6">
        <View className="border-border bg-card items-center gap-4 rounded-md border p-6">
          <View className="bg-muted h-14 w-14 items-center justify-center rounded-full">
            <ShieldCheck color="#8F6A2C" size={30} />
          </View>
          <Text className="text-center text-lg font-semibold">본인확인 요청</Text>
          <Text className="text-muted-foreground text-center leading-6">
            앱은 인증창을 열고, 인증 결과는 서버에서 다시 확인합니다. 같은 본인확인 정보가 있으면 기존 회원 계정으로 바로 연결합니다.
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
            <Text className="text-muted-foreground flex-1 text-sm">L6 · 본인확인 결과를 확인하고 있어요.</Text>
          </View>
        ) : null}

        <Button
          disabled={isStartingVerification || isCompletingDevVerification || isConfirmingVerification}
          onPress={handleStartIdentityVerification}
          size="lg"
          variant="default">
          {isStartingVerification ? <ActivityIndicator color="#F2EADA" /> : <Text>본인확인 시작</Text>}
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

        <Dialog open={Boolean(failureDialog)} onOpenChange={(open) => !open && setFailureDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <View className="bg-destructive/10 mb-2 h-12 w-12 items-center justify-center rounded-full">
                <AlertTriangle color="#A85A4A" size={24} />
              </View>
              <DialogTitle>{failureDialog?.title ?? '인증 실패'}</DialogTitle>
              <DialogDescription>{failureDialog?.message ?? ''}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onPress={() => setFailureDialog(null)} size="lg">
                <Text>확인</Text>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </View>
    </Screen>
  );
}
