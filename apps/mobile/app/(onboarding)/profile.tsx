import { Camera, Check, ChevronDown, ChevronLeft, ImagePlus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '@dei/shared';
import {
  ActivityIndicator,
  BackHandler,
  Image as NativeImage,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { mbtiOptions, regionOptions } from '@/constants/profile-options';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useAccountGate } from '@/providers/account-gate-provider';

type ProfileStep = 'basic' | 'detail' | 'interests';

const genderOptions = [
  { label: '여성', value: '여성' },
  { label: '남성', value: '남성' },
];

const profileImageBucket = 'profile-images';

const interestGroups = [
  { category: '운동·스포츠', tags: ['러닝', '헬스', '요가', '축구', '클라이밍'] },
  { category: '음식·미식', tags: ['카페', '와인', '맛집', '디저트', '요리'] },
  { category: '문화 예술', tags: ['전시', '영화', '독서', '사진', '공연'] },
  { category: '여행·아웃도어', tags: ['국내여행', '해외여행', '캠핑', '드라이브', '산책'] },
  { category: '음악', tags: ['인디', '재즈', '힙합', '플레이리스트', '페스티벌'] },
  { category: '라이프스타일', tags: ['반려동물', '인테리어', '패션', '루틴', '웰니스'] },
  { category: '게임·취미', tags: ['콘솔게임', '보드게임', '애니', '공예', '수집'] },
  { category: '자기계발', tags: ['외국어', '커리어', '스터디', '경제', '글쓰기'] },
];

const currentYear = new Date().getFullYear();
const birthYearOptions = Array.from({ length: currentYear - 1900 + 1 }, (_, index) => {
  const year = String(currentYear - index);

  return {
    label: `${year}년`,
    value: year,
  };
});
const birthMonthOptions = Array.from({ length: 12 }, (_, index) => {
  const month = String(index + 1);

  return {
    label: `${month}월`,
    value: month,
  };
});
const getBirthDayOptions = (year: string, month: string) => {
  const dayCount = year && month ? new Date(Number(year), Number(month), 0).getDate() : 31;

  return Array.from({ length: dayCount }, (_, index) => {
    const day = String(index + 1);

    return {
      label: `${day}일`,
      value: day,
    };
  });
};

const isValidBirthDate = (birthDate: string) => {
  const birth = new Date(`${birthDate}T00:00:00`);

  if (Number.isNaN(birth.getTime())) {
    return false;
  }

  const [year, month, day] = birthDate.split('-').map(Number);
  const today = new Date();

  return (
    birth.getFullYear() === year &&
    birth.getMonth() + 1 === month &&
    birth.getDate() === day &&
    birth >= new Date('1900-01-01T00:00:00') &&
    birth <= today
  );
};

const getTagCategory = (tag: string) =>
  interestGroups.find((group) => group.tags.includes(tag))?.category ?? '기타';

type PickerOption = {
  label: string;
  value: string;
};

type SelectedProfileImage = {
  fileName?: string | null;
  mimeType?: string | null;
  source: 'camera' | 'library';
  uri: string;
};

function SelectionField({
  disabled = false,
  emptyText,
  onSelect,
  options,
  placeholder,
  title,
  value,
}: {
  disabled?: boolean;
  emptyText?: string;
  onSelect: (nextValue: string) => void;
  options: PickerOption[];
  placeholder: string;
  title: string;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedLabel = options.find((option) => option.value === value)?.label;
  const filteredOptions = query.trim()
    ? options.filter((option) => option.label.includes(query.trim()))
    : options;
  const showSearch = options.length > 8;
  const close = () => {
    setQuery('');
    setIsOpen(false);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        className={cn(
          'border-border bg-background h-14 flex-row items-center justify-between rounded-md border px-4',
          disabled && 'opacity-50',
        )}
        onPress={() => setIsOpen(true)}>
        <Text className={cn('text-base font-semibold', !selectedLabel && 'text-muted-foreground')}>
          {selectedLabel ?? placeholder}
        </Text>
        <ChevronDown color="#8F6A2C" size={20} />
      </Pressable>

      <Modal
        animationType="slide"
        onRequestClose={close}
        transparent
        visible={isOpen}>
        <View className="flex-1 justify-end bg-black/50">
          <Pressable className="flex-1" onPress={close} />
          <SafeAreaView className="bg-background max-h-[88%] rounded-t-2xl">
            <View className="gap-4 px-5 pb-6 pt-4">
              <View className="bg-border mx-auto h-1 w-12 rounded-full" />
              <View className="gap-1">
                <Text className="text-foreground text-2xl font-semibold">{title}</Text>
                <Text className="text-muted-foreground">
                  {showSearch ? `${placeholder} · ${options.length}개` : placeholder}
                </Text>
              </View>

              {showSearch ? (
                <Input
                  autoFocus
                  className="h-12 bg-background"
                  onChangeText={setQuery}
                  placeholder="검색"
                  value={query}
                />
              ) : null}

              {options.length > 0 ? (
                <ScrollView
                  className="max-h-[560px]"
                  contentContainerClassName="gap-2 pb-4"
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator>
                  {filteredOptions.length > 0 ? (
                    filteredOptions.map((option) => {
                      const isSelected = option.value === value;

                      return (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                          className={cn(
                            'border-border bg-background min-h-14 flex-row items-center justify-between rounded-md border px-4 py-3',
                            isSelected && 'border-primary bg-primary',
                          )}
                          key={option.value}
                          onPress={() => {
                            onSelect(option.value);
                            close();
                          }}>
                          <Text
                            className={cn('text-base font-semibold', isSelected && 'text-primary-foreground')}>
                            {option.label}
                          </Text>
                          {isSelected ? <Check color="#F2EADA" size={16} /> : null}
                        </Pressable>
                      );
                    })
                  ) : (
                    <Text className="text-muted-foreground py-3 text-sm">검색 결과가 없어요.</Text>
                  )}
                </ScrollView>
              ) : (
                <Text className="text-muted-foreground py-3 text-sm">
                  {emptyText ?? '선택지가 없어요.'}
                </Text>
              )}
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const getImageExtension = (image: SelectedProfileImage) => {
  const fileNameExtension = image.fileName?.split('.').pop()?.toLowerCase();

  if (fileNameExtension && ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(fileNameExtension)) {
    return fileNameExtension === 'jpeg' ? 'jpg' : fileNameExtension;
  }

  switch (image.mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
      return 'heic';
    case 'image/heif':
      return 'heif';
    default:
      return 'jpg';
  }
};

const getImageContentType = (image: SelectedProfileImage) => {
  if (
    image.mimeType &&
    ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(image.mimeType)
  ) {
    return image.mimeType;
  }

  return 'image/jpeg';
};

export default function ProfileScreen() {
  const router = useRouter();
  const { completeProfile } = useAccountGate();
  const [step, setStep] = useState<ProfileStep>('basic');
  const [displayName, setDisplayName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [gender, setGender] = useState('');
  const [regionSido, setRegionSido] = useState('');
  const [regionSigungu, setRegionSigungu] = useState('');
  const [bio, setBio] = useState('');
  const [mbti, setMbti] = useState('');
  const [profileImagePath, setProfileImagePath] = useState('');
  const [selectedProfileImage, setSelectedProfileImage] = useState<SelectedProfileImage | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [activeInterestCategory, setActiveInterestCategory] = useState(interestGroups[0].category);
  const [basicError, setBasicError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [isPhotoSheetOpen, setIsPhotoSheetOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const birthDate = useMemo(() => {
    if (birthYear.length !== 4 || birthMonth.length === 0 || birthDay.length === 0) {
      return '';
    }

    return `${birthYear}-${birthMonth.padStart(2, '0')}-${birthDay.padStart(2, '0')}`;
  }, [birthDay, birthMonth, birthYear]);

  const selectedCategories = useMemo(
    () => Array.from(new Set(selectedTags.map(getTagCategory))),
    [selectedTags],
  );

  const getBasicValidationMessage = () => {
    if (!displayName.trim()) {
      return '닉네임을 입력해 주세요.';
    }

    if (!birthYear || !birthMonth || !birthDay) {
      return '생년월일을 입력해 주세요.';
    }

    if (!isValidBirthDate(birthDate)) {
      return '올바른 생년월일을 입력해 주세요.';
    }

    if (!gender) {
      return '성별을 선택해 주세요.';
    }

    if (!regionSido || !regionSigungu) {
      return '지역을 시/도와 시/군/구까지 선택해 주세요.';
    }

    return null;
  };
  const detailComplete = bio.length <= 200;
  const interestsComplete = selectedTags.length >= 3 && selectedTags.length <= 10;
  const activeRegion = regionOptions.find((option) => option.sido === regionSido);
  const regionSidoPickerOptions = regionOptions.map((option) => ({
    label: option.sido,
    value: option.sido,
  }));
  const regionSigunguPickerOptions =
    activeRegion?.sigungu.map((sigungu) => ({
      label: sigungu,
      value: sigungu,
    })) ?? [];
  const birthDayPickerOptions = useMemo(
    () => getBirthDayOptions(birthYear, birthMonth),
    [birthMonth, birthYear],
  );
  const activeInterestGroup =
    interestGroups.find((group) => group.category === activeInterestCategory) ?? interestGroups[0];

  const handleStepBack = useCallback(() => {
    if (step === 'interests') {
      setStep('detail');
      return true;
    }

    if (step === 'detail') {
      setStep('basic');
      return true;
    }

    return false;
  }, [step]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleStepBack);

    return () => subscription.remove();
  }, [handleStepBack]);

  const handleBasicNext = () => {
    const validationMessage = getBasicValidationMessage();

    if (validationMessage) {
      setBasicError(validationMessage);
      return;
    }

    setBasicError(null);
    setStep('detail');
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((current) => {
      if (current.includes(tag)) {
        return current.filter((item) => item !== tag);
      }

      if (current.length >= 10) {
        return current;
      }

      return [...current, tag];
    });
  };

  const handlePickProfileImage = async (source: SelectedProfileImage['source']) => {
    setError(null);
    setIsPickingImage(true);

    try {
      const ImagePicker = await import('expo-image-picker');
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setError(source === 'camera' ? '카메라 권한이 필요해요.' : '사진 접근 권한이 필요해요.');
        return;
      }

      const pickerOptions = {
        allowsEditing: true,
        aspect: [1, 1] as [number, number],
        mediaTypes: 'images' as const,
        quality: 0.85,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(pickerOptions)
          : await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }

      const asset = result.assets[0];
      setSelectedProfileImage({
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        source,
        uri: asset.uri,
      });
      setProfileImagePath('');
    } catch (pickerError) {
      logger.captureException(pickerError, {
        tags: { feature: 'profile-onboarding', action: 'pick-profile-image' },
        extra: { source },
      });
      setError(
        pickerError instanceof Error && pickerError.message.includes('Cannot find native module')
          ? '사진 선택 모듈이 dev client에 아직 없어요. 한 번만 앱을 다시 빌드하면 사용할 수 있어요.'
          : '사진 선택을 열 수 없어요.',
      );
    } finally {
      setIsPickingImage(false);
    }
  };

  const uploadSelectedProfileImage = async () => {
    if (!selectedProfileImage) {
      return profileImagePath;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      throw userError ?? new Error('프로필 사진을 업로드하려면 로그인이 필요해요.');
    }

    const extension = getImageExtension(selectedProfileImage);
    const storagePath = `${userData.user.id}/profile-${Date.now()}.${extension}`;
    const response = await fetch(selectedProfileImage.uri);

    if (!response.ok) {
      throw new Error('선택한 사진 파일을 읽을 수 없어요.');
    }

    const imageBody = await response.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(profileImageBucket)
      .upload(storagePath, imageBody, {
        contentType: getImageContentType(selectedProfileImage),
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    setProfileImagePath(storagePath);
    return storagePath;
  };

  const handleSubmitInterests = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const uploadedProfileImagePath = await uploadSelectedProfileImage();

      await completeProfile({
        birthDate,
        bio: bio.trim(),
        displayName: displayName.trim(),
        gender,
        interestCategories: selectedCategories,
        interestTags: selectedTags,
        mbti,
        profileImagePath: uploadedProfileImagePath,
        regionSido,
        regionSigungu,
      });
      router.replace(ROUTES.logIntro as never);
    } catch (submitError) {
      logger.captureException(submitError, {
        tags: { feature: 'profile-onboarding', action: 'submit-profile' },
        extra: {
          hasSelectedImage: !!selectedProfileImage,
          interestCategoryCount: selectedCategories.length,
          interestTagCount: selectedTags.length,
        },
      });
      setError(submitError instanceof Error ? submitError.message : '프로필을 저장할 수 없어요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepHeader = (
    eyebrow: string,
    title: string,
    description: string,
    canGoBack = false,
  ) => (
    <View className="mb-8 gap-4">
      <View className="min-h-12 flex-row items-center">
        {canGoBack ? (
          <Pressable
            accessibilityLabel="이전 단계"
            accessibilityRole="button"
            className="bg-background border-border mr-3 h-11 w-11 items-center justify-center rounded-full border"
            disabled={isSubmitting}
            onPress={handleStepBack}>
            <ChevronLeft color="#8F6A2C" size={22} />
          </Pressable>
        ) : null}
        <Text className="text-muted-foreground flex-1 text-xs font-semibold uppercase tracking-[4px]">
          {eyebrow}
        </Text>
      </View>
      <Text className="text-foreground text-4xl font-semibold leading-tight">{title}</Text>
      <Text className="text-muted-foreground text-base leading-6">{description}</Text>
    </View>
  );

  const renderChip = ({
    isSelected,
    label,
    onPress,
  }: {
    isSelected: boolean;
    label: string;
    onPress: () => void;
  }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      className={cn(
        'border-border bg-background flex-row items-center gap-2 rounded-md border px-4 py-3',
        isSelected && 'border-primary bg-primary',
      )}
      key={label}
      onPress={onPress}>
      {isSelected ? <Check color="#F2EADA" size={16} /> : null}
      <Text className={cn('font-semibold', isSelected && 'text-primary-foreground')}>{label}</Text>
    </Pressable>
  );

  const renderBasicStep = () => (
    <>
      {renderStepHeader(
        'P1 · BASIC PROFILE · 1 / 3',
        '기본 프로필 정보를 입력해 주세요',
        '닉네임, 생년월일, 성별, 지역은 추천과 계정 식별에 필요한 최소 정보입니다.',
      )}

      <View className="gap-7">
        <View className="gap-2">
          <Text className="font-semibold">닉네임</Text>
          <Input
            autoFocus
            editable={!isSubmitting}
            inputMode="text"
            keyboardType="default"
            maxLength={12}
            onChangeText={(nextValue) => {
              setBasicError(null);
              setDisplayName(nextValue);
            }}
            placeholder="서연"
            returnKeyType="done"
            value={displayName}
            className="h-14 rounded-md bg-background text-lg"
          />
        </View>

        <View className="gap-2">
          <Text className="font-semibold">생년월일</Text>
          <View className="gap-3">
            <SelectionField
              disabled={isSubmitting}
              onSelect={(nextYear) => {
                setBasicError(null);
                setBirthYear(nextYear);
                if (birthMonth && birthDay && Number(birthDay) > getBirthDayOptions(nextYear, birthMonth).length) {
                  setBirthDay('');
                }
              }}
              options={birthYearOptions}
              placeholder="연도 선택"
              title="출생 연도"
              value={birthYear}
            />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <SelectionField
                  disabled={isSubmitting}
                  onSelect={(nextMonth) => {
                    setBasicError(null);
                    setBirthMonth(nextMonth);
                    if (birthYear && birthDay && Number(birthDay) > getBirthDayOptions(birthYear, nextMonth).length) {
                      setBirthDay('');
                    }
                  }}
                  options={birthMonthOptions}
                  placeholder="월"
                  title="출생 월"
                  value={birthMonth}
                />
              </View>
              <View className="flex-1">
                <SelectionField
                  disabled={isSubmitting || !birthMonth}
                  emptyText="먼저 월을 선택해 주세요."
                  onSelect={(nextDay) => {
                    setBasicError(null);
                    setBirthDay(nextDay);
                  }}
                  options={birthDayPickerOptions}
                  placeholder="일"
                  title="출생 일"
                  value={birthDay}
                />
              </View>
            </View>
          </View>
          {birthDate && !isValidBirthDate(birthDate) ? (
            <Text className="text-destructive text-sm">올바른 생년월일을 입력해 주세요.</Text>
          ) : null}
        </View>

        <View className="gap-3">
          <Text className="font-semibold">성별</Text>
          <View className="flex-row gap-3">
            {genderOptions.map((option) => (
              <Button
                key={option.value}
                className={cn('h-14 flex-1', gender !== option.value && 'bg-background')}
                onPress={() => {
                  setBasicError(null);
                  setGender(option.value);
                }}
                variant={gender === option.value ? 'default' : 'outline'}>
                <Text>{option.label}</Text>
              </Button>
            ))}
          </View>
        </View>

        <View className="gap-3">
          <Text className="font-semibold">지역</Text>
          <View className="gap-3">
            <SelectionField
              disabled={isSubmitting}
              onSelect={(nextSido) => {
                setBasicError(null);
                setRegionSido(nextSido);
                setRegionSigungu('');
              }}
              options={regionSidoPickerOptions}
              placeholder="시/도 선택"
              title="지역 선택"
              value={regionSido}
            />
            <SelectionField
              disabled={isSubmitting || !regionSido}
              emptyText="먼저 시/도를 선택해 주세요."
              onSelect={(nextSigungu) => {
                setBasicError(null);
                setRegionSigungu(nextSigungu);
              }}
              options={regionSigunguPickerOptions}
              placeholder="시/군/구 선택"
              title={`${regionSido || '지역'} 세부 선택`}
              value={regionSigungu}
            />
          </View>
        </View>

        {basicError ? <Text className="text-destructive text-sm">{basicError}</Text> : null}

        <Button onPress={handleBasicNext} size="lg">
          <Text>다음</Text>
        </Button>
      </View>
    </>
  );

  const renderDetailStep = () => (
    <>
      <View className="mb-3 flex-row justify-end">
        <Button
          disabled={isSubmitting}
          onPress={() => setStep('interests')}
          size="sm"
          variant="ghost">
          <Text>건너뛰기</Text>
        </Button>
      </View>
      {renderStepHeader(
        'P2 · DETAIL PROFILE · 2 / 3',
        '조금 더 알려주세요',
        '자기소개, MBTI, 프로필 사진은 나중에 마이페이지에서 다시 채울 수 있어요.',
        true,
      )}

      <View className="gap-7">
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="font-semibold">자기소개</Text>
            <Text className="text-muted-foreground text-sm">{bio.length}/200</Text>
          </View>
          <Input
            className="h-32 bg-background text-base leading-6"
            editable={!isSubmitting}
            maxLength={200}
            multiline
            onChangeText={setBio}
            numberOfLines={5}
            placeholder="요즘 빠져있는 것, 좋아하는 하루의 리듬을 적어주세요."
            textAlignVertical="top"
            value={bio}
          />
        </View>

        <View className="gap-3">
          <Text className="font-semibold">MBTI</Text>
          <View className="flex-row flex-wrap gap-2">
            {mbtiOptions.map((option) => {
              const isSelected = mbti === option;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  className={cn(
                    'border-border bg-background h-12 min-w-[76px] flex-1 basis-[22%] items-center justify-center rounded-md border px-2',
                    isSelected && 'border-primary bg-primary',
                  )}
                  disabled={isSubmitting}
                  key={option}
                  onPress={() => setMbti((current) => (current === option ? '' : option))}>
                  <Text
                    className={cn(
                      'text-center text-base font-semibold',
                      isSelected && 'text-primary-foreground',
                    )}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="gap-3">
          <Text className="font-semibold">프로필 사진 1장</Text>
          <Pressable
            accessibilityRole="button"
            className="border-border bg-card gap-4 rounded-md border p-5"
            disabled={isPickingImage || isSubmitting}
            onPress={() => setIsPhotoSheetOpen(true)}>
            <View className="items-center gap-3">
              {selectedProfileImage ? (
                <NativeImage
                  accessibilityLabel="선택한 프로필 사진"
                  className="bg-muted h-28 w-28 rounded-full"
                  resizeMode="cover"
                  source={{ uri: selectedProfileImage.uri }}
                />
              ) : (
                <View className="bg-muted h-24 w-24 items-center justify-center rounded-full">
                  <ImagePlus color="#8F6A2C" size={30} />
                </View>
              )}
              <Text className="text-muted-foreground text-center leading-6">
                갤러리 또는 카메라로 1:1 프로필 사진을 선택할 수 있어요.
              </Text>
            </View>
            <View className="border-border bg-background h-12 items-center justify-center rounded-md border">
              <Text className="font-semibold">{isPickingImage ? '여는 중' : '사진 선택'}</Text>
            </View>
            {selectedProfileImage ? (
              <Button
                disabled={isPickingImage || isSubmitting}
                onPress={(event) => {
                  event.stopPropagation();
                  setSelectedProfileImage(null);
                  setProfileImagePath('');
                }}
                variant="ghost">
                <Text>사진 삭제</Text>
              </Button>
            ) : null}
          </Pressable>

          <Modal
            animationType="slide"
            onRequestClose={() => setIsPhotoSheetOpen(false)}
            transparent
            visible={isPhotoSheetOpen}>
            <View className="flex-1 justify-end bg-black/50">
              <Pressable className="flex-1" onPress={() => setIsPhotoSheetOpen(false)} />
              <SafeAreaView className="bg-background rounded-t-2xl">
                <View className="gap-4 px-5 pb-6 pt-4">
                  <View className="bg-border mx-auto h-1 w-12 rounded-full" />
                  <View className="gap-1">
                    <Text className="text-foreground text-2xl font-semibold">프로필 사진 선택</Text>
                    <Text className="text-muted-foreground">사진은 1:1 비율로 자른 뒤 저장돼요.</Text>
                  </View>
                  <Button
                    disabled={isPickingImage}
                    onPress={() => {
                      setIsPhotoSheetOpen(false);
                      void handlePickProfileImage('library');
                    }}
                    size="lg"
                    variant="outline">
                    <ImagePlus color="#8F6A2C" size={18} />
                    <Text>갤러리에서 선택</Text>
                  </Button>
                  <Button
                    disabled={isPickingImage}
                    onPress={() => {
                      setIsPhotoSheetOpen(false);
                      void handlePickProfileImage('camera');
                    }}
                    size="lg"
                    variant="outline">
                    <Camera color="#8F6A2C" size={18} />
                    <Text>카메라로 촬영</Text>
                  </Button>
                  <Button onPress={() => setIsPhotoSheetOpen(false)} size="lg" variant="ghost">
                    <Text>닫기</Text>
                  </Button>
                </View>
              </SafeAreaView>
            </View>
          </Modal>
        </View>

        {error ? <Text className="text-destructive text-sm">{error}</Text> : null}

        <Button disabled={!detailComplete} onPress={() => setStep('interests')} size="lg">
          <Text>다음</Text>
        </Button>
      </View>
    </>
  );

  const renderInterestsStep = () => (
    <>
      {renderStepHeader(
        'P3 · INTERESTS · 3 / 3',
        '관심사를 골라주세요',
        '관심사가 비슷한 사람을 만나기 위해 최소 3개를 골라주세요.',
        true,
      )}

      <View className="gap-6">
        <View className="border-border bg-card flex-row items-center justify-between rounded-md border px-4 py-3">
          <Text className="font-semibold">선택한 관심사</Text>
          <Text className={cn('font-semibold', selectedTags.length < 3 && 'text-destructive')}>
            {selectedTags.length}/10
          </Text>
        </View>

        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2 pr-4">
            {interestGroups.map((group) => {
              const isActive = group.category === activeInterestCategory;
              const selectedInGroup = group.tags.filter((tag) => selectedTags.includes(tag)).length;

              return (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  className={cn(
                    'border-border bg-background min-h-12 flex-row items-center gap-2 rounded-md border px-4 py-3',
                    isActive && 'border-primary bg-primary',
                  )}
                  key={group.category}
                  onPress={() => setActiveInterestCategory(group.category)}>
                  {selectedInGroup > 0 ? (
                    <Check color={isActive ? '#F2EADA' : '#8F6A2C'} size={14} />
                  ) : null}
                  <Text
                    className={cn(
                      'text-sm font-semibold',
                      isActive && 'text-primary-foreground',
                    )}>
                    {group.category}
                    {selectedInGroup > 0 ? ` ${selectedInGroup}` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View className="gap-3">
          <Text className="text-muted-foreground text-sm font-semibold">
            {activeInterestGroup.category}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {activeInterestGroup.tags.map((tag) =>
              renderChip({
                isSelected: selectedTags.includes(tag),
                label: tag,
                onPress: () => toggleTag(tag),
              }),
            )}
          </View>
        </View>

        {selectedTags.length < 3 ? (
          <Text className="text-destructive text-sm">최소 3개를 선택하면 다음으로 넘어갈 수 있어요.</Text>
        ) : null}
        {error ? <Text className="text-destructive text-sm">{error}</Text> : null}

        <Button disabled={!interestsComplete || isSubmitting} onPress={handleSubmitInterests} size="lg">
          {isSubmitting ? <ActivityIndicator color="#F2EADA" /> : <Text>다음</Text>}
        </Button>
      </View>
    </>
  );

  return (
    <SafeAreaView className="bg-background flex-1">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView
          bounces={false}
          contentContainerClassName="flex-grow px-7 pb-8 pt-10"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}>
          {step === 'basic' ? renderBasicStep() : null}
          {step === 'detail' ? renderDetailStep() : null}
          {step === 'interests' ? renderInterestsStep() : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
