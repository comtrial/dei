import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Screen } from '@/components/app/screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { LOCAL_DEV_EMAIL, LOCAL_DEV_OTP } from '@/lib/dev-auth';
import { ROUTES } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';

export default function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ marketingPushOptIn?: string; termsAccepted?: string }>();
  const { signInWithEmailOtp } = useAuth();
  const [phone, setPhone] = useState('01012345678');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = phone.length >= 10;

  const handlePhoneChange = (value: string) => {
    setPhone(value.replace(/[^\d]/g, '').slice(0, 11));
  };

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      await signInWithEmailOtp(LOCAL_DEV_EMAIL);
      router.push({
        pathname: ROUTES.otp as never,
        params: {
          email: LOCAL_DEV_EMAIL,
          marketingPushOptIn: params.marketingPushOptIn ?? '0',
          phone,
          termsAccepted: params.termsAccepted ?? '0',
        },
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '인증번호를 보낼 수 없어요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen
      eyebrow="01 · PHONE"
      title="전화번호를 입력해 주세요"
      description="휴대폰 번호로 가입 여부를 확인합니다. 지금은 개발용 인증번호로 흐름만 확인합니다.">
      <View className="gap-5">
        <View className="gap-2">
          <Text className="font-semibold">휴대폰 번호</Text>
          <View className="border-input bg-card flex-row items-center overflow-hidden rounded-md border">
            <View className="border-border h-12 items-center justify-center border-r px-4">
              <Text className="text-muted-foreground font-semibold">+82</Text>
            </View>
            <Input
              className="flex-1 border-0 bg-transparent shadow-none"
              editable={!isSubmitting}
              inputMode="tel"
              keyboardType="phone-pad"
              maxLength={11}
              onChangeText={handlePhoneChange}
              placeholder="01012345678"
              value={phone}
            />
          </View>
        </View>

        <View className="border-border bg-card gap-2 rounded-md border p-4">
          <Text className="text-accent text-xs font-semibold uppercase tracking-[2px]">Mock SMS</Text>
          <Text className="text-muted-foreground leading-6">
            실제 SMS와 PortOne 본인인증은 나중에 붙이고, 현재 인증번호는 {LOCAL_DEV_OTP}으로 고정합니다.
          </Text>
        </View>

        {error ? <Text className="text-destructive text-sm">{error}</Text> : null}

        <Button disabled={isSubmitting || !canSubmit} onPress={handleSubmit} size="lg">
          {isSubmitting ? <ActivityIndicator color="#F2EADA" /> : <Text>인증번호 받기</Text>}
        </Button>
      </View>
    </Screen>
  );
}
