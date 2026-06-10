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
  Spinner,
  Text,
  Textarea,
  TopNav,
} from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { PROFILE_BIO_MAX_LENGTH } from '@/lib/b-flow';
import { openSystemSettings, requestPermission } from '@/lib/permissions';
import { mergeCachedProfileSnapshot } from '@/lib/profile-session-cache';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type PickedPhoto = {
  mimeType: string;
  uri: string;
};

function extensionForMimeType(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

async function uploadProfilePhoto(userId: string, photo: PickedPhoto) {
  const response = await fetch(photo.uri);
  const body = await response.arrayBuffer();
  const extension = extensionForMimeType(photo.mimeType);
  const path = `${userId}/profile-${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from('profile-photos')
    .upload(path, body, {
      contentType: photo.mimeType,
      upsert: true,
    });

  if (error) {
    throw error;
  }

  return path;
}

export default function ProfilePhotoStepScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [bio, setBio] = useState('');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const handleCapture = () => {
    void logger.withErrorCapture(
      'onboarding.step2.capture',
      async () => {
        const permission = await requestPermission('camera');
        if (permission !== 'granted') {
          setCameraPermissionDenied(true);
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

        const asset = result.assets[0];
        setPhoto({
          mimeType: asset?.mimeType ?? 'image/jpeg',
          uri: asset?.uri ?? '',
        });
        setPhotoUri(asset?.uri ?? null);
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
    if (!photo || !photoUri || isSaving) {
      return;
    }

    void logger.withErrorCapture(
      'onboarding.step2.save',
      async () => {
        setIsSaving(true);

        if (user) {
          const photoPath = await uploadProfilePhoto(user.id, photo);
          const { error } = await supabase
            .from('profile')
            .update({ bio: bio.trim() || null, photo_url: photoPath })
            .eq('user_id', user.id);

          if (error) {
            throw error;
          }

          mergeCachedProfileSnapshot(user.id, {
            bio: bio.trim() || null,
            photoDisplayUrl: photoUri,
            photoUrl: photoPath,
          });
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
      <TopNav className="border-b-0 bg-bg" onLeftPress={() => router.back()} />

      <ScrollView className="flex-1 bg-bg">
        <View className="px-[24px] pb-[128px] pt-[18px]">
          <Text variant="meta" tone="ink-3">
            프로필 사진 · 2 / 3
          </Text>
          <ProgressBar value={2 / 3} className="mt-[10px]" />

          <View className="mt-[30px]">
            <Text variant="h1" className="text-[25px] leading-[33px]">
              당신을 보여줄{'\n'}사진을 올려주세요
            </Text>
            <Text className="mt-[8px] text-[13.5px] leading-[20px] text-ink-3">
              본인 얼굴이 보이는 사진 1장
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
            <Text className="mt-[18px] text-center text-[11.5px] leading-[17px] text-ink-3">
              선정적이거나 타인의 사진은 신고 대상이에요
            </Text>

            {cameraPermissionDenied ? (
              <Banner
                tone="warn"
                icon="!"
                title="카메라 권한이 필요해요"
                cta="설정"
                onCtaPress={() => {
                  setCameraPermissionDenied(false);
                  void openSystemSettings().catch((error) => {
                    logger.captureException(error, {
                      tags: { screen: 'onboarding-step2', action: 'open-camera-settings' },
                    });
                  });
                }}
                className="mt-[18px] w-full"
              >
                프로필 사진은 지금 촬영한 사진만 사용할 수 있어요. 설정에서 카메라 권한을 켜주세요.
              </Banner>
            ) : null}
          </View>

          <View className="mt-[30px]">
            <Text variant="eyebrow" tone="ink-3">
              한 줄 자기소개 <Text tone="ink-4">선택</Text>
            </Text>
            <Textarea
              value={bio}
              onChangeText={setBio}
              maxLength={PROFILE_BIO_MAX_LENGTH}
              showCount
              placeholder="자유롭게 적어주세요 (예: 카페 투어 좋아하는 사람 ☕)"
              className="mt-[8px]"
            />
          </View>
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

      {isSaving ? (
        <View className="absolute inset-0 items-center justify-center bg-bg/80 px-[32px]">
          <Spinner size={80} accessibilityLabel="프로필 사진 업로드 중" />
          <Text variant="body" tone="ink-3" className="mt-[18px] text-center">
            프로필 사진을 올리고 있어요
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
