import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  AlertDialog,
  Badge,
  BottomActionBar,
  Button,
  GridRoom,
  Text,
  TopNav,
} from '@dei/ui';
import type { GridRoomCell } from '@dei/ui';
import type { Database } from '@dei/api';
import { POLICY, analytics, logger } from '@dei/shared';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { getPermissionState } from '@/lib/permissions';
import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/lib/supabase';

type ProfileRow = Database['public']['Tables']['profile']['Row'];
type RoomMemberRow = Database['public']['Tables']['room_member']['Row'];

interface MemberWithProfile {
  member: RoomMemberRow;
  profile: Pick<ProfileRow, 'user_id' | 'nickname'> | null;
}

async function fetchMyRecentVideoCount(
  roomId: string,
  userId: string,
): Promise<{ count: number; lastCreatedAt: string | null }> {
  const windowMs = POLICY.blurGate.visibilityWindowHours * 60 * 60 * 1000;
  const since = new Date(Date.now() - windowMs).toISOString();

  const { data, error } = await supabase
    .from('video')
    .select('id, created_at')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .eq('status', 'ready')
    .gte('created_at', since)
    .limit(1);

  if (error) throw error;

  const { data: lastData } = await supabase
    .from('video')
    .select('created_at')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(1);

  return {
    count: data?.length ?? 0,
    lastCreatedAt: lastData?.[0]?.created_at ?? null,
  };
}

async function fetchMembersWithProfiles(
  roomId: string,
): Promise<MemberWithProfile[]> {
  const { data: members, error: memberError } = await supabase
    .from('room_member')
    .select('*')
    .eq('room_id', roomId)
    .eq('status', 'active');

  if (memberError) throw memberError;
  if (!members || members.length === 0) return [];

  const memberIds = members.map((m) => m.user_id);

  const { data: profiles, error: profileError } = await supabase
    .from('profile')
    .select('user_id, nickname')
    .in('user_id', memberIds);

  if (profileError) throw profileError;

  const profileMap = new Map<string, Pick<ProfileRow, 'user_id' | 'nickname'>>();
  for (const p of profiles ?? []) {
    profileMap.set(p.user_id, p);
  }

  return (members as RoomMemberRow[]).map((member) => ({
    member,
    profile: profileMap.get(member.user_id) ?? null,
  }));
}

function getMemberDisplayName(m: MemberWithProfile): string {
  return m.profile?.nickname ?? m.member.user_id.slice(0, 6);
}

function buildBlurCells(members: MemberWithProfile[]): GridRoomCell[] {
  return members.map((m): GridRoomCell => ({
    kind: undefined,
    name: getMemberDisplayName(m),
    uploadTime: '',
    media: (
      <View className="absolute inset-0 items-center justify-center bg-bg-2">
        <View className="absolute inset-0 items-center justify-center">
          <Badge variant="lock">🔒 잠김</Badge>
        </View>
      </View>
    ),
  }));
}

export default function RoomPreviewScreen() {
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { user } = useAuth();

  const [isGateChecking, setIsGateChecking] = useState(true);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [fetchError, setFetchError] = useState(false);
  const [isFirstEntry, setIsFirstEntry] = useState(true);

  useEffect(() => {
    if (!user?.id || !roomId) return;

    const checkGate = async () => {
      try {
        const { count, lastCreatedAt } = await fetchMyRecentVideoCount(
          roomId,
          user.id,
        );

        if (count >= 1) {
          router.replace(`/(app)/room/${roomId}`);
          return;
        }

        const has24hExpired = lastCreatedAt !== null;
        setIsFirstEntry(!has24hExpired);

        analytics.capture(ANALYTICS_EVENTS.room_preview_entered_blurred, {
          room_id: roomId,
        });

        if (has24hExpired) {
          analytics.capture(ANALYTICS_EVENTS.blur_reapplied_24h_passed, {
            room_id: roomId,
          });
        }
      } catch (err) {
        logger.captureException(err, {
          tags: { feature: 'blur_gate', action: 'check_gate' },
          extra: { room_id: roomId, user_id: user.id },
        });
      } finally {
        setIsGateChecking(false);
      }
    };

    void checkGate();
  }, [roomId, user?.id, router]);

  useEffect(() => {
    if (!roomId || isGateChecking) return;

    const loadMembers = async () => {
      try {
        const result = await fetchMembersWithProfiles(roomId);
        setMembers(result);
      } catch (err) {
        logger.captureException(err, {
          tags: { feature: 'blur_preview', action: 'fetch_members' },
          extra: { room_id: roomId },
        });
        setFetchError(true);
      }
    };

    void loadMembers();
  }, [roomId, isGateChecking]);

  const handleCtaPress = useCallback(async () => {
    try {
      const state = await getPermissionState('camera');
      if (state === 'granted') {
        router.push(`/(app)/room/${roomId}/upload`);
      } else {
        router.push('/(app)/permission/camera');
      }
    } catch (err) {
      logger.captureException(err, {
        tags: { feature: 'blur_preview', action: 'cta_press' },
      });
    }
  }, [roomId, router]);

  const handleRetryFetch = useCallback(async () => {
    setFetchError(false);
    try {
      const result = await fetchMembersWithProfiles(roomId);
      setMembers(result);
    } catch (err) {
      logger.captureException(err, {
        tags: { feature: 'blur_preview', action: 'retry_fetch_members' },
        extra: { room_id: roomId },
      });
      setFetchError(true);
    }
  }, [roomId]);

  if (isGateChecking) {
    return <SafeAreaView className="flex-1 bg-bg" />;
  }

  const memberCount = members.length;
  const welcomeHeading = isFirstEntry
    ? `${memberCount}명과 새 방에 모였어요! 🎉`
    : '오랜만이에요! 영상 한 번 올려주세요';

  const cells = buildBlurCells(members);

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <TopNav
        left="none"
        title="잠긴 방 미리보기"
        rightActions={<Badge variant="lock">🔒 잠금</Badge>}
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-[120px]"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-[16px] pt-[20px] pb-[12px] gap-[6px]">
          <Text variant="h1" tone="ink" className="text-center">
            {welcomeHeading}
          </Text>
          <Text variant="caption" tone="ink-3" className="text-center">
            3초 영상으로 인사하면 친구들 하루도 보여요
          </Text>
        </View>

        {cells.length > 0 ? (
          <GridRoom cells={cells} className="mt-[8px]" />
        ) : null}
      </ScrollView>

      <BottomActionBar borderTop fixed>
        <Button
          variant="ink"
          fullWidth
          testID="blur-preview-cta"
          onPress={handleCtaPress}
        >
          내 영상 올리고 잠금해제
        </Button>
      </BottomActionBar>

      <AlertDialog
        visible={fetchError}
        tone="warn"
        size="mini"
        eyebrow="네트워크 오류"
        title="멤버 정보를 불러오지 못했어요"
        description="잠시 후 다시 시도해주세요"
        actions={[
          {
            label: '다시 시도',
            variant: 'ink',
            testID: 'blur-preview-retry',
            onPress: handleRetryFetch,
          },
        ]}
      />
    </SafeAreaView>
  );
}
