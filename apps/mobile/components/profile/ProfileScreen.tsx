import { ActivityIndicator, Alert, Image, ScrollView, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Ban, Flag } from 'lucide-react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ProfileLogFeed } from '@/components/profile/ProfileLogFeed';
import { useProfileFeed, type ProfileMode, type ProfileSummary } from '@/hooks/useProfileFeed';

type ProfileScreenProps = {
  mode: ProfileMode;
  profileUserId: string | undefined;
};

function genderLabel(gender: string | null): string | null {
  if (gender === 'M') return '남';
  if (gender === 'F') return '여';
  return gender;
}

function profileMeta(profile: ProfileSummary): string {
  return [
    genderLabel(profile.gender),
    profile.regionSido,
    profile.regionSigungu,
    profile.mbti,
  ]
    .filter(Boolean)
    .join(' · ');
}

function ProfileHeader({ profile }: { profile: ProfileSummary }) {
  const meta = profileMeta(profile);
  const tags = [...profile.interestCategories, ...profile.interestTags].slice(0, 8);

  return (
    <View className="gap-5">
      <View className="flex-row items-center gap-4">
        {profile.photoUrl ? (
          <Image
            accessibilityLabel="프로필 사진"
            className="h-20 w-20 rounded-md bg-muted"
            source={{ uri: profile.photoUrl }}
          />
        ) : (
          <View className="h-20 w-20 items-center justify-center rounded-md bg-muted">
            <Text className="text-2xl font-semibold text-muted-foreground">
              {(profile.nickname ?? 'd').slice(0, 1)}
            </Text>
          </View>
        )}

        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-2xl font-semibold">{profile.nickname ?? '이름 없음'}</Text>
          {meta ? <Text className="text-sm text-muted-foreground">{meta}</Text> : null}
        </View>
      </View>

      {profile.intro ? (
        <Text className="text-base leading-6 text-foreground">{profile.intro}</Text>
      ) : null}

      {tags.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {tags.map((tag) => (
            <View className="rounded-md bg-muted px-2.5 py-1" key={tag}>
              <Text className="text-xs font-semibold text-muted-foreground">{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ProfileScreen({ mode, profileUserId }: ProfileScreenProps) {
  const router = useRouter();
  const {
    blockProfile,
    days,
    error,
    isBlockedByViewer,
    isBlocking,
    isLoading,
    isReporting,
    profile,
    reportProfile,
  } = useProfileFeed(mode, profileUserId);

  const handleReport = () => {
    Alert.alert('신고', '이 프로필을 신고할까요?', [
      { style: 'cancel', text: '취소' },
      {
        text: '신고',
        style: 'destructive',
        onPress: async () => {
          const ok = await reportProfile();
          Alert.alert('', ok ? '신고가 접수됐어요.' : '신고를 접수할 수 없어요.');
        },
      },
    ]);
  };

  const handleBlock = () => {
    Alert.alert('차단', '이 프로필을 차단할까요?', [
      { style: 'cancel', text: '취소' },
      {
        text: '차단',
        style: 'destructive',
        onPress: async () => {
          const ok = await blockProfile();
          Alert.alert('', ok ? '차단했어요.' : '차단할 수 없어요.');
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 px-4 pb-3 pt-14">
        <TouchableOpacity
          accessibilityLabel="뒤로 가기"
          className="h-10 w-10 items-center justify-center rounded-md border border-border bg-background"
          hitSlop={8}
          onPress={() => router.back()}
        >
          <ArrowLeft size={18} color="#171310" />
        </TouchableOpacity>
        <Text className="text-lg font-semibold">
          {mode === 'self' ? '내 프로필' : '프로필'}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow px-4 pb-8"
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#C0432A" />
          </View>
        ) : profile ? (
          <View className="gap-7">
            <ProfileHeader profile={profile} />

            {mode === 'public' ? (
              <View className="flex-row gap-2">
                <Button
                  className="flex-1"
                  disabled={isReporting}
                  onPress={handleReport}
                  variant="outline"
                >
                  <Flag size={16} color="#171310" />
                  <Text>신고</Text>
                </Button>
                <Button
                  className="flex-1"
                  disabled={isBlocking}
                  onPress={handleBlock}
                  variant="destructive"
                >
                  <Ban size={16} color="#fff" />
                  <Text>차단</Text>
                </Button>
              </View>
            ) : null}

            <ProfileLogFeed days={days} />
          </View>
        ) : isBlockedByViewer ? (
          <View className="flex-1 items-center justify-center rounded-md border border-border bg-card px-5">
            <View className="items-center gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-md bg-muted">
                <Ban size={22} color="#6E6258" />
              </View>
              <View className="gap-1">
                <Text className="text-center text-base font-semibold">
                  차단한 프로필입니다.
                </Text>
                <Text className="text-center text-sm leading-5 text-muted-foreground">
                  차단을 해제하기 전까지 이 프로필과 로그를 볼 수 없어요.
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View className="flex-1 items-center justify-center rounded-md border border-border bg-card px-4">
            <Text className="text-center text-sm text-muted-foreground">
              {error ?? '프로필을 찾을 수 없어요.'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
