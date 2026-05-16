import { useEffect, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Volume2, VolumeX, Heart } from 'lucide-react-native';

import { Text } from '@/components/ui/text';
import type { CurationItem } from '@/hooks/useHomeScreen';

interface Props {
  item: CurationItem;
  canLike: boolean;
  onLike: (userId: string) => void;
  onPress: (item: CurationItem) => void;
}

export function CurationCard({ item, canLike, onLike, onPress }: Props) {
  const [muted, setMuted] = useState(true);
  const [videoIndex, setVideoIndex] = useState(0);

  const player = useVideoPlayer(item.videos[0]?.videoUrl || null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  // 유저가 바뀌면 첫 번째 영상으로 리셋
  useEffect(() => {
    setVideoIndex(0);
    const url = item.videos[0]?.videoUrl;
    if (url) {
      player.replace(url);
      player.muted = muted;
      player.loop = item.videos.length <= 1;
      player.play();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.userId]);

  // 영상 1개: native loop / 영상 2개 이상: 종료 시점에 다음 영상으로 cycling (A→B→A→B)
  useEffect(() => {
    if (item.videos.length <= 1) {
      player.loop = true;
      return;
    }
    player.loop = false;
    const sub = player.addListener('playToEnd', () => {
      setVideoIndex((prev) => {
        const next = (prev + 1) % item.videos.length;
        const url = item.videos[next]?.videoUrl;
        if (url) {
          player.replace(url);
          player.muted = muted;
          player.play();
        }
        return next;
      });
    });
    return () => sub.remove();
  }, [player, item.videos, muted]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    player.muted = next;
  };

  const infoLine1 = [item.displayName, item.age != null ? `${item.age}세` : null]
    .filter(Boolean)
    .join(' · ');
  const infoLine2 = item.region ?? null;

  return (
    <TouchableOpacity
      className="flex-1 overflow-hidden"
      activeOpacity={0.95}
      onPress={() => onPress(item)}
    >
      <VideoView
        player={player}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        nativeControls={false}
      />

      {/* 영상 수 인디케이터 (2개 이상일 때만) */}
      {item.videos.length > 1 && (
        <View className="absolute top-2 left-0 right-0 flex-row justify-center gap-1 px-2">
          {item.videos.map((_, i) => (
            <View
              key={i}
              className={`h-0.5 flex-1 rounded-full ${i === videoIndex ? 'bg-white' : 'bg-white/35'}`}
            />
          ))}
        </View>
      )}

      {/* 좌하단 닉네임 · 나이 / 지역 */}
      <View className="absolute left-2.5 bottom-2 bg-black/45 rounded-md px-2 py-1">
        <Text className="text-white text-xs font-semibold">{infoLine1}</Text>
        {infoLine2 ? (
          <Text className="text-white/65 text-[10px] mt-0.5">{infoLine2}</Text>
        ) : null}
      </View>

      {/* 우하단 음소거 토글 */}
      <TouchableOpacity
        className="absolute right-2.5 bottom-2 w-7 h-7 rounded-full border border-white/35 items-center justify-center"
        onPress={toggleMute}
        activeOpacity={0.8}
      >
        {muted ? (
          <VolumeX size={13} color="rgba(255,255,255,0.9)" />
        ) : (
          <Volume2 size={13} color="rgba(255,255,255,0.9)" />
        )}
      </TouchableOpacity>

      {/* 좋아요 버튼 */}
      {canLike && (
        <TouchableOpacity
          className="absolute right-2.5 bottom-12 w-8 h-8 rounded-full bg-[#C0432A] items-center justify-center"
          onPress={() => onLike(item.userId)}
          activeOpacity={0.8}
        >
          <Heart size={14} color="#fff" fill="#fff" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}
