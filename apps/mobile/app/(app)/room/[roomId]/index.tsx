import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient, type LinearGradientProps } from 'expo-linear-gradient';
import { MessageCircle, MoreHorizontal, Play } from 'lucide-react-native';

import { Banner, GridRoom, IconButton, Badge, TopNav } from '@dei/ui';
import type { GridRoomCell, GridRoomFilledCell, GridRoomTimeSlot, GradientComponentProps } from '@dei/ui';
import type { Database } from '@dei/api';
import { POLICY, analytics, formatTimeStripSlots, isQuietHourKst } from '@dei/shared';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { useAuth } from '@/providers/auth-provider';
import { useRoomVideos } from '@/hooks/useRoomVideos';
import { useRoomMembers } from '@/hooks/useRoomMembers';
import { useRoomPresence } from '@/hooks/useRoomPresence';
import { useHourSlot } from '@/hooks/useHourSlot';
import { useAppStateRefetch } from '@/hooks/useAppStateRefetch';
import { useRoomEndedDetector } from '@/hooks/useRoomEndedDetector';
import {
  getSelfVideoCount24h,
  getRoomMembersWithProfile,
  getBlockedUserIds,
  type RoomMemberWithProfile,
} from '@/lib/room-rpc';

type VideoRow = Database['public']['Tables']['video']['Row'];

function GradientWrapper({ colors, start, end, className }: GradientComponentProps) {
  return (
    <LinearGradient
      colors={colors as LinearGradientProps['colors']}
      start={start}
      end={end}
      className={className}
    />
  );
}

