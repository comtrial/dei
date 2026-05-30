import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger } from '@dei/shared';
import {
  AlertDialog,
  Banner,
  BottomActionBar,
  Button,
  ProgressBar,
  Select,
  Text,
  TopNav,
} from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { MBTI_OPTIONS, REGION_OPTIONS } from '@/lib/b-flow';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

function OptionGrid({
  options,
  selected,
  onSelect,
}: {
  options: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View className="mt-[10px] flex-row flex-wrap gap-[8px]">
      {options.map((option) => (
        <Button
          key={option}
          size="sm"
          variant={selected === option ? 'ink' : 'secondary'}
          onPress={() => onSelect(option)}
          className="px-[12px] py-[10px]"
        >
          {option}
        </Button>
      ))}
    </View>
  );
}

export default function ProfilePreferenceStepScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [mbti, setMbti] = useState('');
  const [region, setRegion] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const handleFinish = () => {
    if (!region || isSaving) {
      return;
    }

    void logger.withErrorCapture(
      'onboarding.step3.save',
      async () => {
        setIsSaving(true);

        if (user) {
          const { error } = await supabase
            .from('profile')
            .update({ region })
            .eq('user_id', user.id);

          if (error) {
            throw error;
          }
        }

        analytics.capture(ANALYTICS_EVENTS.profile_step_completed, {
          mbti: mbti || 'unknown',
          region,
          step: 3,
        });

        router.replace(ROUTES.home);
      },
      { tags: { screen: 'onboarding-step3', action: 'save' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'onboarding-step3', action: 'save-catch' },
        });
        setSaveFailed(true);
      })
      .finally(() => setIsSaving(false));
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav title="프로필 작성" onLeftPress={() => router.back()} />

      <ScrollView className="flex-1 bg-bg">
        <View className="px-[24px] pb-[128px] pt-[18px]">
          <Text variant="meta" tone="ink-3">
            취향 정보 · 3 / 3
          </Text>
          <ProgressBar value={1} className="mt-[10px]" />

          <View className="mt-[30px]">
            <Text variant="h1" className="text-[25px] leading-[33px]">
              매칭에 쓸 정보를 골라주세요
            </Text>
            <Text className="mt-[8px] text-[13.5px] leading-[20px] text-ink-3">
              지역은 필수이고 MBTI는 선택이에요. 나중에 마이프로필에서 다시 정리할 수 있어요.
            </Text>
          </View>

          <View className="mt-[30px]">
            <Text variant="eyebrow" tone="ink-3">
              MBTI
            </Text>
            <Select
              value={mbti}
              placeholder="선택해주세요"
              className="mt-[8px]"
              onPress={() => setMbti(mbti ? '' : 'ENFP')}
            />
            <OptionGrid options={MBTI_OPTIONS} selected={mbti} onSelect={setMbti} />
          </View>

          <View className="mt-[30px]">
            <Text variant="eyebrow" tone="ink-3">
              활동 지역
            </Text>
            <Select
              value={region}
              placeholder="활동 지역 선택"
              className="mt-[8px]"
              onPress={() => setRegion(region || '서울')}
            />
            <OptionGrid options={REGION_OPTIONS} selected={region} onSelect={setRegion} />
          </View>

          <Banner tone="info" icon="i" title="지역 안내">
            활동 지역은 가까운 일상 반경의 매칭을 돕는 데 사용돼요.
          </Banner>
        </View>
      </ScrollView>

      <BottomActionBar fixed>
        <Button
          fullWidth
          disabled={!region || isSaving}
          onPress={handleFinish}
          testID="onboarding-step3-finish"
        >
          {isSaving ? '저장 중' : '프로필 완료'}
        </Button>
      </BottomActionBar>

      <AlertDialog
        visible={saveFailed}
        tone="warn"
        icon="!"
        title="프로필을 마무리하지 못했어요"
        description="지역 저장 중 문제가 생겼어요. 잠시 후 다시 시도해주세요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setSaveFailed(false) }]}
        onDismiss={() => setSaveFailed(false)}
      />
    </SafeAreaView>
  );
}
