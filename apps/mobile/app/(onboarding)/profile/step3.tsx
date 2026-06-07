import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger } from '@dei/shared';
import {
  AlertDialog,
  BottomSheet,
  BottomActionBar,
  Button,
  ChoiceList,
  ProgressBar,
  Select,
  Text,
  TopNav,
} from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { MBTI_OPTIONS, REGION_OPTIONS, TERMS_VERSION } from '@/lib/b-flow';
import { mergeCachedProfileSnapshot } from '@/lib/profile-session-cache';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type Picker = 'mbti' | 'region' | null;

const REGION_ALIASES: Record<(typeof REGION_OPTIONS)[number], string[]> = {
  강원: ['강원', 'Gangwon'],
  경기: ['경기', 'Gyeonggi'],
  경남: ['경남', 'Gyeongnam', 'South Gyeongsang'],
  경북: ['경북', 'Gyeongbuk', 'North Gyeongsang'],
  광주: ['광주', 'Gwangju'],
  대구: ['대구', 'Daegu'],
  대전: ['대전', 'Daejeon'],
  부산: ['부산', 'Busan'],
  서울: ['서울', 'Seoul'],
  세종: ['세종', 'Sejong'],
  울산: ['울산', 'Ulsan'],
  인천: ['인천', 'Incheon'],
  전남: ['전남', 'Jeonnam', 'South Jeolla'],
  전북: ['전북', 'Jeonbuk', 'North Jeolla'],
  제주: ['제주', 'Jeju'],
  충남: ['충남', 'Chungnam', 'South Chungcheong'],
  충북: ['충북', 'Chungbuk', 'North Chungcheong'],
};

function inferRegionFromAddress(address?: Location.LocationGeocodedAddress) {
  const searchable = [
    address?.city,
    address?.district,
    address?.isoCountryCode,
    address?.name,
    address?.region,
    address?.street,
    address?.subregion,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' ');

  return REGION_OPTIONS.find((regionOption) =>
    REGION_ALIASES[regionOption].some((alias) => searchable.includes(alias)),
  ) ?? null;
}

export default function ProfilePreferenceStepScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [mbti, setMbti] = useState('');
  const [region, setRegion] = useState('');
  const [picker, setPicker] = useState<Picker>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    void logger.withErrorCapture(
      'onboarding.step3.auto-region',
      async () => {
        const { data: termsAgreement, error: termsError } = await supabase
          .from('terms_agreement')
          .select('location_collection')
          .eq('user_id', user.id)
          .eq('terms_version', TERMS_VERSION)
          .maybeSingle();

        if (termsError) {
          throw termsError;
        }

        if (!termsAgreement?.location_collection) {
          return;
        }

        setIsLocating(true);
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== Location.PermissionStatus.GRANTED) {
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const [address] = await Location.reverseGeocodeAsync(position.coords);
        const nextRegion = inferRegionFromAddress(address);

        if (nextRegion) {
          setRegion((current) => current || nextRegion);
        }
      },
      { tags: { screen: 'onboarding-step3', action: 'auto-region' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'onboarding-step3', action: 'auto-region-catch' },
        });
      })
      .finally(() => setIsLocating(false));
  }, [user]);

  const handleFinish = () => {
    if (isSaving) {
      return;
    }

    void logger.withErrorCapture(
      'onboarding.step3.save',
      async () => {
        setIsSaving(true);

        if (user) {
          const completedAt = new Date().toISOString();
          const { error } = await supabase
            .from('profile')
            .update({
              mbti: mbti || null,
              onboarding_completed_at: completedAt,
              region: region || null,
            })
            .eq('user_id', user.id);

          if (error) {
            throw error;
          }

          mergeCachedProfileSnapshot(user.id, {
            mbti: mbti || null,
            onboardingCompletedAt: completedAt,
            region: region || null,
          });
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
      <TopNav className="border-b-0 bg-bg" onLeftPress={() => router.back()} />

      <ScrollView className="flex-1 bg-bg">
        <View className="px-[24px] pb-[128px] pt-[18px]">
          <Text variant="meta" tone="ink-3">
            신상 정보 · 3 / 3
          </Text>
          <ProgressBar value={1} className="mt-[10px]" />

          <View className="mt-[30px]">
            <Text variant="h1" className="text-[25px] leading-[33px]">
              마지막이에요
            </Text>
            <Text className="mt-[8px] text-[13.5px] leading-[20px] text-ink-3">
              비워둬도 괜찮아요. 나중에 채울 수 있어요.
            </Text>
          </View>

          <View className="mt-[30px]">
            <Text variant="eyebrow" tone="ink-3">
              MBTI <Text tone="ink-4">선택</Text>
            </Text>
            <Select
              value={mbti}
              placeholder="선택해주세요"
              className="mt-[8px]"
              onPress={() => setPicker('mbti')}
            />
          </View>

          <View className="mt-[30px]">
            <Text variant="eyebrow" tone="ink-3">
              지역 <Text tone="ink-4">선택</Text>
            </Text>
            <Select
              value={region}
              placeholder="활동 지역 선택 (예: 서울 · 강남구)"
              className="mt-[8px]"
              onPress={() => setPicker('region')}
            />
            <Text className="mt-[6px] text-[11.5px] font-semibold text-ink-3">
              {isLocating
                ? '동의한 위치정보로 지역을 확인하고 있어요.'
                : '자동으로 채워지지 않으면 직접 선택해주세요.'}
            </Text>
          </View>
        </View>
      </ScrollView>

      <BottomActionBar fixed>
        <Button
          fullWidth
          disabled={isSaving}
          onPress={handleFinish}
          testID="onboarding-step3-finish"
        >
          {isSaving ? '저장 중' : 'dei 시작하기'}
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

      <BottomSheet
        visible={picker === 'mbti'}
        heightPct={72}
        onClose={() => setPicker(null)}
      >
        <View className="flex-1 px-[24px] pb-[18px] pt-[12px]">
          <Text variant="h2" className="mb-[14px] text-[20px] font-extrabold">
            MBTI 선택
          </Text>
          <ScrollView className="flex-1">
            <ChoiceList
              tone="accent"
              value={mbti}
              onChange={(value) => {
                setMbti(value);
                setPicker(null);
              }}
              options={MBTI_OPTIONS.map((option) => ({ label: option, value: option }))}
            />
          </ScrollView>
          <Button
            variant="tertiary"
            fullWidth
            className="mt-[12px]"
            onPress={() => {
              setMbti('');
              setPicker(null);
            }}
          >
            선택 안 함
          </Button>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={picker === 'region'}
        heightPct={72}
        onClose={() => setPicker(null)}
      >
        <View className="flex-1 px-[24px] pb-[18px] pt-[12px]">
          <Text variant="h2" className="mb-[14px] text-[20px] font-extrabold">
            활동 지역 선택
          </Text>
          <ScrollView className="flex-1">
            <ChoiceList
              tone="accent"
              value={region}
              onChange={(value) => {
                setRegion(value);
                setPicker(null);
              }}
              options={REGION_OPTIONS.map((option) => ({ label: option, value: option }))}
            />
          </ScrollView>
          <Button
            variant="tertiary"
            fullWidth
            className="mt-[12px]"
            onPress={() => {
              setRegion('');
              setPicker(null);
            }}
          >
            선택 안 함
          </Button>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}
