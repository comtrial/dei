import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { Image } from 'expo-image';

import { FullscreenVideo } from '@dei/ui';
import { analytics, logger } from '@dei/shared';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';

export default function VideoFullscreenScreen() {
  const router = useRouter();
  const { videoId, roomId, videoUrl, thumbnailUrl } = useLocalSearchParams<{
    videoId: string;
    roomId: string;
    videoUrl?: string;
    thumbnailUrl?: string;
  }>();

  const [firstFrameRendered, setFirstFrameRendered] = useState(false);
  const [loadStartMs] = useState(() => performance.now());

  const player = useVideoPlayer(
    videoUrl ? { uri: videoUrl } : null,
    (p) => {
      p.loop = true;
      p.bufferOptions = { preferredForwardBufferDuration: 1 };
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
    analytics.capture(ANALYTICS_EVENTS.video_load_started, {
      videoId,
      roomId,
    });
  }, [videoId, roomId]);

  useEffect(() => {
    if (!isPlaying && status === 'readyToPlay' && firstFrameRendered) {
      analytics.capture(ANALYTICS_EVENTS.video_stalled, {
        videoId,
        position_ms: Math.round(player.currentTime * 1000),
        reason: 'buffering',
      });
    }
  }, [isPlaying, status, firstFrameRendered, videoId, player]);

  useEffect(() => {
    if (status === 'readyToPlay' && !firstFrameRendered) {
      setFirstFrameRendered(true);
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
  }, [status, error, firstFrameRendered, videoId, roomId, videoUrl, loadStartMs]);

  const progress =
    player.duration > 0 ? player.currentTime / player.duration : 0;

  function handleVideoPress() {
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  }

  return (
    <FullscreenVideo
      mode="playback"
      onClose={() => router.back()}
      onVideoPress={handleVideoPress}
      progress={progress}
      swipeHint="‹ 다른 멤버 영상 ›"
    >
      <VideoView
        player={player}
        contentFit="cover"
        nativeControls={false}
        className="absolute inset-0"
        onFirstFrameRender={() => {
          if (!firstFrameRendered) {
            setFirstFrameRendered(true);
          }
        }}
      />
      {!firstFrameRendered && thumbnailUrl ? (
        <View className="absolute inset-0">
          <Image
            source={{ uri: thumbnailUrl }}
            contentFit="cover"
            cachePolicy="memory-disk"
            className="absolute inset-0"
          />
        </View>
      ) : null}
    </FullscreenVideo>
  );
}
