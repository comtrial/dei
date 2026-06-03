import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient, type LinearGradientProps } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { MessageCircle, MoreHorizontal } from 'lucide-react-native';

import { Banner, GridRoom, IconButton, Badge, TopNav } from '@dei/ui';
import type { GridRoomCell, GridRoomFilledCell, GridRoomTimeSlot, GradientComponentProps } from '@dei/ui';
import type { Database } from '@dei/api';
import { POLICY, analytics, formatTimeStripSlots, getCurrentHourSlotKst, isQuietHourKst, logger } from '@dei/shared';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { getCachedVideoUri, getCachedThumbnailUri } from '@/lib/video';
import { supabase } from '@/lib/supabase';
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

function CellVideoMedia({
  videoId,
  storagePath,
  thumbnailPath,
}: {
  videoId: string;
  storagePath: string;
  thumbnailPath: string | null;
}) {
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [firstFrameRendered, setFirstFrameRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (thumbnailPath) {
        const t = await getCachedThumbnailUri(thumbnailPath, videoId);
        if (!cancelled && t) setThumbnailUri(t);
      }
      const v = await getCachedVideoUri(storagePath, videoId);
      if (!cancelled && v) setVideoUri(v);
    })();
    return () => { cancelled = true; };
  }, [storagePath, thumbnailPath, videoId]);

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
  photoUrlByUser: Map<string, string>,
): GridRoomCell[] {
  const hourVideos = videosByHour[currentHour] ?? [];
  const videoByUser = new Map<string, VideoRow>();
  for (const v of hourVideos) {
    if (!videoByUser.has(v.user_id)) videoByUser.set(v.user_id, v);
  }

  const isCurrentSlot = currentHour === nowHour;

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
      return { kind: 'empty', name: displayName, isSelf, userId: member.user_id, canRecord };
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
      photoUrl: photoUrlByUser.get(member.user_id),
      media: video.storage_path ? (
        <CellVideoMedia
          videoId={video.id}
          storagePath={video.storage_path}
          thumbnailPath={video.thumbnail_path ?? null}
        />
      ) : undefined,
    };
  });
}

export default function RoomScreen() {
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { user } = useAuth();

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
  const [photoUrlByUser, setPhotoUrlByUser] = useState<Map<string, string>>(new Map());
  const [memberLeftMsg, setMemberLeftMsg] = useState<string | null>(null);
  const memberLeftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showExpiryBanner, setShowExpiryBanner] = useState(false);
  const expiryCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    // 멤버 로드 비동기 경계 — 내부 RPC 들은 자체 캡처. 경계만 보호(이중 캡처 금지).
    void logger
      .withErrorCapture(
        'room.load-members',
        async () => {
          const [withProfile, blocked] = await Promise.all([
            getRoomMembersWithProfile(roomId),
            getBlockedUserIds(uid),
          ]);
          setMembersWithProfile(withProfile);
          setBlockedUserIds(blocked);
          const self = withProfile.find((m) => m.user_id === uid);
          setSelfGender(self?.profile?.gender ?? null);
        },
        { tags: { screen: 'room', room_id: roomId }, extra: { user_id: uid } },
      )
      .catch(() => {});
  }, [roomId, user?.id, members]);

  // 멤버 프로필 사진 서명 + 선로드(prefetch). photo_url 은 profile-photos 버킷
  // 경로라 서명 URL 이 필요하다. 멤버 목록이 갱신될 때 사진 보유 멤버를 한 번에
  // 서명하고, expo-image 디스크/메모리 캐시에 미리 적재(Image.prefetch)해 그리드가
  // 뜰 때 아바타가 네트워크 왕복 없이 즉시 보이게 한다(UX 최적화). 새로 들어온
  // photo_url 만 추가 서명 — 이미 서명한 멤버는 재서명·재prefetch 안 함.
  useEffect(() => {
    const pending = membersWithProfile.filter(
      (m) => m.profile?.photo_url && !photoUrlByUser.has(m.user_id),
    );
    if (pending.length === 0) return;

    let cancelled = false;
    void (async () => {
      const signed = await Promise.all(
        pending.map(async (m) => {
          const path = m.profile!.photo_url as string;
          const { data, error } = await supabase.storage
            .from('profile-photos')
            .createSignedUrl(path, 60 * 60);
          if (error) {
            logger.captureException(error, {
              tags: { screen: 'room', feature: 'avatar-photo-sign', room_id: roomId },
              extra: { user_id: m.user_id },
            });
            return null;
          }
          return { userId: m.user_id, url: data?.signedUrl ?? null };
        }),
      );
      if (cancelled) return;

      const fresh = signed.filter(
        (s): s is { userId: string; url: string } => s != null && s.url != null,
      );
      if (fresh.length === 0) return;

      // expo-image 캐시에 선적재(병렬). 실패해도 렌더에는 영향 없음(렌더 시 재요청).
      for (const s of fresh) Image.prefetch(s.url);

      setPhotoUrlByUser((prev) => {
        const next = new Map(prev);
        for (const s of fresh) next.set(s.userId, s.url);
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

  const cells = useMemo(
    () => {
      const nowHour = getCurrentHourSlotKst();
      return buildCells(membersWithProfile, videosByHour, currentHour, onlineUserIds, selfGender, blockedUserIds, user?.id ?? null, nowHour, photoUrlByUser);
    },
    [membersWithProfile, videosByHour, currentHour, onlineUserIds, selfGender, blockedUserIds, user?.id, photoUrlByUser],
  );

  const timeStrip = useMemo<GridRoomTimeSlot[]>(() => {
    return formatTimeStripSlots(currentHour, hourRange).map((s) => ({
      label: s.label,
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
          <GridRoom
            cells={cells}
            timeStrip={timeStrip}
            timeHint="시간대를 밀어서 회상"
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
              router.push(`/room/${roomId}/members?userId=${userId}`);
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
