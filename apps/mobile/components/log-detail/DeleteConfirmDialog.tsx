import { useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { formatKoreanDate, formatTime } from '@/lib/formatters';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  recordedAt: string;
  willBecomeIncomplete: boolean;
  pending: boolean;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  date,
  recordedAt,
  willBecomeIncomplete,
  pending,
  onConfirm,
}: Props) {
  const [checked, setChecked] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) setChecked(false);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>이 로그를 삭제할까요?</DialogTitle>
        </DialogHeader>

        {/* 로그 정보 */}
        <View className="gap-1 py-1">
          <Text className="text-sm text-muted-foreground">
            {formatKoreanDate(date)} · {formatTime(recordedAt)} 에 촬영한 로그를 삭제합니다.
          </Text>
        </View>

        {/* 경고 안내 */}
        <View className="gap-1">
          <Text className="text-xs text-muted-foreground">• 이 영상은 되돌릴 수 없어요.</Text>
          <Text className="text-xs text-muted-foreground">• 삭제 후에도 같은 시간에 다시 촬영할 수 있어요.</Text>
          {willBecomeIncomplete && (
            <Text className="text-xs text-destructive">
              • 삭제 후 로그가 3개 미만이 되면 데일리 로그가 미완성이 돼요.
            </Text>
          )}
        </View>

        {/* 체크박스 확인 */}
        <Pressable
          onPress={() => setChecked((v) => !v)}
          className="flex-row items-center gap-2 py-1"
        >
          <View
            className={cn(
              'w-5 h-5 rounded border-2 items-center justify-center',
              checked ? 'bg-primary border-primary' : 'border-border'
            )}
          >
            {checked && <Text className="text-primary-foreground text-xs leading-none">✓</Text>}
          </View>
          <Text className="text-sm text-foreground">네, 이 로그를 삭제할게요</Text>
        </Pressable>

        <DialogFooter className="flex-row gap-2 justify-end">
          <Pressable
            onPress={() => handleOpenChange(false)}
            disabled={pending}
            className="px-4 py-2 rounded-lg active:opacity-70"
          >
            <Text className="text-muted-foreground">취소</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={!checked || pending}
            className={cn(
              'px-4 py-2 rounded-lg bg-destructive active:opacity-70',
              (!checked || pending) && 'opacity-40'
            )}
            testID="log-delete-confirm"
          >
            <Text className="text-white font-medium">
              {pending ? '삭제 중…' : '삭제'}
            </Text>
          </Pressable>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
