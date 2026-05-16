import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Text } from '@/components/ui/text';
import { Pressable } from 'react-native';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function IncompleteSwitchDialog({ open, onOpenChange, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`이 날짜의 데일리 로그가\n미완성 상태가 되었어요`}</DialogTitle>
          <DialogDescription>
            {`남은 로그는 프로필 날짜별 로그에 그대로 남아있어요.\n서로 다른 시간대에 3개 이상 모이면 다시 완성 상태가 됩니다.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Pressable
            onPress={onConfirm}
            className="bg-primary rounded-xl px-6 py-3 items-center active:opacity-80"
          >
            <Text className="text-primary-foreground font-medium">확인</Text>
          </Pressable>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
