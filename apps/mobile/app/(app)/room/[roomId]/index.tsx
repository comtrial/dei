import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient, type LinearGradientProps } from 'expo-linear-gradient';

import { GridRoom, Text } from '@dei/ui';
import type { GridRoomCell, GridRoomTimeSlot, GradientComponentProps } from '@dei/ui';
import type { Database } from '@dei/api';
import { POLICY, analytics, formatTimeStripSlots, isQuietHourKst } from '@dei/shared';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { useAuth } from '@/providers/auth-provider';
import { useRoomVideos } from '@/hooks/useRoomVideos';
import { useRoomMembers } from '@/hooks/useRoomMembers';
import { useRoomPresence } from '@/hooks/useRoomPresence';
import { useHourSlot } from '@/hooks/useHourSlot';
import { useAppStateRefetch } from '@/hooks/useAppStateRefetch';

type RoomMemberRow = Database['public']['Tables']['room_member']['Row'];
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
  members: RoomMemberRow[],
  videosByHour: Record<number, VideoRow[]>,
  currentHour: number,
  onlineUserIds: Set<string>,
): GridRoomCell[] {
  const hourVideos = videosByHour[currentHour] ?? [];
  const videoByUser = new Map<string, VideoRow>();
  for (const v of hourVideos) {
    if (!videoByUser.has(v.user_id)) videoByUser.set(v.user_id, v);
  }

  return members.map((member): GridRoomCell => {
    const video = videoByUser.get(member.user_id);
    if (!video || video.status === 'failed' || video.status === 'archived') {
      return { kind: 'empty', name: member.user_id.slice(0, 6) };
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
      name: member.user_id.slice(0, 6),
      uploadTime: uploadHour,
      videoId: video.id,
      present: onlineUserIds.has(member.user_id),
      media:
        video.thumbnail_path ? (
          <Image
            source={{ uri: video.thumbnail_path }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={250}
            className="absolute inset-0"
          />
        ) : undefined,
    };
  });
}

export default function RoomScreen() {
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { user } = useAuth();

  const { currentHour, setCurrentHour } = useHourSlot();
  const hourRange = POLICY.gridPerformance.prefetchHourRange;

  const { videosByHour, loading: videosLoading, refetch: refetchVideos } = useRoomVideos(
    roomId,
    currentHour,
    hourRange,
  );
  const { members, refetch: refetchMembers } = useRoomMembers(roomId);
  const { onlineUserIds } = useRoomPresence(roomId, { selfUserId: user?.id ?? null });

  useAppStateRefetch(() => {
    refetchVideos();
    refetchMembers();
  });

  const cells = useMemo(
    () => buildCells(members, videosByHour, currentHour, onlineUserIds),
    [members, videosByHour, currentHour, onlineUserIds],
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

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView className="flex-1" contentContainerClassName="pb-8">
        <Text variant="h2" className="px-4 py-3">
          일상 공유 방
        </Text>
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
              const videoId = (cell as { videoId?: string }).videoId;
              if (!videoId) return;
              router.push(`/room/${roomId}/video/${videoId}`);
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
