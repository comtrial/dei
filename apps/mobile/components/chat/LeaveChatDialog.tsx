/**
 * CH5 · 채팅방 나가기 확인 다이얼로그.
 * "대화에서 나가시겠어요? 대화 내용이 영구 삭제되며 되돌릴 수 없습니다."
 * PRIMARY 나가기 (빨강) / SECONDARY 취소.
 */
import { ActivityIndicator } from 'react-native';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useThemeColor } from '@/hooks/use-theme-color';

type LeaveChatDialogProps = {
  open: boolean;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function LeaveChatDialog({
  open,
  pending = false,
  onCancel,
  onConfirm,
}: LeaveChatDialogProps) {
  // destructive 버튼 위 스피너 색 = 디자인 토큰 destructive-foreground
  // (하드코딩 #fff 제거 — CLAUDE.md NativeWind 토큰 규약, PM 검증서 P1-7).
  const spinnerColor = useThemeColor({}, 'destructiveForeground');
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DialogContent testID="leave-chat-dialog">
        <DialogHeader>
          <DialogTitle>대화에서 나가시겠어요?</DialogTitle>
          <DialogDescription>
            대화 내용이 영구 삭제되며 되돌릴 수 없습니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            accessibilityLabel="나가기 취소"
            disabled={pending}
            onPress={onCancel}
            testID="leave-chat-cancel"
            variant="outline">
            <Text>취소</Text>
          </Button>
          <Button
            accessibilityLabel="나가기 확정"
            disabled={pending}
            onPress={onConfirm}
            testID="leave-chat-confirm"
            variant="destructive">
            {pending ? (
              <ActivityIndicator color={spinnerColor} />
            ) : (
              <Text>나가기</Text>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
