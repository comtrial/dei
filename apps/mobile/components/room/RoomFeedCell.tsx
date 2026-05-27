/**
 * RoomFeedCell — 2×N 그리드의 개별 셀.
 *
 * VideoWithPoster 재활용. 서버 썸네일 있으면 poster 로 표시.
 * 차단된 셀은 상위(RoomFeedGrid)가 placeholder 로 렌더 — 이 컴포넌트는 정상 셀만.
 */
import { useVideoPlayer } from 'expo-video';
import { Pressable, View } from 'react-native';

import { VideoWithPoster } from '@/components/ui/VideoWithPoster';
import { Text } from '@/components/ui/text';
import { supabase } from '@/lib/supabase';
import type { FeedCell } from '@/lib/rooms/types';

type Props = {
  cell: FeedCell;
  width: number;
  height: number;
  onPress?: (cell: FeedCell) => void;
};

function getSignedUrl(path: string): string {
  const { data } = supabase.storage.from('room-uploads').getPublicUrl(path);
  return data.publicUrl;
}

function getThumbnailUrl(path: string | null): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from('room-thumbnails').getPublicUrl(path);
  return data.publicUrl;
}

export function RoomFeedCell({ cell, width, height, onPress }: Props) {
  const videoUrl = getSignedUrl(cell.storagePath);
  const thumbnailUrl = getThumbnailUrl(cell.thumbnailPath);

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  return (
    <Pressable
      testID={`room-feed-cell-${cell.profileId}`}
      onPress={() => onPress?.(cell)}
      style={{ width, height }}
      className="rounded-xl overflow-hidden bg-muted active:opacity-80">
      <VideoWithPoster
        player={player}
        posterUrl={thumbnailUrl}
        posterCacheKey={cell.storagePath}
        style={{ width, height }}
        contentFit="cover"
        nativeControls={false}
        pauseWhenBlurred={true}
        resumeOnFocus={false}
      />
    </Pressable>
  );
}

/** 빈 셀 (멤버가 아직 업로드 안 했거나 차단됨) */
export function RoomFeedPlaceholderCell({
  width,
  height,
  reason,
}: {
  width: number;
  height: number;
  reason?: 'no-upload' | 'blocked';
}) {
  return (
    <View
      style={{ width, height }}
      className="rounded-xl bg-muted items-center justify-center">
      <Text className="text-xs text-muted-foreground text-center px-2">
        {reason === 'blocked' ? '차단된 멤버' : '아직 없음'}
      </Text>
    </View>
  );
}
