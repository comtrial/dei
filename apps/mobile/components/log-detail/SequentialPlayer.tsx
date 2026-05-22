import { useEffect, useRef } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { useEvent } from 'expo';
import { useVideoPlayer } from 'expo-video';

import { Text } from '@/components/ui/text';
import { VideoWithPoster } from '@/components/ui/VideoWithPoster';
import { useCachedVideoSource } from '@/hooks/useCachedVideoSource';
import { resolveLogVideoUrl, resolveThumbnailUrl } from '@/lib/videoUrls';
import type { Database } from '@dei/api';

type LogRow = Database['public']['Tables']['logs']['Row'];

interface Props {
  logs: LogRow[];
  index: number;
  onComplete: () => void;
  onTap?: 'toggle' | 'noop';
}

export function SequentialPlayer({ logs, index, onComplete, onTap = 'toggle' }: Props) {
  const current = logs[index];
  const completeFired = useRef(false);

  const currentVideoUrl = current?.video_url ? resolveLogVideoUrl(current.video_url) : null;
  const currentThumbnailUrl = current?.thumbnail_path
    ? resolveThumbnailUrl(current.thumbnail_path)
    : null;
  const cachedSource = useCachedVideoSource(currentVideoUrl, current?.id ?? null);

  const player = useVideoPlayer(cachedSource ?? null, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  // index 변경 시 영상 교체
  useEffect(() => {
    if (!currentVideoUrl) return;
    completeFired.current = false;
    player.replace({ uri: currentVideoUrl });
    player.play();
  }, [currentVideoUrl, player]);

  // 영상 종료 감지 — currentTime이 duration에 근접할 때
  useEffect(() => {
    if (completeFired.current) return;
    if (
      player.status === 'readyToPlay' &&
      player.duration > 0 &&
      player.currentTime > 0 &&
      Math.abs(player.currentTime - player.duration) < 0.35
    ) {
      completeFired.current = true;
      onComplete();
    }
  });

  // 백그라운드 전환 시 정지
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') player.pause();
    });
    return () => sub.remove();
  }, [player]);

  // unmount 시 리소스 해제
  useEffect(() => {
    return () => {
      player.pause();
    };
  }, [player]);

  function handleTap() {
    if (onTap === 'noop') return;
    if (isPlaying) player.pause();
    else player.play();
  }

  return (
    <Pressable onPress={handleTap} style={StyleSheet.absoluteFillObject}>
      <VideoWithPoster
        player={player}
        posterUrl={currentThumbnailUrl}
        videoUrl={currentVideoUrl}
        posterCacheKey={current?.id ?? null}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        nativeControls={false}
      />
      {!isPlaying && (
        <View style={StyleSheet.absoluteFillObject} className="items-center justify-center">
          <View className="bg-black/50 rounded-full p-4">
            <Text className="text-white text-3xl">▶</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}
