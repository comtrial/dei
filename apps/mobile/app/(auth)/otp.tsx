import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Screen } from '@/components/app/screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { canUseLocalDevOtp, LOCAL_DEV_OTP } from '@/lib/dev-auth';
import { ROUTES } from '@/lib/routes';
import { useAccountGate } from '@/providers/account-gate-provider';
import { useAuth } from '@/providers/auth-provider';

export default function OtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    email?: string;
    marketingPushOptIn?: string;
    phone?: string;
    termsAccepted?: string;
  }>();
  const { signInWithEmailOtp, verifyEmailOtp } = useAuth();
  const { acceptConsents, refresh } = useAccountGate();
  const email = params.email ?? '';
  const phone = params.phone ?? '';
  const isLocalDevOtp = canUseLocalDevOtp(email);
  const [token, setToken] = useState(() => (isLocalDevOtp ? LOCAL_DEV_OTP : ''));
  const [remainingSeconds, setRemainingSeconds] = useState(180);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formattedTime = useMemo(() => {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [remainingSeconds]);

  useEffect(() => {
    if (remainingSeconds <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setRemainingSeconds((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [remainingSeconds]);

  const handleTokenChange = (value: string) => {
    setToken(value.replace(/[^\d]/g, '').slice(0, 6));
  };

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      await verifyEmailOtp(email, token.trim());
      if (params.termsAccepted === '1') {
        await acceptConsents({ marketingPushOptIn: params.marketingPushOptIn === '1' });
        await refresh();
        router.replace(ROUTES.phone as never);
        return;
      }

      await refresh();
      router.replace(ROUTES.terms as never);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '코드를 확인할 수 없어요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setRemainingSeconds(180);
    setToken(isLocalDevOtp ? LOCAL_DEV_OTP : '');

    try {
      await signInWithEmailOtp(email);
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : '인증번호를 다시 보낼 수 없어요.');
    }
  };

  return (
    <Screen
      eyebrow="02 · VERIFY"
      title="인증번호 6자리를 입력해 주세요"
      description={
        isLocalDevOtp
          ? `${phone || '입력한 번호'}로 보낸 것으로 가정합니다. 개발용 코드는 ${LOCAL_DEV_OTP}입니다.`
          : '받은 인증번호를 입력하면 다음 단계로 이동합니다.'
      }>
      <View className="gap-5">
        <View className="gap-2">
          <Text className="font-semibold">인증번호</Text>
          <Input
            className="h-14 text-center text-2xl font-semibold tracking-[10px]"
            editable={!isSubmitting}
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={handleTokenChange}
            placeholder="000000"
            value={token}
          />
          <View className="flex-row items-center justify-between">
            <Text className="text-muted-foreground text-sm">{formattedTime} 남음</Text>
            <Button onPress={handleResend} size="sm" variant="ghost">
              <Text>다시 받기</Text>
            </Button>
          </View>
        </View>

        {error ? <Text className="text-destructive text-sm">{error}</Text> : null}

        <Button disabled={isSubmitting || token.trim().length < 6 || !email} onPress={handleSubmit} size="lg">
          {isSubmitting ? <ActivityIndicator color="#F2EADA" /> : <Text>확인</Text>}
        </Button>
      </View>
    </Screen>
  );
}
