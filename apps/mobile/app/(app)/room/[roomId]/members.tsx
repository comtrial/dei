import { useEffect, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MoreHorizontal } from 'lucide-react-native';

import {
  AlertDialog,
  Card,
  IconButton,
  ProfileHero,
  Text,
  TopNav,
} from '@dei/ui';
import { analytics, logger } from '@dei/shared';

import { getMemberProfile } from '@/lib/room-rpc';
import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import {
  getCachedProfilePhotoUrl,
  resolveProfilePhotoUrl,
} from '@/lib/profile-photo-cache';
import { getCachedRoomChatMembers } from '@/lib/chat/member-cache';

type DialogKind = 'left' | 'error' | null;

export default function MemberProfileScreen() {
  const router = useRouter();
  const { roomId, targetAvatarUrl, targetNickname, userId } = useLocalSearchParams<{
    roomId?: string;
    targetAvatarUrl?: string;
    targetNickname?: string;
    userId: string;
  }>();
  const initialNickname = Array.isArray(targetNickname) ? targetNickname[0] : targetNickname;
  const initialAvatarUrl = Array.isArray(targetAvatarUrl) ? targetAvatarUrl[0] : targetAvatarUrl;
  const cachedMember =
    roomId && userId
      ? getCachedRoomChatMembers(roomId).find((member) => member.userId === userId)
      : undefined;
  const cachedProfile = cachedMember?.profile;
  const cachedAvatarUrl = cachedProfile?.avatar_url ?? cachedMember?.photoUrl ?? initialAvatarUrl;
  const cachedNickname = cachedProfile?.nickname ?? cachedMember?.name ?? initialNickname;

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [profile, setProfile] = useState<{
    nickname: string | null;
    gender: string | null;
    birth_year: number | null;
    region: string | null;
    photo_url: string | null;
    avatar_url?: string | null;
    bio: string | null;
    mbti: string | null;
  } | null>(() =>
    cachedProfile
      ? cachedProfile
      : cachedNickname
      ? {
          avatar_url: cachedAvatarUrl ?? null,
          bio: null,
          birth_year: null,
          gender: null,
          mbti: null,
          nickname: cachedNickname,
          photo_url: null,
          region: null,
        }
      : null,
  );
  const [isLoading, setIsLoading] = useState(!cachedNickname);
  const [photoDisplayUrl, setPhotoDisplayUrl] = useState<string | null>(cachedAvatarUrl ?? null);
  const [photoImageFailed, setPhotoImageFailed] = useState(false);

  useEffect(() => {
    if (!userId) {
      router.back();
      return;
    }

    let cancelled = false;
    if (!cachedNickname) setIsLoading(true);

    getMemberProfile(userId, roomId ?? '').then((result) => {
      if (cancelled) return;
      setIsLoading(false);

      if (!result) {
        if (!cachedNickname) setDialog('error');
        return;
      }

      if (result.memberStatus === 'left' || result.memberStatus === 'auto_kicked') {
        setDialog('left');
        return;
      }

      if (!result.profile) {
        setDialog('error');
        return;
      }

      setPhotoImageFailed(false);
      setPhotoDisplayUrl(
        result.profile.avatar_url ?? getCachedProfilePhotoUrl(userId, result.profile.photo_url),
      );
      setProfile(result.profile);
    });

    return () => {
      cancelled = true;
    };
  }, [cachedNickname, roomId, router, userId]);

  useEffect(() => {
    let cancelled = false;
    const photoPath = profile?.photo_url ?? null;
    const avatarUrl = profile?.avatar_url ?? null;

    if (!userId) {
      return () => {
        cancelled = true;
      };
    }

    if (avatarUrl) {
      setPhotoDisplayUrl(avatarUrl);
      setPhotoImageFailed(false);
      return () => {
        cancelled = true;
      };
    }

    setPhotoDisplayUrl(getCachedProfilePhotoUrl(userId, photoPath));
    setPhotoImageFailed(false);

    if (!photoPath) {
      return () => {
        cancelled = true;
      };
    }

    void logger.withErrorCapture(
      'room.member-profile.signed-photo',
      async () => {
        const photoUrl = await resolveProfilePhotoUrl(
          { path: photoPath, userId },
          { screen: 'member-profile', roomId },
        );

        if (!cancelled) {
          setPhotoDisplayUrl(photoUrl);
        }
      },
      { tags: { screen: 'member-profile', action: 'signed-photo' } },
    ).catch(() => {
      if (!cancelled) {
        setPhotoDisplayUrl(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [profile?.avatar_url, profile?.photo_url, roomId, userId]);

  function handleMore() {
    analytics.capture(ANALYTICS_EVENTS.room_overflow_menu_opened, {
      roomId: roomId ?? '',
      targetUserId: userId,
    });
    const targetAvatarUrl = !photoImageFailed
      ? photoDisplayUrl ?? profile?.avatar_url ?? undefined
      : undefined;
    router.push({
      pathname: '/(app)/report/block-report',
      params: {
        roomId: roomId ?? '',
        targetId: userId,
        targetNickname: nickname,
        ...(targetAvatarUrl ? { targetAvatarUrl } : {}),
      },
    } as never);
  }

  const age =
    profile?.birth_year != null
      ? new Date().getFullYear() - profile.birth_year
      : null;

  const genderLabel =
    profile?.gender === 'male'
      ? '남성'
      : profile?.gender === 'female'
        ? '여성'
        : null;

  const metaParts: string[] = [];
  if (age != null) metaParts.push(`${age}세`);
  if (genderLabel) metaParts.push(genderLabel);
  const meta = metaParts.length > 0 ? metaParts.join(' · ') : undefined;

  const nickname = profile?.nickname?.trim() || '이름 없음';
  const hasDetail = Boolean(profile?.bio || profile?.region || profile?.mbti);

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav
        left="back"
        onLeftPress={() => router.back()}
        rightActions={
          <IconButton
            glyph={MoreHorizontal}
            accessibilityLabel="더보기"
            onPress={handleMore}
          />
        }
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="items-center px-[24px] pt-[32px] pb-[40px] gap-[16px]"
      >
        {isLoading ? (
          <Text className="py-[32px] text-[13px] font-semibold text-ink-3">
            프로필을 불러오고 있어요.
          </Text>
        ) : (
          <>
            <ProfileHero
              size="xl"
              name={nickname}
              meta={meta}
              initial={nickname ? nickname[0] : undefined}
            >
              {photoDisplayUrl && !photoImageFailed ? (
                <Image
                  testID="member-profile-photo"
                  source={{ uri: photoDisplayUrl }}
                  className="w-[120px] h-[120px] rounded-full"
                  accessibilityLabel={`${nickname} 프로필 사진`}
                  onError={() => setPhotoImageFailed(true)}
                />
              ) : undefined}
            </ProfileHero>

            {profile?.bio ? (
              <Card className="w-full bg-bg-2 px-[16px] py-[14px]">
                <Text variant="body" tone="ink">
                  {profile.bio}
                </Text>
              </Card>
            ) : null}

            {profile?.region || profile?.mbti ? (
              <Card variant="info-rows" className="w-full">
                {profile?.region ? (
                  <View className="flex-row items-center justify-between px-[16px] py-[14px]">
                    <Text variant="caption" tone="ink-3">
                      지역
                    </Text>
                    <Text variant="body" tone="ink">
                      {profile.region}
                    </Text>
                  </View>
                ) : null}
                {profile?.mbti ? (
                  <View className="flex-row items-center justify-between px-[16px] py-[14px]">
                    <Text variant="caption" tone="ink-3">
                      MBTI
                    </Text>
                    <Text variant="body" tone="ink">
                      {profile.mbti}
                    </Text>
                  </View>
                ) : null}
              </Card>
            ) : null}

            {!hasDetail ? (
              <Card className="w-full bg-bg-2 px-[16px] py-[14px]">
                <Text className="text-center text-[13px] font-semibold text-ink-3">
                  아직 공개한 상세 정보가 없어요.
                </Text>
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>

      <AlertDialog
        visible={dialog === 'left'}
        tone="warn"
        title="방을 나간 친구예요"
        description="이 멤버는 방을 나갔어요."
        actions={[
          {
            label: '확인',
            variant: 'ink',
            testID: 'member-left-confirm',
            onPress: () => {
              setDialog(null);
              router.back();
            },
          },
        ]}
      />

      <AlertDialog
        visible={dialog === 'error'}
        tone="danger"
        title="프로필 정보를 가져오지 못했어요"
        actions={[
          {
            label: '다시 시도',
            variant: 'ink',
            testID: 'member-error-retry',
            onPress: () => {
              setDialog(null);
            },
          },
          {
            label: '닫기',
            variant: 'secondary',
            testID: 'member-error-close',
            onPress: () => {
              setDialog(null);
              router.back();
            },
          },
        ]}
      />
    </SafeAreaView>
  );
}
