import * as ImagePicker from 'expo-image-picker';
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
  PhotoUpload,
  ProgressBar,
  Text,
  Textarea,
  TopNav,
} from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { PROFILE_BIO_MAX_LENGTH } from '@/lib/b-flow';
import { requestPermission } from '@/lib/permissions';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export default function ProfilePhotoStepScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [bio, setBio] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const handleCapture = () => {
    void logger.withErrorCapture(
      'onboarding.step2.capture',
      async () => {
        const permission = await requestPermission('camera');
        if (permission !== 'granted') {
          router.push(ROUTES.permissionCamera);
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [7, 9],
          mediaTypes: ['images'],
          quality: 0.72,
        });

        if (result.canceled || result.assets.length === 0) {
          return;
        }

        setPhotoUri(result.assets[0]?.uri ?? null);
        analytics.capture(ANALYTICS_EVENTS.profile_photo_uploaded, {
          source: 'camera',
        });
      },
      { tags: { screen: 'onboarding-step2', action: 'capture' } },
    ).catch((error) => {
      logger.captureException(error, {
        tags: { screen: 'onboarding-step2', action: 'capture-catch' },
      });
      setCaptureFailed(true);
    });
  };

  const handleNext = () => {
    if (!photoUri || isSaving) {
      return;
    }

    void logger.withErrorCapture(
      'onboarding.step2.save',
      async () => {
        setIsSaving(true);

        if (user) {
          const { error } = await supabase
            .from('profile')
            .update({ bio: bio.trim() || null })
            .eq('user_id', user.id);

          if (error) {
            throw error;
          }
        }

        analytics.capture(ANALYTICS_EVENTS.profile_step_completed, {
          step: 2,
        });

        router.push(ROUTES.profileStep3);
      },
      { tags: { screen: 'onboarding-step2', action: 'save' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'onboarding-step2', action: 'save-catch' },
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
            프로필 사진 · 2 / 3
          </Text>
          <ProgressBar value={2 / 3} className="mt-[10px]" />

          <View className="mt-[30px]">
            <Text variant="h1" className="text-[25px] leading-[33px]">
              오늘의 첫인상을 찍어주세요
            </Text>
            <Text className="mt-[8px] text-[13.5px] leading-[20px] text-ink-3">
              현장에서 촬영한 사진 1장이 매칭 카드 표지로 보여요.
            </Text>
          </View>

          <View className="mt-[28px] items-center">
            <PhotoUpload
              imageUri={photoUri ?? undefined}
              state={photoUri ? 'filled' : 'empty'}
              label="지금 촬영"
              changeLabel="다시 촬영"
              onPress={handleCapture}
              testID="onboarding-photo-upload"
            />
            <Button
              variant="secondary"
              size="sm"
              className="mt-[18px]"
              onPress={handleCapture}
            >
              카메라 열기
            </Button>
          </View>

          <View className="mt-[30px]">
            <Text variant="eyebrow" tone="ink-3">
              한 줄 소개
            </Text>
            <Textarea
              value={bio}
              onChangeText={setBio}
              maxLength={PROFILE_BIO_MAX_LENGTH}
              showCount
              placeholder="예: 오늘은 한강에서 산책 중이에요"
              className="mt-[8px]"
            />
          </View>

          <Banner tone="info" icon="i" title="사진 안내">
            촬영한 사진은 프로필 카드의 첫인상으로 사용돼요. 마음에 들지 않으면 다시 찍을 수 있어요.
          </Banner>
        </View>
      </ScrollView>

      <BottomActionBar fixed>
        <Button
          fullWidth
          disabled={!photoUri || isSaving}
          onPress={handleNext}
          testID="onboarding-step2-next"
        >
          {isSaving ? '저장 중' : '다음 (3/3)'}
        </Button>
      </BottomActionBar>

      <AlertDialog
        visible={captureFailed}
        tone="warn"
        size="mini"
        severityTopBorder
        eyebrow="CAMERA"
        title="사진을 불러오지 못했어요"
        description="카메라 권한과 기기 상태를 확인한 뒤 다시 시도해주세요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setCaptureFailed(false) }]}
        onDismiss={() => setCaptureFailed(false)}
      />

      <AlertDialog
        visible={saveFailed}
        tone="warn"
        icon="!"
        title="프로필을 저장하지 못했어요"
        description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setSaveFailed(false) }]}
        onDismiss={() => setSaveFailed(false)}
      />
    </SafeAreaView>
  );
}
