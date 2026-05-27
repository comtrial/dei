/**
 * MemberActionSheet — 멤버 long-press 시 차단/신고 메뉴 바텀시트.
 *
 * Modal 로 구현 (RNR BottomSheet 없이 단순 오버레이).
 * "차단" → BlockConfirmDialog 로 이어짐.
 * "신고" → ReportReasonSheet 로 이어짐.
 */
import { Modal, Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { RoomMemberWithProfile } from '@/hooks/useRoomMembers';

type Props = {
  member: RoomMemberWithProfile | null;
  roomId: string;
  onBlock: (member: RoomMemberWithProfile) => void;
  onReport: (member: RoomMemberWithProfile) => void;
  onClose: () => void;
};

export function MemberActionSheet({ member, roomId: _roomId, onBlock, onReport, onClose }: Props) {
  if (!member) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/50"
        onPress={onClose}>
        <View className="flex-1" />
        <Pressable
          className="bg-background rounded-t-3xl px-5 pt-3 pb-8"
          onPress={() => {/* do not close */}}>
          {/* 핸들 */}
          <View className="w-10 h-1 bg-border rounded-full self-center mb-4" />

          <Text className="text-base font-semibold text-foreground mb-4 text-center">
            {member.nickname ?? '멤버'} 메뉴
          </Text>

          <Pressable
            testID={`room-member-block-${member.profileId}`}
            onPress={() => { onBlock(member); }}
            className="py-4 border-b border-border/40 active:opacity-70">
            <Text className="text-base text-destructive text-center">차단하기</Text>
          </Pressable>

          <Pressable
            testID={`room-member-report-${member.profileId}`}
            onPress={() => { onReport(member); }}
            className="py-4 active:opacity-70">
            <Text className="text-base text-foreground text-center">신고하기</Text>
          </Pressable>

          <Pressable
            onPress={onClose}
            className="py-4 mt-2 active:opacity-70">
            <Text className="text-base text-muted-foreground text-center">취소</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