function buildCells(
  members: RoomMemberWithProfile[],
  videosByHour: Record<number, VideoRow[]>,
  currentHour: number,
  onlineUserIds: Set<string>,
  selfGender: string | null,
  blockedUserIds: Set<string>,
): GridRoomCell[] {
  const hourVideos = videosByHour[currentHour] ?? [];
  const videoByUser = new Map<string, VideoRow>();
  for (const v of hourVideos) {
    if (!videoByUser.has(v.user_id)) videoByUser.set(v.user_id, v);
  }

  const sameGender = selfGender
    ? members.filter((m) => m.profile?.gender === selfGender)
    : members;
  const otherGender = selfGender
    ? members.filter((m) => m.profile?.gender !== selfGender)
    : [];

  const ordered: RoomMemberWithProfile[] = [];
  const maxLen = Math.max(sameGender.length, otherGender.length);
  for (let i = 0; i < maxLen; i++) {
    if (sameGender[i]) ordered.push(sameGender[i]);
    if (otherGender[i]) ordered.push(otherGender[i]);
  }

  const source = selfGender ? ordered : members;

  return source.map((member): GridRoomCell => {
    if (blockedUserIds.has(member.user_id)) {
      return { kind: 'empty', name: member.profile?.nickname ?? member.user_id.slice(0, 6) };
    }

    const video = videoByUser.get(member.user_id);
    const displayName = member.profile?.nickname ?? member.user_id.slice(0, 6);

    if (!video || video.status === 'failed' || video.status === 'archived') {
      return { kind: 'empty', name: displayName };
    }

    const uploadHour = video.created_at
      ? new Date(video.created_at).toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : '--:--';

    return {
      kind: undefined,
      name: displayName,
      uploadTime: uploadHour,
      videoId: video.id,
      present: onlineUserIds.has(member.user_id),
      media: video.thumbnail_path ? (
        <View className="absolute inset-0">
          <Image
            source={{ uri: video.thumbnail_path }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={250}
            className="absolute inset-0"
          />
          <View className="absolute top-[8px] right-[8px]">
            <Play color="white" size={14} />
          </View>
        </View>
      ) : undefined,
    };
  });
}

export default function RoomScreen() {
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { user } = useAuth();

  const [gateChecked, setGateChecked] = useState(false);
  const [selfGender, setSelfGender] = useState<string | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [membersWithProfile, setMembersWithProfile] = useState<RoomMemberWithProfile[]>([]);
  const [memberLeftMsg, setMemberLeftMsg] = useState<string | null>(null);
  const memberLeftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showExpiryBanner, setShowExpiryBanner] = useState(false);
  const expiryCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { currentHour, setCurrentHour } = useHourSlot();
  const hourRange = POLICY.gridPerformance.prefetchHourRange;

  const { videosByHour, loading: videosLoading, refetch: refetchVideos } = useRoomVideos(
    roomId,
    currentHour,
    hourRange,
  );
  const { members, refetch: refetchMembers } = useRoomMembers(roomId, {
    onMemberLeft: (userId, status) => {
      const found = membersWithProfile.find((m) => m.user_id === userId);
      const name = found?.profile?.nickname ?? userId.slice(0, 6);
      const reason = status === 'auto_kicked' ? '자동 퇴장' : '나갔어요';
      setMemberLeftMsg(`${name}님이 ${reason}`);
      if (memberLeftTimerRef.current) clearTimeout(memberLeftTimerRef.current);
      memberLeftTimerRef.current = setTimeout(() => setMemberLeftMsg(null), 3000);
    },
  });
  const { onlineUserIds } = useRoomPresence(roomId, { selfUserId: user?.id ?? null });

  useRoomEndedDetector(roomId, members, {
    selfUserId: user?.id ?? '',
    onRoomEnded: () => {
      router.replace('/');
    },
  });

  useAppStateRefetch(() => {
    refetchVideos();
    refetchMembers();
  });

  useEffect(() => {
    if (!user?.id || !roomId) return;
    void (async () => {
      const count = await getSelfVideoCount24h(roomId, user.id);
      if (count === 0) {
        analytics.capture(ANALYTICS_EVENTS.blur_reapplied_24h_passed, { room_id: roomId });
        router.replace(`/(app)/room/${roomId}/preview`);
        return;
      }
      analytics.capture(ANALYTICS_EVENTS.room_joined_unblurred, { room_id: roomId });
      setGateChecked(true);
    })();
  }, [roomId, user?.id]);

  useEffect(() => {
    if (!user?.id || !roomId) return;
    void (async () => {
      const [withProfile, blocked] = await Promise.all([
        getRoomMembersWithProfile(roomId),
        getBlockedUserIds(user.id),
      ]);
      setMembersWithProfile(withProfile);
      setBlockedUserIds(blocked);
      const self = withProfile.find((m) => m.user_id === user.id);
      setSelfGender(self?.profile?.gender ?? null);
    })();
  }, [roomId, user?.id, members]);

  useEffect(() => {
    if (!user?.id || !roomId) return;

    const checkExpiry = async () => {
      const windowHours = POLICY.blurGate.visibilityWindowHours;
      const warnThresholdMs = (windowHours - 1) * 60 * 60 * 1000;
      const windowMs = windowHours * 60 * 60 * 1000;
      const hourVideos = videosByHour[currentHour] ?? [];
      const selfVideos = hourVideos.filter((v) => v.user_id === user.id);
      if (selfVideos.length === 0) return;
      const latest = selfVideos.reduce((a, b) =>
        new Date(a.created_at ?? 0) > new Date(b.created_at ?? 0) ? a : b,
      );
      if (!latest.created_at) return;
      const age = Date.now() - new Date(latest.created_at).getTime();
      setShowExpiryBanner(age >= warnThresholdMs && age < windowMs);
    };

    void checkExpiry();
    expiryCheckRef.current = setInterval(() => void checkExpiry(), 60 * 60 * 1000);
    return () => {
      if (expiryCheckRef.current) clearInterval(expiryCheckRef.current);
    };
  }, [roomId, user?.id, videosByHour, currentHour]);

  useEffect(() => {
    return () => {
      if (memberLeftTimerRef.current) clearTimeout(memberLeftTimerRef.current);
    };
  }, []);

  const cells = useMemo(
    () => buildCells(membersWithProfile, videosByHour, currentHour, onlineUserIds, selfGender, blockedUserIds),
    [membersWithProfile, videosByHour, currentHour, onlineUserIds, selfGender, blockedUserIds],
  );

  const timeStrip = useMemo<GridRoomTimeSlot[]>(() => {
    return formatTimeStripSlots(currentHour, hourRange).map((s) => ({
      label: s.isQuiet ? `${s.label} zzz` : s.label,
      isNow: s.isNow,
    }));
  }, [currentHour, hourRange]);

  const firstRenderRef = useRef(false);
  const renderStartRef = useRef(Date.now());

  useEffect(() => {
    if (!videosLoading && !firstRenderRef.current) {
      firstRenderRef.current = true;
      const latencyMs = Date.now() - renderStartRef.current;
      analytics.capture(ANALYTICS_EVENTS.room_grid_first_render, {
        room_id: roomId,
        video_count: cells.filter((c) => c.kind !== 'empty').length,
        latency_ms: latencyMs,
      });
    }
  }, [videosLoading, cells, roomId]);

  const prevHourRef = useRef(currentHour);

  const slots = useMemo(
    () => formatTimeStripSlots(currentHour, hourRange),
    [currentHour, hourRange],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchVideos(), refetchMembers()]);
    setRefreshing(false);
  }, [refetchVideos, refetchMembers]);

  if (!gateChecked) {
    return (
      <SafeAreaView className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav
        left="none"
        title="dei"
        rightActions={
          <>
            <View>
              <IconButton
                glyph={MessageCircle}
                variant="ghost"
                size={32}
                accessibilityLabel="채팅"
                onPress={() => {
                  analytics.capture(ANALYTICS_EVENTS.room_chat_opened, { room_id: roomId });
                  router.push(`/room/${roomId}/chat`);
                }}
              />
              <View className="absolute top-[2px] right-[2px]">
                <Badge variant="dot" />
              </View>
            </View>
            <IconButton
              glyph={MoreHorizontal}
              variant="ghost"
              size={32}
              accessibilityLabel="더보기"
              onPress={() => {
                analytics.capture(ANALYTICS_EVENTS.leave_room_menu_opened, { room_id: roomId });
                router.push(`/room/${roomId}/leave-confirm`);
              }}
            />
          </>
        }
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-8"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
        }
      >
        {showExpiryBanner ? (
          <View className="px-4 pt-3">
            <Banner tone="warn" icon="⏰">
              곧 영상이 잠겨요
            </Banner>
          </View>
        ) : null}
        {memberLeftMsg ? (
          <View className="px-4 pt-3">
            <Banner tone="info">{memberLeftMsg}</Banner>
          </View>
        ) : null}
        {videosLoading ? (
          <View className="flex-1 items-center justify-center py-16">
            <ActivityIndicator />
          </View>
        ) : (
          <GridRoom
            cells={cells}
            timeStrip={timeStrip}
            timeHint="시간대를 밀어서 회상"
            GradientComponent={GradientWrapper}
            onCellPress={(cell) => {
              if (cell.kind === 'empty') return;
              const videoId = (cell as GridRoomFilledCell).videoId;
              if (!videoId) return;
              router.push(`/room/${roomId}/video/${videoId}`);
            }}
            onAvatarPress={(cell) => {
              const found = membersWithProfile.find((m) => m.profile?.nickname === cell.name || m.user_id.slice(0, 6) === cell.name);
              if (!found) return;
              router.push(`/room/${roomId}/members?userId=${found.user_id}`);
            }}
            onTimeSlotPress={(slotIndex) => {
              const slot = slots[slotIndex];
              if (!slot) return;
              if (isQuietHourKst(slot.hour)) return;
              const fromHour = prevHourRef.current;
              const cacheHit = slot.hour in videosByHour;
              analytics.capture(ANALYTICS_EVENTS.room_timestrip_swipe, {
                from_hour: fromHour,
                to_hour: slot.hour,
                cache_hit: cacheHit,
              });
              prevHourRef.current = slot.hour;
              setCurrentHour(slot.hour);
            }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
