/**
 * CH4 · 채팅방 더보기 시트.
 * 사용자 결정 #4 타협안: "상대 프로필 보기" + "나가기" 2개 항목.
 * 신고/차단 진입점 없음 (프로필에서만).
 */
import { LogOut, UserRound } from 'lucide-react-native';
import { Modal, Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

type ChatMoreSheetProps = {
  visible: boolean;
  onClose: () => void;
  onViewProfile: () => void;
  onLeave: () => void;
};

export function ChatMoreSheet({
  visible,
  onClose,
  onViewProfile,
  onLeave,
}: ChatMoreSheetProps) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}>
      <View className="flex-1 justify-end bg-black/60">
        <Pressable
          accessibilityLabel="더보기 시트 닫기"
          className="absolute inset-0"
          onPress={onClose}
          testID="chat-more-backdrop"
        />
        <View
          className="bg-background border-border gap-2 rounded-t-2xl border px-5 pb-10 pt-4"
          testID="chat-more-sheet">
          <View className="items-center pb-2">
            <View className="bg-muted h-1.5 w-12 rounded-full" />
          </View>

          <Pressable
            accessibilityRole="button"
            className="flex-row items-center gap-3 rounded-md px-2 py-4 active:bg-accent"
            onPress={onViewProfile}
            testID="chat-more-view-profile">
            <Icon as={UserRound} className="text-foreground" size={20} />
            <Text className="text-base">상대 프로필 보기</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            className="flex-row items-center gap-3 rounded-md px-2 py-4 active:bg-destructive/10"
            onPress={onLeave}
            testID="chat-more-leave">
            <Icon as={LogOut} className="text-destructive" size={20} />
            <Text className="text-destructive text-base font-semibold">나가기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
