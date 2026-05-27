/**
 * LeaveRoomDialog — 방 나가기 확인 다이얼로그.
 *
 * 24h cooldown 안내 포함. 확인 시 `onConfirm` 호출.
 */
import { Modal, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

type Props = {
  visible: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function LeaveRoomDialog({ visible, busy, onConfirm, onCancel }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}>
      <View className="flex-1 bg-black/50 items-center justify-center px-6">
        <View className="bg-background rounded-2xl p-6 w-full gap-4">
          <Text className="text-lg font-semibold text-foreground text-center">
            방을 나갈까요?
          </Text>
          <Text className="text-sm text-muted-foreground text-center leading-relaxed">
            방을 나가면 24시간 동안 새 방에 참여할 수 없어요.{'\n'}
            부스터로 제한을 즉시 해제할 수 있어요.
          </Text>

          <Button
            testID="room-leave-confirm-button"
            variant="destructive"
            onPress={onConfirm}
            disabled={busy}>
            <Text>{busy ? '나가는 중…' : '나가기'}</Text>
          </Button>

          <Button variant="ghost" onPress={onCancel} disabled={busy}>
            <Text>취소</Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}
