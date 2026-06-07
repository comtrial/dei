import { useCallback, useEffect, useMemo, useRef, useState, type ElementRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient, type LinearGradientProps } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Calendar as CalendarIcon, MessageCircle, MoreHorizontal } from 'lucide-react-native';

import { avatarColorFor, Banner, GridRoom, IconButton, Badge, Text, TopNav } from '@dei/ui';
import type { GridRoomCell, GridRoomFilledCell, GradientComponentProps } from '@dei/ui';
import type { Database } from '@dei/api';
import { POLICY, analytics, getCurrentHourSlotKst, hourSlotLabel, logger } from '@dei/shared';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { getCachedVideoUri, getCachedThumbnailUri } from '@/lib/video';
import { useAuth } from '@/providers/auth-provider';
import { useRoomVideos } from '@/hooks/useRoomVideos';
import { useRoomMembers } from '@/hooks/useRoomMembers';
import { useRoomPresence } from '@/hooks/useRoomPresence';
import { useHourSlot } from '@/hooks/useHourSlot';
import { useAppStateRefetch } from '@/hooks/useAppStateRefetch';
import { useRoomEndedDetector } from '@/hooks/useRoomEndedDetector';
import { useRoomUnread } from '@/hooks/useRoomUnread';
import {
  getSelfVideoCount24h,
  getRoomMembersSnapshot,
  type RoomMemberWithProfile,
} from '@/lib/room-rpc';
import { resolveProfilePhotoUrls } from '@/lib/profile-photo-cache';
import { setCachedRoomChatMembers } from '@/lib/chat/member-cache';
import type { RoomMemberLite } from '@/lib/chat/mention';
import { MatchingWaitingView } from '@/components/matching/MatchingWaitingView';
import { CalendarSheet } from '@/components/calendar-sheet';

const ROOM_PREPARE_MIN_MS = 700;
const ROOM_PREPARE_SETTLE_MS = 350;
const ROOM_PREPARE_MAX_MS = 2400;
const TIME_SLOT_WIDTH = 60;
const TIME_SLOT_GAP = 10;
const TIME_SLOT_STEP = TIME_SLOT_WIDTH + TIME_SLOT_GAP;

function clampTimeSlotIndex(index: number, length: number) {
  return Math.max(0, Math.min(length - 1, index));
}

function offsetToTimeSlotIndex(offsetX: number, length: number) {
  return clampTimeSlotIndex(Math.round(offsetX / TIME_SLOT_STEP), length);
}

