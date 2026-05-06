import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Screen } from '@/components/app/screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { LOCAL_DEV_EMAIL, LOCAL_DEV_OTP } from '@/lib/dev-auth';
import { ROUTES } from '@/lib/routes';
import { useAccountGate } from '@/providers/account-gate-provider';
import { useAuth } from '@/providers/auth-provider';

export default function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ marketingPushOptIn?: string; termsAccepted?: string }>();
  const { acceptConsents } = useAccountGate();
  const { signInWithEmailOtp, signInWithKakao } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isKakaoSubmitting, setIsKakaoSubmitting] = useState(false);
  const [isDevSubmitting, setIsDevSubmitting] = useState(false);

  const routeAfterSession = async () => {
    if (params.termsAccepted === '1') {
      await acceptConsents({ marketingPushOptIn: params.marketingPushOptIn === '1' });
      router.replace(ROUTES.phone as never);
      return;
    }

    router.replace(ROUTES.terms as never);
  };

  const handleKakaoSignIn = async () => {
    setError(null);
    setIsKakaoSubmitting(true);

    try {
      await signInWithKakao();
      await routeAfterSession();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '카카오 로그인을 완료할 수 없어요.');
    } finally {
      setIsKakaoSubmitting(false);
    }
  };

  const handleDevSignIn = async () => {
    setError(null);
    setIsDevSubmitting(true);

    try {
      await signInWithEmailOtp(LOCAL_DEV_EMAIL);
      router.push({
        pathname: ROUTES.otp as never,
        params: {
          email: LOCAL_DEV_EMAIL,
          marketingPushOptIn: params.marketingPushOptIn ?? '0',
          phone: '01012345678',
          termsAccepted: params.termsAccepted ?? '0',
        },
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '개발용 인증번호를 보낼 수 없어요.');
    } finally {
      setIsDevSubmitting(false);
    }
  };

  return (
    <Screen
      eyebrow="01 · KAKAO"
      title="카카오로 시작해 주세요"
      description="카카오 계정으로 Dei 계정을 만들고, 다음 단계에서 본인 명의 휴대폰 확인을 진행합니다.">
      <View className="gap-5">
        <Button
          className="bg-[#FEE500] active:bg-[#F6DC00]"
          disabled={isKakaoSubmitting || isDevSubmitting}
          onPress={handleKakaoSignIn}
          size="lg">
          {isKakaoSubmitting ? (
            <ActivityIndicator color="#191919" />
          ) : (
            <Text className="text-[#191919]">카카오로 계속하기</Text>
          )}
        </Button>

        <View className="border-border bg-card gap-2 rounded-md border p-4">
          <Text className="text-accent text-xs font-semibold uppercase tracking-[2px]">Local Dev</Text>
          <Text className="text-muted-foreground leading-6">
            카카오/Supabase 설정 전에는 개발용 이메일 계정으로 흐름을 확인할 수 있어요. 인증번호는 {LOCAL_DEV_OTP}입니다.
          </Text>
        </View>

        {error ? <Text className="text-destructive text-sm">{error}</Text> : null}

        <Button
          disabled={isKakaoSubmitting || isDevSubmitting}
          onPress={handleDevSignIn}
          size="lg"
          variant="outline">
          {isDevSubmitting ? <ActivityIndicator color="#8F6A2C" /> : <Text>개발용 코드로 진행</Text>}
        </Button>
      </View>
    </Screen>
  );
}
