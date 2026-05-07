import { Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useAccountGate } from '@/providers/account-gate-provider';
import { useAuth } from '@/providers/auth-provider';

const REQUIRED_TERMS = [
  { detailType: 'service', label: '[필수] 서비스 이용약관' },
  { detailType: 'privacy', label: '[필수] 개인정보 처리방침' },
  { detailType: 'age', label: '[필수] 본인확인 및 연령 정책' },
  { detailType: 'community', label: '[필수] 커뮤니티 가이드라인' },
];

export default function TermsScreen() {
  const router = useRouter();
  const { acceptConsents } = useAccountGate();
  const { ensureAnonymousSession } = useAuth();
  const [acceptedIndexes, setAcceptedIndexes] = useState<number[]>([]);
  const [marketingPushOptIn, setMarketingPushOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allAccepted = acceptedIndexes.length === REQUIRED_TERMS.length;

  const toggleRequired = (index: number) => {
    setError(null);
    setAcceptedIndexes((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
    );
  };

  const handleAccept = async () => {
    setError(null);

    if (!allAccepted) {
      setError('필수 약관을 모두 동의해 주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      await ensureAnonymousSession();
      await acceptConsents({ marketingPushOptIn });
      router.replace(ROUTES.phone as never);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '약관 동의를 저장할 수 없어요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="bg-foreground/40 flex-1 justify-end" edges={['bottom']}>
      <View className="bg-background rounded-t-[32px] px-8 pb-8 pt-9">
        <View className="bg-muted mx-auto mb-8 h-1.5 w-20 rounded-full" />
        <Text className="mb-8 text-2xl font-semibold">약관에 동의해 주세요</Text>

        <View className="gap-0">
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: allAccepted && marketingPushOptIn }}
            className="border-border flex-row items-center gap-4 border-b py-4"
            onPress={() => {
              if (allAccepted && marketingPushOptIn) {
                setAcceptedIndexes([]);
                setMarketingPushOptIn(false);
                setError(null);
                return;
              }

              setAcceptedIndexes(REQUIRED_TERMS.map((_, index) => index));
              setMarketingPushOptIn(true);
              setError(null);
            }}>
            <View
              className={cn(
                'border-primary h-8 w-8 items-center justify-center rounded-full border-2',
                allAccepted && marketingPushOptIn && 'bg-primary',
              )}>
              {allAccepted && marketingPushOptIn ? <Check color="#F2EADA" size={20} /> : null}
            </View>
            <Text className="flex-1 text-lg font-semibold">전체 동의</Text>
          </Pressable>

        {REQUIRED_TERMS.map((term, index) => {
          const isSelected = acceptedIndexes.includes(index);

          return (
            <View
              className="border-border flex-row items-center gap-4 border-b py-4"
              key={term.label}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                className={cn(
                  'border-primary h-8 w-8 items-center justify-center rounded-full border-2',
                  isSelected && 'border-primary bg-primary',
                )}
                onPress={() => toggleRequired(index)}>
                {isSelected ? <Check color="#F2EADA" size={20} /> : null}
              </Pressable>
              <Pressable
                className="flex-1 flex-row items-center gap-4"
                onPress={() =>
                  router.push({
                    pathname: ROUTES.termsDetail as never,
                    params: { type: term.detailType },
                  })
                }>
                <Text className="flex-1 text-base font-semibold leading-5">{term.label}</Text>
                <Text className="text-muted-foreground text-xl">→</Text>
              </Pressable>
            </View>
          );
        })}

        <View className="flex-row items-center gap-4 py-4">
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: marketingPushOptIn }}
            className={cn(
              'border-primary h-8 w-8 items-center justify-center rounded-full border-2',
              marketingPushOptIn && 'border-primary bg-primary',
            )}
            onPress={() => setMarketingPushOptIn((value) => !value)}>
            {marketingPushOptIn ? <Check color="#F2EADA" size={20} /> : null}
          </Pressable>
          <Pressable
            className="flex-1 flex-row items-center gap-4"
            onPress={() =>
              router.push({
                pathname: ROUTES.termsDetail as never,
                params: { type: 'marketing' },
              })
            }>
            <Text className="flex-1 text-base font-semibold leading-5">[선택] 마케팅 수신 동의</Text>
            <Text className="text-muted-foreground text-xl">→</Text>
          </Pressable>
        </View>
        </View>

        {error ? <Text className="text-destructive mt-2 text-sm">{error}</Text> : null}

        <Button className="mt-8" disabled={isSubmitting} onPress={handleAccept} size="lg">
          {isSubmitting ? <ActivityIndicator color="#F2EADA" /> : <Text>동의하고 진행</Text>}
        </Button>
      </View>
    </SafeAreaView>
  );
}