function getTimeStripTargetOffset(event: NativeSyntheticEvent<NativeScrollEvent>) {
  const native = event.nativeEvent as NativeScrollEvent & {
    targetContentOffset?: { x?: number };
  };
  return native.targetContentOffset?.x ?? native.contentOffset.x;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function CellVideoMedia({
  thumbnailUri,
  videoUri,
}: {
  thumbnailUri?: string | null;
  videoUri?: string | null;
}) {
  const [firstFrameRendered, setFirstFrameRendered] = useState(false);

  useEffect(() => {
    setFirstFrameRendered(false);
  }, [videoUri]);

  const player = useVideoPlayer(
    videoUri ? { uri: videoUri } : null,
    (p) => {
      p.loop = true;
      p.muted = true;
      p.play();
    },
  );

  useFocusEffect(
    useCallback(() => {
      try { player.play(); } catch {}
      return () => {
        try { player.pause(); } catch {}
      };
    }, [player]),
  );

  return (
    <View className="absolute inset-0 bg-ink">
      {thumbnailUri ? (
        <Image
          source={{ uri: thumbnailUri }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={100}
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}
      {videoUri ? (
        <VideoView
          player={player}
          contentFit="cover"
          nativeControls={false}
          style={[StyleSheet.absoluteFillObject, { opacity: firstFrameRendered ? 1 : 0 }]}
          onFirstFrameRender={() => setFirstFrameRendered(true)}
        />
      ) : null}
    </View>
  );
}

type VideoRow = Database['public']['Tables']['video']['Row'];
type CellMediaUri = {
  thumbnailUri: string | null;
  videoUri: string | null;
};

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
  selfUserId: string | null,
  nowHour: number,
  isViewingToday: boolean,
  photoUrlByUser: Map<string, string>,
  mediaUriByVideo: Map<string, CellMediaUri>,
): GridRoomCell[] {
  const hourVideos = videosByHour[currentHour] ?? [];
  const videoByUser = new Map<string, VideoRow>();
  for (const v of hourVideos) {
    if (!videoByUser.has(v.user_id)) videoByUser.set(v.user_id, v);
  }

  const isCurrentSlot = isViewingToday && currentHour === nowHour;

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
    const isSelf = selfUserId !== null && member.user_id === selfUserId;
    const canRecord = isSelf && isCurrentSlot;
    const photoUrl = photoUrlByUser.get(member.user_id);
    if (blockedUserIds.has(member.user_id)) {
      return {
        kind: 'empty',
        name: member.profile?.nickname ?? member.user_id.slice(0, 6),
        isSelf,
        userId: member.user_id,
        canRecord,
      };
    }

    const video = videoByUser.get(member.user_id);
    const displayName = member.profile?.nickname ?? member.user_id.slice(0, 6);

    if (!video || video.status === 'failed' || video.status === 'archived') {
      return {
        kind: 'empty',
        name: displayName,
        isSelf,
        userId: member.user_id,
        photoUrl,
        canRecord,
      };
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
      userId: member.user_id,
      uploadTime: uploadHour,
      videoId: video.id,
      present: onlineUserIds.has(member.user_id),
      photoUrl,
      media: video.storage_path ? (
        <CellVideoMedia
          thumbnailUri={mediaUriByVideo.get(video.id)?.thumbnailUri}
          videoUri={mediaUriByVideo.get(video.id)?.videoUri}
        />
      ) : undefined,
    };
  });
}

function buildChatMembers(
  members: RoomMemberWithProfile[],
  photoUrlByUser: Map<string, string>,
): RoomMemberLite[] {
  return members.map((member) => {
    const name = member.profile?.nickname ?? '익명';
    return {
      userId: member.user_id,
      status: (member.status as RoomMemberLite['status']) ?? 'active',
      name,
      avatarInitial: name[0],
      avatarBg: avatarColorFor(member.user_id),
      photoUrl: photoUrlByUser.get(member.user_id) ?? member.profile?.avatar_url ?? undefined,
      profile: member.profile
        ? {
            ...member.profile,
            avatar_url: photoUrlByUser.get(member.user_id) ?? member.profile.avatar_url ?? null,
          }
        : undefined,
    };
  });
}

function RoomPreparingScreen() {
  return (
    <MatchingWaitingView
      cardLabel="방 준비"
      cardValue="확인 중"
      description={`친구들의 사진과 영상을\n불러오는 중이에요.`}
      testID="room-preparing-screen"
      title="방을 준비하고 있어요"
    />
  );
}

