import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Volume2, VolumeX, Heart, UserRound } from 'lucide-react-native';

import { Text } from '@/components/ui/text';
import type { CurationItem } from '@/hooks/useHomeScreen';

interface Props {
  item: CurationItem;
  isLikeUsed: boolean;
  isLiked: boolean;
  onLike: (userId: string) => void;
  onPress: (item: CurationItem) => void;
  onProfilePress?: (item: CurationItem) => void;
}

export function CurationCard({
  item,
  isLiked,
  isLikeUsed,
  onLike,
  onPress,
  onProfilePress,
}: Props) {
  const [muted, setMuted] = useState(true);

  const player = useVideoPlayer(item.videoUrl || null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    player.muted = next;
  };

  const genderLabel = item.gender === 'M' ? '남' : item.gender === 'F' ? '여' : null;
  const nameLabel = [item.displayName, genderLabel].filter(Boolean).join(' · ');
  const likeButtonClassName = isLiked
    ? 'absolute right-2.5 bottom-12 w-8 h-8 rounded-full bg-[#C0432A] items-center justify-center'
    : isLikeUsed
      ? 'absolute right-2.5 bottom-12 w-8 h-8 rounded-full bg-black/45 border border-white/25 items-center justify-center'
      : 'absolute right-2.5 bottom-12 w-8 h-8 rounded-full bg-[#C0432A] items-center justify-center';

  return (
    <TouchableOpacity className="flex-1 overflow-hidden" activeOpacity={0.95} onPress={() => onPress(item)}>
      <VideoView
        player={player}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        nativeControls={false}
      />

      {/* 좌하단 닉네임 칩 */}
      <View className="absolute left-2.5 bottom-2 bg-black/45 rounded-md px-2 py-1">
        <Text className="text-white text-xs font-semibold">{nameLabel}</Text>
      </View>

      {onProfilePress ? (
        <TouchableOpacity
          accessibilityLabel="프로필 보기"
          className="absolute right-2.5 top-2.5 h-8 w-8 items-center justify-center rounded-full bg-black/50"
          onPress={(event) => {
            event.stopPropagation();
            onProfilePress(item);
          }}
          activeOpacity={0.8}
        >
          <UserRound size={14} color="#fff" />
        </TouchableOpacity>
      ) : null}

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

      {/* 좋아요 버튼 — H2 진입 자체가 로그 완성 조건 */}
      <TouchableOpacity
        accessibilityLabel={isLiked ? '좋아요 보냄' : '좋아요 보내기'}
        className={likeButtonClassName}
        onPress={(event) => {
          event.stopPropagation();
          onLike(item.userId);
        }}
        activeOpacity={0.8}
      >
        <Heart
          size={14}
          color={isLikeUsed && !isLiked ? 'rgba(255,255,255,0.7)' : '#fff'}
          fill={isLiked ? '#fff' : 'transparent'}
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}
