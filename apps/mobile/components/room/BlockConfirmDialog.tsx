/**
 * BlockConfirmDialog — 차단 확인 다이얼로그.
 *
 * "차단하면 양방향으로 숨겨집니다" 안내 + 확인/취소.
 * 확인 시 `onConfirm` 호출 (실제 blockUser 호출은 상위 화면).
 */
import { Modal, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { RoomMemberWithProfile } from '@/hooks/useRoomMembers';

type Props = {
  member: RoomMemberWithProfile | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function BlockConfirmDialog({ member, busy, onConfirm, onCancel }: Props) {
  if (!member) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onCancel}>
      <View className="flex-1 bg-black/50 items-center justify-center px-6">
        <View className="bg-background rounded-2xl p-6 w-full gap-4">
          <Text className="text-lg font-semibold text-foreground text-center">
            {member.nickname ?? '멤버'}님을 차단할까요?
          </Text>
          <Text className="text-sm text-muted-foreground text-center leading-relaxed">
            차단하면 서로의 영상과 채팅이 보이지 않게 되고, 일정 비율 이상 차단 시 방에서 자동으로 나가게 됩니다.
          </Text>

          <Button
            testID="room-block-confirm-button"
            variant="destructive"
            onPress={onConfirm}
            disabled={busy}>
            <Text>{busy ? '처리 중…' : '차단하기'}</Text>
          </Button>

          <Button variant="ghost" onPress={onCancel} disabled={busy}>
            <Text>취소</Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}
