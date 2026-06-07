import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger, POLICY } from '@dei/shared';
import {
  AlertDialog,
  Banner,
  BottomSheet,
  Button,
  Card,
  ChoiceList,
  Input,
  ProfileHero,
  SettingsRow,
  Spinner,
  Text,
  Textarea,
  TopNav,
} from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { hasVerifiedIdentity } from '@/lib/auth-flow';
import {
  birthDateLabel,
  GENDER_OPTIONS,
  genderLabel,
  MBTI_OPTIONS,
  NICKNAME_MAX_LENGTH,
  normalizeNickname,
  PROFILE_BIO_MAX_LENGTH,
  profileMeta,
  REGION_OPTIONS,
  toInitial,
  validateNickname,
} from '@/lib/b-flow';
import {
  repairProfileIdentityFromVerification,
  VERIFIED_IDENTITY_SELECT,
} from '@/lib/identity-profile';
import { openSystemSettings, requestPermission } from '@/lib/permissions';
import {
  getCachedProfileSnapshot,
  mergeCachedProfileSnapshot,
} from '@/lib/profile-session-cache';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type ProfileState = {
  bio: string | null;
  birthDate: string | null;
  birthYear: number | null;
  gender: string | null;
  mbti: string | null;
  nickname: string | null;
  nicknameChangedAt: string | null;
  notificationEnabled: boolean;
  passCount: number;
  photoDisplayUrl: string | null;
  photoUrl: string | null;
  region: string | null;
};

type ProfileDraft = Pick<ProfileState, 'bio' | 'gender' | 'mbti' | 'nickname' | 'region'>;
type ProfileEditor = 'bio' | 'gender' | 'mbti' | 'nickname' | 'region' | null;

const EMPTY_DRAFT: ProfileDraft = {
  bio: null,
  gender: null,
  mbti: null,
  nickname: null,
  region: null,
};

