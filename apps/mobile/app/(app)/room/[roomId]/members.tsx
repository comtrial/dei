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
import { analytics } from '@dei/shared';

import { getMemberProfile } from '@/lib/room-rpc';
import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';

type DialogKind = 'left' | 'error' | null;

export default function MemberProfileScreen() {
  const router = useRouter();
  const { userId, roomId } = useLocalSearchParams<{ userId: string; roomId?: string }>();

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [profile, setProfile] = useState<{
    nickname: string | null;
    gender: string | null;
    birth_year: number | null;
    region: string | null;
    photo_url: string | null;
    bio: string | null;
  } | null>(null);

  useEffect(() => {
    if (!userId) {
      router.back();
      return;
    }

    let cancelled = false;

    getMemberProfile(userId, roomId ?? '').then((result) => {
      if (cancelled) return;

      if (!result) {
        setDialog('error');
        return;
      }

      if (result.memberStatus === 'left' || result.memberStatus === 'auto_kicked') {
        setDialog('left');
        return;
      }

      setProfile(result.profile);
    });

    return () => {
      cancelled = true;
    };
  }, [userId, roomId, router]);

  function handleMore() {
    analytics.capture(ANALYTICS_EVENTS.room_overflow_menu_opened, {
      roomId: roomId ?? '',
      targetUserId: userId,
    });
    router.push(
      `/(app)/report/block-report?targetId=${userId}&roomId=${roomId ?? ''}` as never,
    );
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

  const nickname = profile?.nickname ?? '';

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
        <ProfileHero
          size="xl"
          name={nickname}
          meta={meta}
          initial={nickname ? nickname[0] : undefined}
        >
          {profile?.photo_url ? (
            <Image
              source={{ uri: profile.photo_url }}
              className="w-[120px] h-[120px] rounded-full"
              accessibilityLabel={`${nickname} 프로필 사진`}
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

        {profile?.region ? (
          <Card variant="info-rows" className="w-full">
            <View className="flex-row items-center justify-between px-[16px] py-[14px]">
              <Text variant="caption" tone="ink-3">
                지역
              </Text>
              <Text variant="body" tone="ink">
                {profile.region}
              </Text>
            </View>
          </Card>
        ) : null}
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
