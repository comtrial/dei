import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Play, X } from 'lucide-react-native';

import { Avatar, Chip, IconButton, StateView } from '@dei/ui';
import { analytics, logger, POLICY } from '@dei/shared';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { supabase } from '@/lib/supabase';
import { getCachedVideoUri } from '@/lib/video';
import {
  getVideoById,
  getSiblingVideos,
  isBlockedBetween,
  getRoomMembersWithProfile,
} from '@/lib/room-rpc';
import { ROUTES } from '@/lib/routes';

type FetchState = 'loading' | 'error' | 'ready';

export default function VideoFullscreenScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { videoId, roomId } = useLocalSearchParams<{
    videoId: string;
    roomId: string;
  }>();

  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [memberNickname, setMemberNickname] = useState<string>('');
  const [memberPhotoUrl, setMemberPhotoUrl] = useState<string | null>(null);
  const [memberUserId, setMemberUserId] = useState<string>('');
  const [selfUserId, setSelfUserId] = useState<string>('');
  const [capturedAtLabel, setCapturedAtLabel] = useState<string | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [siblings, setSiblings] = useState<{ id: string; url: string; thumbnail: string | null }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [firstFrameRendered, setFirstFrameRendered] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [loadStartMs] = useState(() => performance.now());

  const prefetchCount = POLICY.video.prefetchSiblingCount;

  const player = useVideoPlayer(
    videoUrl ? { uri: videoUrl } : null,
    (p) => {
      p.loop = true;
      p.muted = true;
      p.bufferOptions = { preferredForwardBufferDuration: 5 };
      p.play();
    },
  );

  const { status, error } = useEvent(player, 'statusChange', {
    status: player.status,
  });

  const { isPlaying } = useEvent(player, 'playingChange', {
    isPlaying: player.playing,
  });

  useEffect(() => {
    if (!videoUrl) return;
    const t = setTimeout(() => {
      try { player.play(); } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, [videoUrl, player]);

  const loadVideo = useCallback(async () => {
    if (!videoId || !roomId) return;
    setFetchState('loading');
    setFirstFrameRendered(false);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const fetchedSelfUserId = user?.id ?? '';
      setSelfUserId(fetchedSelfUserId);

      const video = await getVideoById(videoId);
      if (!video || !video.storage_path) {
        setFetchState('error');
        return;
      }

      if (fetchedSelfUserId && video.user_id) {
        const blocked = await isBlockedBetween(fetchedSelfUserId, video.user_id);
        if (blocked) {
          router.back();
          return;
        }
      }

      const cachedVideoUri = await getCachedVideoUri(video.storage_path, video.id);
      if (!cachedVideoUri) {
        setFetchState('error');
        return;
      }

      let thumbSignedUrl: string | null = null;
      if (video.thumbnail_path) {
        const { data: thumbData } = await supabase.storage
          .from('room-videos')
          .createSignedUrl(video.thumbnail_path, 600);
        thumbSignedUrl = thumbData?.signedUrl ?? null;
      }

      setVideoUrl(cachedVideoUri);
      setThumbnailUrl(thumbSignedUrl);
      setMemberUserId(video.user_id ?? '');

      if (video.created_at) {
        const d = new Date(video.created_at);
        setCapturedAtLabel(
          Number.isNaN(d.getTime())
            ? null
            : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        );
      } else {
        setCapturedAtLabel(null);
      }

      setCaption(video.caption ?? null);

      const members = await getRoomMembersWithProfile(roomId);
      const member = members.find((m) => m.user_id === video.user_id);
      setMemberNickname(member?.profile?.nickname ?? '');
      setMemberPhotoUrl(member?.profile?.photo_url ?? null);

      if (video.hour_slot != null) {
        const siblingRows = await getSiblingVideos(roomId, video.hour_slot);
        const blockedIds = fetchedSelfUserId
          ? new Set(
              (
                await supabase
                  .from('block')
                  .select('blocked_user_id, blocker_user_id')
                  .or(
                    `blocker_user_id.eq.${fetchedSelfUserId},blocked_user_id.eq.${fetchedSelfUserId}`,
                  )
                  .is('unblocked_at', null)
              ).data?.flatMap((r) =>
                r.blocker_user_id === fetchedSelfUserId
                  ? [r.blocked_user_id]
                  : [r.blocker_user_id],
              ) ?? [],
            )
          : new Set<string>();

        const filtered = siblingRows.filter(
          (s) => !blockedIds.has(s.user_id ?? ''),
        );

        const resolved = await Promise.all(
          filtered.map(async (s) => {
            if (!s.storage_path) return null;
            const { data: sd } = await supabase.storage
              .from('room-videos')
              .createSignedUrl(s.storage_path, 60);
            if (!sd?.signedUrl) return null;
            let thumb: string | null = null;
            if (s.thumbnail_path) {
              const { data: td } = await supabase.storage
                .from('room-videos')
                .createSignedUrl(s.thumbnail_path, 60);
              thumb = td?.signedUrl ?? null;
            }
            return { id: s.id, url: sd.signedUrl, thumbnail: thumb };
          }),
        );

        const validSiblings = resolved.filter(
          (s): s is { id: string; url: string; thumbnail: string | null } =>
            s !== null,
        );
        setSiblings(validSiblings);

        const idx = validSiblings.findIndex((s) => s.id === videoId);
        setCurrentIndex(idx >= 0 ? idx : 0);

        for (
          let i = Math.max(0, idx - prefetchCount);
          i <= Math.min(validSiblings.length - 1, idx + prefetchCount);
          i++
        ) {
          if (i === idx) continue;
          const sibling = validSiblings[i];
          if (sibling?.thumbnail) {
            Image.prefetch(sibling.thumbnail);
          }
        }
      }

      analytics.capture(ANALYTICS_EVENTS.video_load_started, {
        videoId,
        roomId,
      });

      setFetchState('ready');
    } catch (err) {
      logger.captureException(err, {
        tags: { screen: 'VideoFullscreen', videoId: videoId ?? '' },
        extra: { roomId },
      });
      setFetchState('error');
    }
  }, [videoId, roomId, prefetchCount, router]);

  useEffect(() => {
    loadVideo();
  }, [loadVideo]);

  useEffect(() => {
    if (status === 'readyToPlay') {
      try { player.play(); } catch {}
      analytics.capture(ANALYTICS_EVENTS.video_first_frame_rendered, {
        videoId,
        latency_ms: Math.round(performance.now() - loadStartMs),
      });
    }
    if (status === 'error' && error) {
      logger.captureException(error, {
        tags: { screen: 'VideoFullscreen', videoId: videoId ?? '' },
        extra: { roomId, videoUrl },
      });
      analytics.capture(ANALYTICS_EVENTS.video_error, {
        videoId,
        error_code: error.message,
      });
    }
  }, [status, error, videoId, roomId, videoUrl, loadStartMs, player]);

  useEffect(() => {
    if (!isPlaying && status === 'readyToPlay') {
      try { player.play(); } catch {}
    }
  }, [isPlaying, status, player]);

  const swipeToIndex = useCallback(
    async (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= siblings.length) return;
      const next = siblings[nextIndex];
      if (!next) return;
      setCurrentIndex(nextIndex);
      setFirstFrameRendered(false);
      try {
        await player.replaceAsync({ uri: next.url });
        player.play();
      } catch (err) {
        logger.captureException(err, {
          tags: { screen: 'VideoFullscreen', action: 'swipe_replace' },
        });
      }

      for (
        let i = Math.max(0, nextIndex - prefetchCount);
        i <= Math.min(siblings.length - 1, nextIndex + prefetchCount);
        i++
      ) {
        if (i === nextIndex) continue;
        const sibling = siblings[i];
        if (sibling?.thumbnail) {
          Image.prefetch(sibling.thumbnail);
        }
      }
    },
    [siblings, player, prefetchCount],
  );

  const swipeStartX = useRef(0);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onStart((e) => {
      swipeStartX.current = e.translationX;
    })
    .onEnd((e) => {
      const dx = e.translationX;
      if (dx < -50) {
        swipeToIndex(currentIndex + 1);
      } else if (dx > 50) {
        swipeToIndex(currentIndex - 1);
      }
    })
    .runOnJS(true);

  const longPressGesture = Gesture.LongPress()
    .minDuration(400)
    .onStart(() => {
      setUiVisible(false);
      player.pause();
    })
    .onEnd(() => {
      setUiVisible(true);
      player.play();
    })
    .runOnJS(true);

  const combinedGesture = Gesture.Simultaneous(panGesture, longPressGesture);

  function handleVideoPress() {}

  const memberInitial = memberNickname ? memberNickname.charAt(0) : '?';

  const metaSlot = memberUserId ? (
    <Chip
      testID="member-chip"
      variant="default"
      label={memberNickname || '멤버'}
      avatar={
        <Avatar
          initial={memberInitial}
          photoUrl={memberPhotoUrl ?? undefined}
          size={24}
          bg="bg-accent"
        />
      }
      className="border-transparent bg-black/55"
      textClassName="text-paper"
      onStartShouldSetResponder={() => true}
      onResponderRelease={() => {
        if (memberUserId === selfUserId) {
          router.push(ROUTES.myProfile);
          return;
        }

        router.push(
          `/(app)/room/${roomId}/members?userId=${memberUserId}` as never,
        );
      }}
    />
  ) : null;

  if (fetchState === 'loading') {
    return <StateView kind="loading" />;
  }

  if (fetchState === 'error') {
    return (
      <StateView
        kind="error"
        icon="!"
        title="영상을 불러오지 못했어요"
        desc="잠시 후 다시 시도해 주세요."
        action={{ label: '다시 시도', onPress: loadVideo }}
      />
    );
  }

  return (
    <View className="flex-1 bg-black">
      <GestureDetector gesture={combinedGesture}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={handleVideoPress}
        >
          <VideoView
            testID="fullscreen-video"
            player={player}
            contentFit="contain"
            nativeControls={false}
            style={StyleSheet.absoluteFillObject}
            onFirstFrameRender={() => {
              if (!firstFrameRendered) {
                setFirstFrameRendered(true);
              }
            }}
          />
          {!firstFrameRendered && thumbnailUrl ? (
            <Image
              source={{ uri: thumbnailUrl }}
              contentFit="cover"
              cachePolicy="memory-disk"
              style={StyleSheet.absoluteFillObject}
            />
          ) : null}
        </Pressable>
      </GestureDetector>

      {!isPlaying && firstFrameRendered ? (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
          <IconButton
            glyph={Play}
            variant="glass"
            size={36}
            accessibilityLabel="재생"
            onPress={handleVideoPress}
          />
        </View>
      ) : null}

      {capturedAtLabel || caption ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center px-6"
        >
          {capturedAtLabel ? (
            <Text className="text-white text-[56px] font-extrabold tracking-[2px] opacity-75">
              {capturedAtLabel}
            </Text>
          ) : null}
          {caption?.trim() ? (
            <Text className="mt-2 text-white text-xl font-semibold text-center">
              {caption}
            </Text>
          ) : null}
        </View>
      ) : null}

      {uiVisible ? (
        <View
          pointerEvents="box-none"
          className="absolute left-[18px] right-[18px] flex-row justify-between items-center z-30"
          style={[{ top: insets.top + 12 }]}
        >
          <IconButton
            glyph={X}
            variant="glass"
            size={36}
            accessibilityLabel="닫기"
            onPress={() => router.back()}
          />
          {metaSlot ?? <View />}
        </View>
      ) : null}
    </View>
  );
}
