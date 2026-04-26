import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useAccountGate } from '@/providers/account-gate-provider';

const steps = ['name', 'birth', 'gender'] as const;

const genderOptions = [
  { label: '여성', value: '여성' },
  { label: '남성', value: '남성' },
];

const isAdult = (birthDate: string) => {
  const birth = new Date(`${birthDate}T00:00:00`);

  if (Number.isNaN(birth.getTime())) {
    return false;
  }

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age >= 19;
};

export default function ProfileScreen() {
  const router = useRouter();
  const { completeProfile } = useAccountGate();
  const [stepIndex, setStepIndex] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [gender, setGender] = useState('여성');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const step = steps[stepIndex];
  const birthDate = useMemo(() => {
    if (birthYear.length !== 4 || birthMonth.length !== 2 || birthDay.length !== 2) {
      return '';
    }

    return `${birthYear}-${birthMonth}-${birthDay}`;
  }, [birthDay, birthMonth, birthYear]);

  const canContinue =
    (step === 'name' && displayName.trim().length >= 1) ||
    (step === 'birth' && isAdult(birthDate)) ||
    (step === 'gender' && gender.length > 0);

  const updateDigits = (value: string, maxLength: number, setter: (nextValue: string) => void) => {
    setter(value.replace(/[^\d]/g, '').slice(0, maxLength));
  };

  const handleNext = async () => {
    setError(null);

    if (step !== 'gender') {
      setStepIndex((currentStep) => currentStep + 1);
      return;
    }

    setIsSubmitting(true);

    try {
      await completeProfile({
        birthDate,
        displayName: displayName.trim(),
        gender,
      });
      router.replace(ROUTES.firstVideo as never);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '프로필을 저장할 수 없어요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="bg-background flex-1">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <View className="flex-1 px-7 pb-8 pt-10">
          <View className="mb-8 gap-4">
            <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-[4px]">
              Step {stepIndex + 1} / 4
            </Text>

            {step === 'name' ? (
              <>
                <Text className="text-foreground text-4xl font-semibold leading-tight">
                  이름을{'\n'}알려주세요
                </Text>
                <Text className="text-muted-foreground text-base leading-6">
                  실명이 아니어도 괜찮아요. 나중에 바꿀 수 있어요.
                </Text>
              </>
            ) : null}

            {step === 'birth' ? (
              <>
                <Text className="text-foreground text-4xl font-semibold leading-tight">
                  생년월일을{'\n'}입력해 주세요
                </Text>
                <Text className="text-muted-foreground text-base leading-6">
                  만 19세 이상만 이용 가능해요.
                </Text>
              </>
            ) : null}

            {step === 'gender' ? (
              <>
                <Text className="text-foreground text-4xl font-semibold leading-tight">
                  성별을{'\n'}선택해 주세요
                </Text>
                <Text className="text-muted-foreground text-base leading-6">
                  매칭 시 이성에게 공개됩니다.
                </Text>
              </>
            ) : null}
          </View>

          <View className="flex-1">
            {step === 'name' ? (
              <Input
                autoFocus
                editable={!isSubmitting}
                inputMode="text"
                keyboardType="default"
                maxLength={12}
                onChangeText={setDisplayName}
                placeholder="서연"
                returnKeyType="done"
                value={displayName}
                className="h-16 rounded-md border-foreground bg-background px-5 text-xl"
              />
            ) : null}

            {step === 'birth' ? (
              <View className="flex-row gap-3">
                <Input
                  autoFocus
                  editable={!isSubmitting}
                  inputMode="numeric"
                  keyboardType="number-pad"
                  maxLength={4}
                  onChangeText={(value) => updateDigits(value, 4, setBirthYear)}
                  placeholder="1996"
                  value={birthYear}
                  className="h-16 flex-[1.5] rounded-md border-foreground bg-background text-center text-xl font-semibold"
                />
                <Input
                  editable={!isSubmitting}
                  inputMode="numeric"
                  keyboardType="number-pad"
                  maxLength={2}
                  onChangeText={(value) => updateDigits(value, 2, setBirthMonth)}
                  placeholder="04"
                  value={birthMonth}
                  className="h-16 flex-1 rounded-md bg-background text-center text-xl font-semibold"
                />
                <Input
                  editable={!isSubmitting}
                  inputMode="numeric"
                  keyboardType="number-pad"
                  maxLength={2}
                  onChangeText={(value) => updateDigits(value, 2, setBirthDay)}
                  placeholder="18"
                  value={birthDay}
                  className="h-16 flex-1 rounded-md bg-background text-center text-xl font-semibold"
                />
              </View>
            ) : null}

            {step === 'gender' ? (
              <View className="flex-row gap-4">
                {genderOptions.map((option) => {
                  const isSelected = gender === option.value;

                  return (
                    <Button
                      key={option.value}
                      className={cn('h-16 flex-1', !isSelected && 'bg-background')}
                      onPress={() => setGender(option.value)}
                      variant={isSelected ? 'default' : 'outline'}>
                      <Text>{option.label}</Text>
                    </Button>
                  );
                })}
              </View>
            ) : null}

            {step === 'birth' && birthDate && !isAdult(birthDate) ? (
              <Text className="text-destructive mt-4 text-sm">
                만 19세 미만은 가입할 수 없어요.
              </Text>
            ) : null}

            {error ? <Text className="text-destructive mt-4 text-sm">{error}</Text> : null}
          </View>

          <Button
            className="h-16"
            disabled={!canContinue || isSubmitting}
            onPress={handleNext}
            size="lg">
            {isSubmitting ? <ActivityIndicator color="#ffffff" /> : <Text>다음</Text>}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