function extensionForMimeType(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

async function uploadProfilePhoto(userId: string, asset: ImagePicker.ImagePickerAsset) {
  const response = await fetch(asset.uri);
  const body = await response.arrayBuffer();
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const path = `${userId}/profile-${Date.now()}.${extensionForMimeType(mimeType)}`;
  const { error } = await supabase.storage
    .from('profile-photos')
    .upload(path, body, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) {
    throw error;
  }

  return path;
}

function signedPhotoUrl(path: string) {
  return supabase.storage.from('profile-photos').createSignedUrl(path, 60 * 60);
}

function normalizedNullable(value?: string | null) {
  const normalized = normalizeNickname(value ?? '');
  return normalized || null;
}

function trimmedNullable(value?: string | null) {
  const normalized = (value ?? '').trim();
  return normalized || null;
}

function nextNicknameChangeDate(changedAt?: string | null) {
  if (!changedAt) {
    return null;
  }

  const changedAtMs = new Date(changedAt).getTime();
  if (!Number.isFinite(changedAtMs)) {
    return null;
  }

  return new Date(
    changedAtMs + POLICY.identity.nicknameChangeThrottleDays * 24 * 60 * 60 * 1000,
  );
}

function formatDateLabel(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}.${month}.${day}`;
}

export default function MyProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [termsVisible, setTermsVisible] = useState(false);
  const [editor, setEditor] = useState<ProfileEditor>(null);
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const [isPhotoUploading, setIsPhotoUploading] = useState(false);
  const [nicknameLockVisible, setNicknameLockVisible] = useState(false);
  const [saveFailedMessage, setSaveFailedMessage] = useState<string | null>(null);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoImageFailed, setPhotoImageFailed] = useState(false);
  const [profile, setProfile] = useState<ProfileState>({
    bio: null,
    birthDate: null,
    birthYear: null,
    gender: null,
    mbti: null,
    nickname: null,
    nicknameChangedAt: null,
    notificationEnabled: true,
    passCount: 0,
    photoDisplayUrl: null,
    photoUrl: null,
    region: null,
  });

  useEffect(() => {
    const cached = getCachedProfileSnapshot(user?.id);
    if (!cached) return;

    setProfile((current) => ({
      ...current,
      bio: cached.bio ?? current.bio,
      birthDate: cached.birthDate ?? current.birthDate,
      birthYear: cached.birthYear ?? current.birthYear,
      gender: cached.gender ?? current.gender,
      mbti: cached.mbti ?? current.mbti,
      nickname: cached.nickname ?? current.nickname,
      nicknameChangedAt: cached.nicknameChangedAt ?? current.nicknameChangedAt,
      notificationEnabled: cached.notificationEnabled ?? current.notificationEnabled,
      passCount: cached.passCount ?? current.passCount,
      photoDisplayUrl: cached.photoDisplayUrl ?? current.photoDisplayUrl,
      photoUrl: cached.photoUrl ?? current.photoUrl,
      region: cached.region ?? current.region,
    }));
    setDraft((current) => ({
      ...current,
      bio: cached.bio ?? current.bio,
      gender: cached.gender ?? current.gender,
      mbti: cached.mbti ?? current.mbti,
      nickname: cached.nickname ?? current.nickname,
      region: cached.region ?? current.region,
    }));
    if (cached.photoDisplayUrl) {
      setPhotoImageFailed(false);
    }
  }, [user?.id]);

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.profile_hub_opened);

    if (!user) {
      return;
    }

    void logger.withErrorCapture(
      'my-profile.load',
      async () => {
        const [
          { data: profileData, error: profileError },
          { data: verifiedIdentity, error: verifiedIdentityError },
          { data: passes, error: passError },
          { data: notificationSetting, error: notificationError },
        ] = await Promise.all([
            supabase
              .from('profile')
              .select(
                'bio, birth_date, birth_year, gender, is_adult, mbti, nickname, nickname_changed_at, photo_url, region',
              )
              .eq('user_id', user.id)
              .maybeSingle(),
            supabase
              .from('auth_verification')
              .select(VERIFIED_IDENTITY_SELECT)
              .eq('user_id', user.id)
              .eq('provider', 'portone')
              .eq('status', 'verified')
              .order('verified_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('pass')
              .select('remaining')
              .eq('user_id', user.id)
              .eq('status', 'active'),
            supabase
              .from('notification_setting')
              .select('push_enabled')
              .eq('user_id', user.id)
              .maybeSingle(),
          ]);

        if (profileError) throw profileError;
        if (verifiedIdentityError) throw verifiedIdentityError;
        if (passError) throw passError;
        if (notificationError) throw notificationError;

        const resolvedProfile = await repairProfileIdentityFromVerification({
          profile: profileData,
          userId: user.id,
          verification: verifiedIdentity,
        });

        if (!hasVerifiedIdentity(resolvedProfile)) {
          router.replace(ROUTES.terms);
          return;
        }

        let photoDisplayUrl: string | null = null;
        if (resolvedProfile.photo_url) {
          const { data: signedPhoto, error: signedPhotoError } = await signedPhotoUrl(
            resolvedProfile.photo_url,
          );

          if (signedPhotoError) {
            logger.captureException(signedPhotoError, {
              tags: { screen: 'my-profile', action: 'signed-photo' },
            });
          }

          photoDisplayUrl = signedPhoto?.signedUrl ?? null;
        }

        const nextProfile = {
          bio: resolvedProfile.bio ?? null,
          birthDate: resolvedProfile.birth_date ?? null,
          birthYear: resolvedProfile.birth_year,
          gender: resolvedProfile.gender ?? null,
          mbti: resolvedProfile.mbti ?? null,
          nickname: resolvedProfile.nickname ?? null,
          nicknameChangedAt: resolvedProfile.nickname_changed_at ?? null,
          notificationEnabled: notificationSetting?.push_enabled ?? true,
          passCount: passes?.reduce((sum, pass) => sum + pass.remaining, 0) ?? 0,
          photoDisplayUrl,
          photoUrl: resolvedProfile.photo_url ?? null,
          region: resolvedProfile.region ?? null,
        };

        setProfile(nextProfile);
        mergeCachedProfileSnapshot(user.id, nextProfile);
        setPhotoImageFailed(false);
        setDraft({
          bio: nextProfile.bio,
          gender: nextProfile.gender,
          mbti: nextProfile.mbti,
          nickname: nextProfile.nickname,
          region: nextProfile.region,
        });
      },
      { tags: { screen: 'my-profile', action: 'load' } },
    );
  }, [router, user]);

  const nicknameNextChangeAt = nextNicknameChangeDate(profile.nicknameChangedAt);
  const nicknameChangeLocked =
    Boolean(profile.nickname)
    && Boolean(nicknameNextChangeAt)
    && nicknameNextChangeAt!.getTime() > Date.now();
  const nicknameValidation = validateNickname(draft.nickname ?? '');
  const nicknameHelperClass =
    nicknameValidation.state === 'valid'
      ? 'text-success'
      : nicknameValidation.state === 'invalid'
        ? 'text-danger'
        : undefined;
  const nicknameHelper =
    nicknameValidation.state === 'valid'
      ? `✓ ${nicknameValidation.message}`
      : nicknameValidation.state === 'invalid'
        ? `✗ ${nicknameValidation.message}`
        : nicknameValidation.message;
  const hasProfileChanges =
    normalizedNullable(draft.nickname) !== normalizedNullable(profile.nickname)
    || trimmedNullable(draft.bio) !== trimmedNullable(profile.bio)
    || (draft.gender ?? null) !== (profile.gender ?? null)
    || (draft.mbti ?? null) !== (profile.mbti ?? null)
    || (draft.region ?? null) !== (profile.region ?? null);
  const nicknameChanged =
    normalizedNullable(draft.nickname) !== normalizedNullable(profile.nickname);
  const canSave =
    hasProfileChanges
    && !isSaving
    && (!nicknameChanged || (!nicknameChangeLocked && nicknameValidation.state === 'valid'));
  const displayedProfile = useMemo(
    () => ({
      ...profile,
      ...draft,
    }),
    [draft, profile],
  );

  const openNicknameEditor = () => {
    if (nicknameChangeLocked) {
      analytics.capture(ANALYTICS_EVENTS.nickname_change_throttled_30d);
      setNicknameLockVisible(true);
      return;
    }

    setEditor('nickname');
  };

  const saveProfile = () => {
    if (!user?.id || !canSave) {
      return;
    }

    void logger.withErrorCapture(
      'my-profile.save',
      async () => {
        setIsSaving(true);
        const nextNickname = normalizedNullable(draft.nickname);

        if (!nextNickname) {
          setSaveFailedMessage('닉네임을 입력해주세요.');
          return;
        }

        if (nicknameChanged) {
          const { data: duplicate, error: duplicateError } = await supabase
            .from('profile')
            .select('user_id')
            .eq('nickname_lower', nextNickname.toLowerCase())
            .neq('user_id', user.id)
            .limit(1);

          if (duplicateError) {
            throw duplicateError;
          }

          if (duplicate && duplicate.length > 0) {
            setSaveFailedMessage('이미 사용 중인 닉네임이에요.');
            return;
          }
        }

        const changedAt = nicknameChanged ? new Date().toISOString() : profile.nicknameChangedAt;
        const { error } = await supabase
          .from('profile')
          .update({
            bio: trimmedNullable(draft.bio),
            gender: draft.gender || null,
            mbti: draft.mbti || null,
            nickname: nextNickname,
            ...(nicknameChanged ? { nickname_changed_at: changedAt } : {}),
            region: draft.region || null,
          })
          .eq('user_id', user.id);

        if (error) {
          throw error;
        }

        setProfile((current) => ({
          ...current,
          bio: trimmedNullable(draft.bio),
          gender: draft.gender || null,
          mbti: draft.mbti || null,
          nickname: nextNickname,
          nicknameChangedAt: changedAt,
          region: draft.region || null,
        }));
        mergeCachedProfileSnapshot(user.id, {
          bio: trimmedNullable(draft.bio),
          gender: draft.gender || null,
          mbti: draft.mbti || null,
          nickname: nextNickname,
          nicknameChangedAt: changedAt,
          region: draft.region || null,
        });
        setSaveSucceeded(true);
      },
      { tags: { screen: 'my-profile', action: 'save' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'my-profile', action: 'save-catch' },
        });
        setSaveFailedMessage('프로필을 저장하지 못했어요. 잠시 후 다시 시도해주세요.');
      })
      .finally(() => setIsSaving(false));
  };

  const editPhoto = () => {
    if (!user?.id || isPhotoUploading) {
      return;
    }

    void logger.withErrorCapture(
      'my-profile.photo-edit',
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

        const photoAsset = result.assets[0];
        setPhotoImageFailed(false);
        setProfile((current) => ({
          ...current,
          photoDisplayUrl: photoAsset.uri,
        }));

        setIsPhotoUploading(true);
        const path = await uploadProfilePhoto(user.id, photoAsset);
        const { error } = await supabase
          .from('profile')
          .update({ photo_url: path })
          .eq('user_id', user.id);

        if (error) {
          throw error;
        }

        const { data: signedPhoto, error: signedPhotoError } = await signedPhotoUrl(path);
        if (signedPhotoError) {
          throw signedPhotoError;
        }

        analytics.capture(ANALYTICS_EVENTS.profile_photo_uploaded, {
          source: 'my_profile',
        });
        setPhotoImageFailed(false);
        setProfile((current) => ({
          ...current,
          photoDisplayUrl: signedPhoto.signedUrl,
          photoUrl: path,
        }));
        mergeCachedProfileSnapshot(user.id, {
          photoDisplayUrl: signedPhoto.signedUrl,
          photoUrl: path,
        });
      },
      { tags: { screen: 'my-profile', action: 'photo-edit' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'my-profile', action: 'photo-edit-catch' },
        });
        setPhotoFailed(true);
      })
      .finally(() => setIsPhotoUploading(false));
  };

  const photoDisplayUrl = photoImageFailed ? null : profile.photoDisplayUrl;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav
        title="내 프로필"
        onLeftPress={() => router.back()}
        rightActions={(
          <Button
            size="sm"
            variant={hasProfileChanges ? 'ink' : 'tertiary'}
            disabled={!canSave}
            onPress={saveProfile}
          >
            {isSaving ? '저장 중' : '저장'}
          </Button>
        )}
      />

      <ScrollView className="flex-1 bg-bg">
        <View className="pb-[42px]">
          <View className="px-[24px] pt-[26px]">
            <ProfileHero
              size="lg"
              editable
              name={displayedProfile.nickname ?? '프로필'}
              meta={profileMeta({
                birthYear: displayedProfile.birthYear,
                gender: displayedProfile.gender,
                region: null,
              })}
              initial={toInitial(displayedProfile.nickname)}
              onEditPress={editPhoto}
            >
              {photoDisplayUrl ? (
                <Image
                  key={photoDisplayUrl}
                  source={{ uri: photoDisplayUrl }}
                  className="absolute inset-0 h-full w-full"
                  resizeMode="cover"
                  accessibilityLabel="프로필 사진"
                  onError={(error) => {
                    setPhotoImageFailed(true);
                    logger.captureException(new Error('profile photo image load failed'), {
                      tags: { screen: 'my-profile', action: 'photo-render' },
                      extra: {
                        renderError: error.nativeEvent.error,
                        photoPath: profile.photoUrl,
                      },
                    });
                  }}
                />
              ) : null}
            </ProfileHero>

            {isPhotoUploading ? (
              <View className="mt-[12px] flex-row items-center justify-center gap-[8px]">
                <Spinner size={36} className="scale-50" />
                <Text className="text-[12px] font-semibold text-ink-3">사진 업로드 중</Text>
              </View>
            ) : null}

            <View className="mt-[26px]">
              <Text variant="eyebrow" tone="ink-3" className="px-[2px] pb-[8px]">
                프로필
              </Text>
              <SettingsRow
                label="닉네임"
                value={displayedProfile.nickname ?? '미입력'}
                onPress={openNicknameEditor}
                className="px-0"
              />
              <SettingsRow
                label="한 줄 자기소개"
                value={displayedProfile.bio ?? '미입력'}
                onPress={() => setEditor('bio')}
                className="px-0"
              />
              <SettingsRow
                label="MBTI"
                value={displayedProfile.mbti ?? '미입력'}
                onPress={() => setEditor('mbti')}
                className="px-0"
              />
              <SettingsRow
                label="지역"
                value={displayedProfile.region ?? '미입력'}
                onPress={() => setEditor('region')}
                className="px-0"
              />
              <SettingsRow
                label="성별"
                value={genderLabel(displayedProfile.gender)}
                onPress={() => setEditor('gender')}
                className="px-0"
              />
              <SettingsRow
                variant="locked"
                label="생년월일"
                value={birthDateLabel(profile.birthDate, profile.birthYear)}
                className="px-0"
              />
            </View>

            <View className="mt-[24px]">
              <Text variant="eyebrow" tone="ink-3" className="px-[2px] pb-[8px]">
                바로 매치
              </Text>
              <Card className="flex-row items-center gap-[12px] px-[16px] py-[16px]">
                <View className="h-[36px] w-[36px] items-center justify-center rounded-full bg-accent-soft">
                  <Text className="text-[18px] font-black text-accent">⚡</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-extrabold text-ink">
                    잔여 {profile.passCount}회
                  </Text>
                  <Text className="mt-[3px] text-[11.5px] text-ink-3">
                    24시간 제한 면제권
                  </Text>
                </View>
                <Button
                  variant="mini-pill"
                  onPress={() => router.push(ROUTES.booster)}
                >
                  {profile.passCount > 0 ? '더 사기' : '지금 시작'}
                </Button>
              </Card>
            </View>
          </View>

          <View className="mt-[28px]">
            <Text variant="eyebrow" tone="ink-3" className="px-[24px] pb-[8px]">
              설정·계정
            </Text>
            <SettingsRow
              label="알림"
              value={profile.notificationEnabled ? '켬' : '끔'}
              onPress={() => router.push(ROUTES.settingsNotifications)}
            />
            <SettingsRow
              label="약관 보기"
              onPress={() => setTermsVisible(true)}
            />
            <SettingsRow
              label="고객센터"
              onPress={() => router.push(ROUTES.support)}
            />
            <SettingsRow
              label="환불 요청"
              onPress={() =>
                router.push({
                  pathname: '/(app)/support',
                  params: { category: '결제·환불' },
                })
              }
            />
            <SettingsRow
              variant="danger"
              label="회원 탈퇴"
              onPress={() => router.push(ROUTES.settingsWithdraw)}
            />
          </View>

          {nicknameChangeLocked && nicknameNextChangeAt ? (
            <View className="px-[24px] pt-[22px]">
              <Banner tone="info" icon="i" title="닉네임 변경">
                {`다음 변경 가능: ${formatDateLabel(nicknameNextChangeAt)}`}
              </Banner>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <AlertDialog
        visible={termsVisible}
        tone="info"
        icon="i"
        title="약관 보기"
        description="서비스 이용약관, 개인정보 처리방침, 위치정보 수집, 마케팅 정보 수신 약관을 확인할 수 있어요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setTermsVisible(false) }]}
        onDismiss={() => setTermsVisible(false)}
      />

      <BottomSheet
        visible={editor !== null}
        onClose={() => setEditor(null)}
        heightPct={editor === 'bio' ? 48 : editor === 'nickname' || editor === 'gender' ? 42 : 62}
      >
        <View className="flex-1 px-[24px] pb-[18px] pt-[10px]">
          <Text variant="h2">
            {editor === 'nickname'
              ? '닉네임 수정'
                : editor === 'bio'
                  ? '한 줄 자기소개'
                  : editor === 'gender'
                    ? '성별 선택'
                    : editor === 'mbti'
                      ? 'MBTI 선택'
                      : '지역 선택'}
          </Text>

          {editor === 'nickname' ? (
            <Input
              value={draft.nickname ?? ''}
              onChangeText={(value) => setDraft((current) => ({ ...current, nickname: value }))}
              label="닉네임"
              labelAccessory={`${normalizeNickname(draft.nickname ?? '').length} / ${NICKNAME_MAX_LENGTH}`}
              helper={nicknameHelper}
              helperClassName={nicknameHelperClass}
              maxLength={NICKNAME_MAX_LENGTH}
              className="mt-[20px]"
            />
          ) : null}

          {editor === 'bio' ? (
            <Textarea
              value={draft.bio ?? ''}
              onChangeText={(value) => setDraft((current) => ({ ...current, bio: value }))}
              maxLength={PROFILE_BIO_MAX_LENGTH}
              showCount
              placeholder="자유롭게 적어주세요"
              className="mt-[20px]"
            />
          ) : null}

          {editor === 'gender' ? (
            <View className="mt-[18px]">
              <ChoiceList
                tone="accent"
                value={draft.gender ?? ''}
                onChange={(value) => {
                  if (value === 'male' || value === 'female') {
                    setDraft((current) => ({ ...current, gender: value }));
                  }
                }}
                options={GENDER_OPTIONS}
              />
            </View>
          ) : null}

          {editor === 'mbti' ? (
            <ScrollView className="mt-[18px]">
              <ChoiceList
                value={draft.mbti ?? ''}
                onChange={(value) => setDraft((current) => ({ ...current, mbti: value || null }))}
                options={[
                  { label: '선택 안 함', value: '' },
                  ...MBTI_OPTIONS.map((value) => ({ label: value, value })),
                ]}
              />
            </ScrollView>
          ) : null}

          {editor === 'region' ? (
            <ScrollView className="mt-[18px]">
              <ChoiceList
                value={draft.region ?? ''}
                onChange={(value) => setDraft((current) => ({ ...current, region: value || null }))}
                options={[
                  { label: '선택 안 함', value: '' },
                  ...REGION_OPTIONS.map((value) => ({ label: value, value })),
                ]}
              />
            </ScrollView>
          ) : null}

          <View className="mt-auto">
            <Button fullWidth onPress={() => setEditor(null)}>
              완료
            </Button>
          </View>
        </View>
      </BottomSheet>

      <AlertDialog
        visible={nicknameLockVisible}
        tone="info"
        icon="i"
        title="아직 닉네임을 바꿀 수 없어요"
        description={
          nicknameNextChangeAt
            ? `다음 변경 가능: ${formatDateLabel(nicknameNextChangeAt)}`
            : `닉네임은 ${POLICY.identity.nicknameChangeThrottleDays}일에 한 번만 바꿀 수 있어요.`
        }
        actions={[{ label: '확인', variant: 'ink', onPress: () => setNicknameLockVisible(false) }]}
        onDismiss={() => setNicknameLockVisible(false)}
      />

      <AlertDialog
        visible={!!saveFailedMessage}
        tone="warn"
        icon="!"
        title="저장하지 못했어요"
        description={saveFailedMessage ?? ''}
        actions={[{ label: '확인', variant: 'ink', onPress: () => setSaveFailedMessage(null) }]}
        onDismiss={() => setSaveFailedMessage(null)}
      />

      <AlertDialog
        visible={saveSucceeded}
        tone="info"
        icon="i"
        title="저장했어요"
        description="내 프로필에 반영됐어요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setSaveSucceeded(false) }]}
        onDismiss={() => setSaveSucceeded(false)}
      />

      <AlertDialog
        visible={cameraPermissionDenied}
        tone="warn"
        icon="!"
        title="카메라 권한이 필요해요"
        description="프로필 사진은 지금 촬영한 사진만 사용할 수 있어요. 설정에서 카메라 권한을 켜주세요."
        actions={[
          {
            label: '설정에서 카메라 켜기',
            variant: 'accent',
            onPress: () => {
              setCameraPermissionDenied(false);
              void openSystemSettings().catch((error) => {
                logger.captureException(error, {
                  tags: { screen: 'my-profile', action: 'open-camera-settings' },
                });
              });
            },
          },
          { label: '닫기', variant: 'secondary', onPress: () => setCameraPermissionDenied(false) },
        ]}
        onDismiss={() => setCameraPermissionDenied(false)}
      />

      <AlertDialog
        visible={photoFailed}
        tone="warn"
        icon="!"
        title="사진을 바꾸지 못했어요"
        description="카메라 권한과 네트워크 상태를 확인한 뒤 다시 시도해주세요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setPhotoFailed(false) }]}
        onDismiss={() => setPhotoFailed(false)}
      />
    </SafeAreaView>
  );
}
