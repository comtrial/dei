import { Modal, Pressable, TouchableOpacity, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { X, Volume2, VolumeX, UserRound } from 'lucide-react-native';
import { useState } from 'react';

import { Text } from '@/components/ui/text';
import type { CurationItem } from '@/hooks/useHomeScreen';

interface Props {
  item: CurationItem | null;
  onClose: () => void;
  onProfilePress?: (item: CurationItem) => void;
}

export function VideoModal({ item, onClose, onProfilePress }: Props) {
  const [muted, setMuted] = useState(false);

  const player = useVideoPlayer(item?.videos?.[0]?.videoUrl || null, (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    player.muted = next;
  };

  const genderLabel = item?.gender === 'M' ? '남' : item?.gender === 'F' ? '여' : null;
  const nameLabel = [item?.displayName, genderLabel].filter(Boolean).join(' · ');

  return (
    <Modal
      visible={!!item}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* 딤 배경 — 탭하면 닫힘 */}
      <Pressable
        className="flex-1 bg-black/80 items-center justify-center"
        onPress={onClose}
      >
        {/* 모달 카드 — 탭 이벤트 버블링 차단 */}
        <Pressable
          className="w-[88%] rounded-2xl overflow-hidden bg-black"
          style={{ aspectRatio: 9 / 16, maxHeight: '80%' }}
          onPress={(e) => e.stopPropagation()}
        >
          {/* 영상 */}
          <VideoView
            player={player}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            contentFit="cover"
            nativeControls={false}
          />

          {/* 닫기 버튼 */}
          <TouchableOpacity
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 items-center justify-center"
            onPress={onClose}
            activeOpacity={0.8}
          >
            <X size={16} color="#fff" />
          </TouchableOpacity>

          {/* 음소거 토글 */}
          <TouchableOpacity
            className="absolute top-3 left-3 w-8 h-8 rounded-full bg-black/50 items-center justify-center"
            onPress={toggleMute}
            activeOpacity={0.8}
          >
            {muted ? (
              <VolumeX size={15} color="#fff" />
            ) : (
              <Volume2 size={15} color="#fff" />
            )}
          </TouchableOpacity>

          {item && onProfilePress ? (
            <TouchableOpacity
              accessibilityLabel="프로필 보기"
              className="absolute left-14 top-3 h-8 w-8 items-center justify-center rounded-full bg-black/50"
              onPress={() => onProfilePress(item)}
              activeOpacity={0.8}
            >
              <UserRound size={15} color="#fff" />
            </TouchableOpacity>
          ) : null}

          {/* 하단 유저 정보 */}
          <View className="absolute bottom-0 left-0 right-0 px-4 pb-4 pt-10">
            <View className="bg-black/50 self-start rounded-lg px-3 py-1.5">
              <Text className="text-white text-sm font-semibold">{nameLabel}</Text>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