export default function RoomScreen() {
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { user } = useAuth();
  const { width: windowWidth } = useWindowDimensions();

  // 매칭된 방 회원은 어떤 경로로도 홈(매칭 전)으로 못 나간다. Android 하드웨어
  // 백버튼을 삼킨다(iOS 스와이프는 (app)/_layout 의 gestureEnabled:false). 방
  // 이탈은 "방 나가기" 정식 플로우(S16)로만.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, []),
  );

  const [gateChecked, setGateChecked] = useState(false);
  const [selfGender, setSelfGender] = useState<string | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [membersWithProfile, setMembersWithProfile] = useState<RoomMemberWithProfile[]>([]);
  const [membersHydrated, setMembersHydrated] = useState(false);
  const [photoUrlByUser, setPhotoUrlByUser] = useState<Map<string, string>>(new Map());
  const [mediaUriByVideo, setMediaUriByVideo] = useState<Map<string, CellMediaUri>>(new Map());
  const [mediaPrepared, setMediaPrepared] = useState(false);
  const [prepareMinElapsed, setPrepareMinElapsed] = useState(false);
  const [prepareMaxElapsed, setPrepareMaxElapsed] = useState(false);
  const [prepareSettled, setPrepareSettled] = useState(false);
  const [memberLeftMsg, setMemberLeftMsg] = useState<string | null>(null);
  const memberLeftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showExpiryBanner, setShowExpiryBanner] = useState(false);
  const expiryCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { currentHour, setCurrentHour } = useHourSlot();
  const hourRange = POLICY.gridPerformance.prefetchHourRange;
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarMinDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - POLICY.room.autoExpireDays);
    return d;
  }, []);

  const { videosByHour, loading: videosLoading, refetch: refetchVideos } = useRoomVideos(
    roomId,
    currentHour,
    hourRange,
    selectedDate,
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
  const { hasUnread } = useRoomUnread(roomId, user?.id ?? null);

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
    setPrepareMinElapsed(false);
    setPrepareMaxElapsed(false);
    setPrepareSettled(false);
    setMediaPrepared(false);
    setMediaUriByVideo(new Map());

    const minTimer = setTimeout(() => setPrepareMinElapsed(true), ROOM_PREPARE_MIN_MS);
    const maxTimer = setTimeout(() => setPrepareMaxElapsed(true), ROOM_PREPARE_MAX_MS);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
  }, [roomId]);

  useEffect(() => {
    if (!user?.id || !roomId) return;
    const uid = user.id;
    // blur 게이트 비동기 경계 — 내부 RPC(getSelfVideoCount24h)는 자체 캡처하므로
    // 여기서는 미캐치 경계만 보호한다(이중 캡처 금지). withErrorCapture 재던짐 →
    // void IIFE 라 trailing .catch 필수.
    void logger
      .withErrorCapture(
        'room.blur-gate',
        async () => {
          const count = await getSelfVideoCount24h(roomId, uid);
          if (count === 0) {
            analytics.capture(ANALYTICS_EVENTS.blur_reapplied_24h_passed, { room_id: roomId });
            router.replace(`/(app)/room/${roomId}/preview`);
            return;
          }
          analytics.capture(ANALYTICS_EVENTS.room_joined_unblurred, { room_id: roomId });
          setGateChecked(true);
        },
        { tags: { screen: 'room', room_id: roomId }, extra: { user_id: uid } },
      )
      .catch(() => {});
  }, [roomId, user?.id, router]);

  useEffect(() => {
    if (!user?.id || !roomId) return;
    const uid = user.id;
    let cancelled = false;
    // 멤버 로드 비동기 경계 — 내부 RPC 들은 자체 캡처. 경계만 보호(이중 캡처 금지).
    void logger
      .withErrorCapture(
        'room.load-members',
        async () => {
          const { members: withProfile, blockedUserIds: blocked } =
            await getRoomMembersSnapshot(roomId, uid);
          const avatarByUser = new Map(
            withProfile
              .filter((m) => m.profile?.avatar_url)
              .map((m) => [m.user_id, m.profile!.avatar_url as string]),
          );
          const signedByUser = await resolveProfilePhotoUrls(
            withProfile
              .filter((m) => m.profile?.photo_url && !avatarByUser.has(m.user_id))
              .map((m) => ({
                path: m.profile!.photo_url,
                userId: m.user_id,
              })),
            { screen: 'room', roomId },
          );
          if (cancelled) return;

          setPhotoUrlByUser((prev) => {
            const next = new Map(prev);
            for (const [memberUserId, url] of avatarByUser) next.set(memberUserId, url);
            for (const [memberUserId, url] of signedByUser) next.set(memberUserId, url);
            return next;
          });
          setMembersWithProfile(withProfile);
          setBlockedUserIds(blocked);
          const self = withProfile.find((m) => m.user_id === uid);
          setSelfGender(self?.profile?.gender ?? null);
          setMembersHydrated(true);
        },
        { tags: { screen: 'room', room_id: roomId }, extra: { user_id: uid } },
      )
      .catch(() => {
        if (!cancelled) setMembersHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [roomId, user?.id, members]);

  // 멤버 프로필 사진 서명 + 선로드(prefetch). 방 화면에서 미리 받은 signed URL 을
  // 채팅 화면도 같은 공용 캐시로 재사용해, 진입 직후 색 원이 보였다가 사진으로
  // 바뀌는 시간을 줄인다. 새로 들어온 photo_url 만 추가 처리한다.
  useEffect(() => {
    const pending = membersWithProfile.filter(
      (m) => m.profile?.photo_url && !photoUrlByUser.has(m.user_id),
    );
    if (pending.length === 0) return;

    let cancelled = false;
    void (async () => {
      const signedByUser = await resolveProfilePhotoUrls(
        pending.map((m) => ({
          path: m.profile!.photo_url,
          userId: m.user_id,
        })),
        { screen: 'room', roomId },
      );
      if (cancelled) return;
      if (signedByUser.size === 0) return;

      setPhotoUrlByUser((prev) => {
        const next = new Map(prev);
        for (const [userId, url] of signedByUser) next.set(userId, url);
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [membersWithProfile, photoUrlByUser, roomId]);

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

  useEffect(() => {
    if (!roomId || !membersHydrated || membersWithProfile.length === 0) return;
    setCachedRoomChatMembers(roomId, buildChatMembers(membersWithProfile, photoUrlByUser));
  }, [membersHydrated, membersWithProfile, photoUrlByUser, roomId]);

  useEffect(() => {
    if (videosLoading) {
      setMediaPrepared(false);
      return;
    }

    const currentVideos = (videosByHour[currentHour] ?? []).filter(
      (video) => video.status === 'ready' && video.storage_path,
    );

    if (currentVideos.length === 0) {
      setMediaPrepared(true);
      return;
    }

    let cancelled = false;
    setMediaPrepared(false);

    void (async () => {
      const rows = await Promise.all(
        currentVideos.map(async (video) => {
          const [thumbnailUri, videoUri] = await Promise.all([
            video.thumbnail_path
              ? getCachedThumbnailUri(video.thumbnail_path, video.id)
              : Promise.resolve(null),
            getCachedVideoUri(video.storage_path as string, video.id),
          ]);
          return [video.id, { thumbnailUri, videoUri }] as const;
        }),
      );

      if (cancelled) return;

      setMediaUriByVideo((prev) => {
        const next = new Map(prev);
        for (const [videoId, uris] of rows) next.set(videoId, uris);
        return next;
      });
      setMediaPrepared(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [currentHour, videosByHour, videosLoading]);

  const nowHour = getCurrentHourSlotKst();
  const isViewingToday = useMemo(() => isSameDay(selectedDate, new Date()), [selectedDate]);

  const cells = useMemo(
    () =>
      buildCells(
        membersWithProfile,
        videosByHour,
        currentHour,
        onlineUserIds,
        selfGender,
        blockedUserIds,
        user?.id ?? null,
        nowHour,
        isViewingToday,
        photoUrlByUser,
        mediaUriByVideo,
      ),
    [
      membersWithProfile,
      videosByHour,
      currentHour,
      onlineUserIds,
      selfGender,
      blockedUserIds,
      user?.id,
      nowHour,
      isViewingToday,
      photoUrlByUser,
      mediaUriByVideo,
    ],
  );

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
    () =>
      Array.from({ length: 24 }, (_, hour) => ({
        hour,
        label: hourSlotLabel(hour),
        isFuture: isViewingToday && hour > nowHour,
      })),
    [isViewingToday, nowHour],
  );
  const activeTimeSlotIndex = clampTimeSlotIndex(currentHour, slots.length);
  const timeStripScrollRef = useRef<ElementRef<typeof ScrollView>>(null);
  const timeStripCommittedHourRef = useRef(currentHour);
  const timeStripCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeStripHapticIndexRef = useRef(activeTimeSlotIndex);
  const timeStripInteractingRef = useRef(false);
  const timeStripViewportWidth = Math.max(0, windowWidth - 16);
  const timeStripSidePadding = Math.max(
    0,
    (timeStripViewportWidth - TIME_SLOT_WIDTH) / 2,
  );
  const timeStripScrollX = useRef(
    new Animated.Value(activeTimeSlotIndex * TIME_SLOT_STEP),
  ).current;
  const timeStripSnapOffsets = useMemo(
    () => slots.map((_, index) => index * TIME_SLOT_STEP),
    [slots],
  );
  const handleTimeStripScroll = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { contentOffset: { x: timeStripScrollX } } }],
        {
          useNativeDriver: true,
          listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            if (!timeStripInteractingRef.current) return;
            const nextIndex = offsetToTimeSlotIndex(
              event.nativeEvent.contentOffset.x,
              slots.length,
            );
            if (nextIndex === timeStripHapticIndexRef.current) return;
            timeStripHapticIndexRef.current = nextIndex;
            void Haptics.selectionAsync().catch(() => {});
          },
        },
      ),
    [slots.length, timeStripScrollX],
  );

  const clearScheduledTimeStripCommit = useCallback(() => {
    if (timeStripCommitTimerRef.current) {
      clearTimeout(timeStripCommitTimerRef.current);
      timeStripCommitTimerRef.current = null;
    }
  }, []);

  const scrollToCommittedTimeSlot = useCallback(
    (animated = true) => {
      timeStripScrollRef.current?.scrollTo({
        animated,
        x: timeStripCommittedHourRef.current * TIME_SLOT_STEP,
        y: 0,
      });
    },
    [],
  );

  const commitTimeSlot = useCallback(
    (slotIndex: number) => {
      const nextIndex = clampTimeSlotIndex(slotIndex, slots.length);
      const slot = slots[nextIndex];
      if (!slot) return;
      if (slot.isFuture) {
        scrollToCommittedTimeSlot();
        return;
      }
      if (slot.hour === timeStripCommittedHourRef.current) return;

      void Haptics.selectionAsync().catch(() => {});
      const fromHour = prevHourRef.current;
      const cacheHit = slot.hour in videosByHour;
      analytics.capture(ANALYTICS_EVENTS.room_timestrip_swipe, {
        from_hour: fromHour,
        to_hour: slot.hour,
        cache_hit: cacheHit,
      });
      prevHourRef.current = slot.hour;
      timeStripCommittedHourRef.current = slot.hour;
      setCurrentHour(slot.hour);
    },
    [scrollToCommittedTimeSlot, setCurrentHour, slots, videosByHour],
  );

  const handleSelectDate = useCallback(
    (date: Date) => {
      setSelectedDate(date);
      setCurrentHour(getCurrentHourSlotKst());
      setCalendarOpen(false);
    },
    [setCurrentHour],
  );

  const shiftHour = useCallback(
    (direction: -1 | 1) => {
      const target = (((currentHour + direction) % 24) + 24) % 24;
      if (isViewingToday && target > nowHour) return;
      const fromHour = prevHourRef.current;
      const cacheHit = target in videosByHour;
      analytics.capture(ANALYTICS_EVENTS.room_timestrip_swipe, {
        from_hour: fromHour,
        to_hour: target,
        cache_hit: cacheHit,
      });
      void Haptics.selectionAsync().catch(() => {});
      prevHourRef.current = target;
      timeStripCommittedHourRef.current = target;
      setCurrentHour(target);
    },
    [currentHour, isViewingToday, nowHour, setCurrentHour, videosByHour],
  );

  const scheduleTimeSlotCommit = useCallback(
    (slotIndex: number) => {
      clearScheduledTimeStripCommit();
      timeStripCommitTimerRef.current = setTimeout(() => {
        timeStripCommitTimerRef.current = null;
        timeStripInteractingRef.current = false;
        commitTimeSlot(slotIndex);
      }, 180);
    },
    [clearScheduledTimeStripCommit, commitTimeSlot],
  );

  useEffect(() => {
    timeStripCommittedHourRef.current = currentHour;
    timeStripHapticIndexRef.current = activeTimeSlotIndex;
    timeStripScrollX.setValue(activeTimeSlotIndex * TIME_SLOT_STEP);
    requestAnimationFrame(() => {
      timeStripScrollRef.current?.scrollTo({
        animated: false,
        x: activeTimeSlotIndex * TIME_SLOT_STEP,
        y: 0,
      });
    });
  }, [activeTimeSlotIndex, currentHour, slots, timeStripScrollX]);

  useEffect(() => clearScheduledTimeStripCommit, [clearScheduledTimeStripCommit]);

  const roomPrepared =
    gateChecked &&
    membersHydrated &&
    (!videosLoading || prepareMaxElapsed) &&
    (mediaPrepared || prepareMaxElapsed);

  useEffect(() => {
    if (!roomPrepared) {
      setPrepareSettled(false);
      return;
    }

    const timer = setTimeout(() => setPrepareSettled(true), ROOM_PREPARE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [roomPrepared]);

  const showRoomShell = roomPrepared;
  const showPreparingOverlay = !roomPrepared || !prepareMinElapsed || !prepareSettled;

  return (
    <View className="flex-1 bg-bg">
      {showRoomShell ? (
        <SafeAreaView className="flex-1 bg-bg">
          <TopNav
            left="none"
            title="dei"
            rightActions={
              <>
                <IconButton
                  glyph={CalendarIcon}
                  variant="ghost"
                  size={32}
                  accessibilityLabel="날짜 선택"
                  onPress={() => setCalendarOpen(true)}
                />
                <View>
                  <IconButton
                    glyph={MessageCircle}
                    variant="ghost"
                    size={32}
                    accessibilityLabel="채팅"
                    onPress={() => {
                      analytics.capture(ANALYTICS_EVENTS.room_chat_opened, { room_id: roomId });
                      setCachedRoomChatMembers(roomId, buildChatMembers(membersWithProfile, photoUrlByUser));
                      router.push(`/room/${roomId}/chat`);
                    }}
                  />
                  {hasUnread ? (
                    <View className="absolute top-[2px] right-[2px]">
                      <Badge variant="dot" />
                    </View>
                  ) : null}
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
            // 위아래 드래그 잠금: pull-to-refresh·바운스 제거. 새 영상은 realtime
            // (useRoomVideos 구독)으로 자동 추가되므로 수동 새로고침이 불필요하다.
            // 콘텐츠가 화면을 넘기는 경우(최대 8셀)에만 스크롤되고, 평상시엔 드래그
            // 반응이 없다(바운스/overscroll 차단).
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
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
              <>
                <View className="relative mx-[8px] px-0 pb-[14px] pt-[6px]">
                  <View className="absolute left-[6px] top-[6px] bottom-[14px] justify-center">
                    <Text className="text-2xs text-ink-4">‹</Text>
                  </View>
                  <View className="absolute right-[6px] top-[6px] bottom-[14px] justify-center">
                    <Text className="text-2xs text-ink-4">›</Text>
                  </View>
                  <Animated.ScrollView
                    ref={timeStripScrollRef}
                    testID="room-timestrip-scroll"
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    bounces={false}
                    decelerationRate="fast"
                    disableIntervalMomentum
                    snapToOffsets={timeStripSnapOffsets}
                    scrollEventThrottle={16}
                    onScroll={handleTimeStripScroll}
                    contentOffset={{ x: activeTimeSlotIndex * TIME_SLOT_STEP, y: 0 }}
                    onScrollBeginDrag={(event) => {
                      timeStripInteractingRef.current = true;
                      timeStripHapticIndexRef.current = offsetToTimeSlotIndex(
                        event.nativeEvent.contentOffset.x,
                        slots.length,
                      );
                    }}
                    onScrollEndDrag={(event) => {
                      scheduleTimeSlotCommit(
                        offsetToTimeSlotIndex(getTimeStripTargetOffset(event), slots.length),
                      );
                    }}
                    onMomentumScrollBegin={() => {
                      clearScheduledTimeStripCommit();
                      timeStripInteractingRef.current = true;
                    }}
                    onMomentumScrollEnd={(event) => {
                      clearScheduledTimeStripCommit();
                      timeStripInteractingRef.current = false;
                      commitTimeSlot(
                        offsetToTimeSlotIndex(event.nativeEvent.contentOffset.x, slots.length),
                      );
                    }}
                    contentContainerStyle={{
                      alignItems: 'center',
                      paddingHorizontal: timeStripSidePadding,
                    }}
                  >
                    {slots.map((slot, i) => {
                      const scale = timeStripScrollX.interpolate({
                        inputRange: [
                          (i - 1) * TIME_SLOT_STEP,
                          i * TIME_SLOT_STEP,
                          (i + 1) * TIME_SLOT_STEP,
                        ],
                        outputRange: [0.72, 1.68, 0.72],
                        extrapolate: 'clamp',
                      });
                      const opacity = timeStripScrollX.interpolate({
                        inputRange: [
                          (i - 1) * TIME_SLOT_STEP,
                          i * TIME_SLOT_STEP,
                          (i + 1) * TIME_SLOT_STEP,
                        ],
                        outputRange: [0.28, 1, 0.28],
                        extrapolate: 'clamp',
                      });
                      const animatedSlotStyle = {
                        opacity,
                        transform: [{ scale }],
                      };
                      return (
                        <Pressable
                          key={`${slot.hour}-${i}`}
                          testID={`room-time-slot-${i}`}
                          accessibilityRole="button"
                          accessibilityLabel={`${slot.label} 시간대`}
                          disabled={slot.isFuture}
                          onPress={() => {
                            timeStripScrollRef.current?.scrollTo({
                              animated: true,
                              x: i * TIME_SLOT_STEP,
                              y: 0,
                            });
                            commitTimeSlot(i);
                          }}
                          className="mr-[10px] w-[60px]"
                        >
                          <Animated.View
                            className="h-[48px] items-center justify-center px-[8px]"
                            style={animatedSlotStyle}
                          >
                            <Text
                              className={
                                slot.isFuture
                                  ? 'text-base font-black text-ink-4 opacity-40 tracking-tight'
                                  : 'text-base font-black text-ink tracking-tight'
                              }
                              tabularNums
                            >
                              {slot.label}
                            </Text>
                          </Animated.View>
                        </Pressable>
                      );
                    })}
                  </Animated.ScrollView>
                </View>
                <GridRoom
                  cells={cells}
                  GradientComponent={GradientWrapper}
                  onCellPress={(cell) => {
                    if (cell.kind === 'empty') {
                      if (cell.canRecord) {
                        router.push(`/(app)/room/${roomId}/upload`);
                      }
                      return;
                    }
                    const videoId = (cell as GridRoomFilledCell).videoId;
                    if (!videoId) return;
                    router.push(`/room/${roomId}/video/${videoId}`);
                  }}
                  onAvatarPress={(cell) => {
                    // 셀이 직접 들고 있는 userId 로 멤버 프로필(S14) 이동. 닉네임 문자열
                    // 매칭은 동명이인·표시 truncation 에 취약 → fallback 으로만.
                    const userId =
                      cell.userId
                      ?? membersWithProfile.find(
                        (m) => m.profile?.nickname === cell.name || m.user_id.slice(0, 6) === cell.name,
                      )?.user_id;
                    if (!userId) return;
                    const member = membersWithProfile.find((m) => m.user_id === userId);
                    const name = member?.profile?.nickname ?? cell.name;
                    const photoUrl = photoUrlByUser.get(userId) ?? member?.profile?.avatar_url ?? undefined;
                    router.push({
                      pathname: '/(app)/room/[roomId]/members',
                      params: {
                        roomId,
                        userId,
                        ...(name ? { targetNickname: name } : {}),
                        ...(photoUrl ? { targetAvatarUrl: photoUrl } : {}),
                      },
                    } as never);
                  }}
                  onHourShift={shiftHour}
                />
              </>
            )}
          </ScrollView>
          <CalendarSheet
            visible={calendarOpen}
            onClose={() => setCalendarOpen(false)}
            selectedDate={selectedDate}
            onSelect={handleSelectDate}
            minDate={calendarMinDate}
          />
        </SafeAreaView>
      ) : null}

      {showPreparingOverlay ? (
        <View className="absolute inset-0 z-50">
          <RoomPreparingScreen />
        </View>
      ) : null}
    </View>
  );
}
