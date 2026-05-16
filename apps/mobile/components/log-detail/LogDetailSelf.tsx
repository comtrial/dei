import { useMemo, useState } from 'react';
import { Modal, Pressable, TouchableOpacity, View } from 'react-native';

import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useLogDetail } from '@/hooks/useLogDetail';
import { cn } from '@/lib/utils';
import { formatKoreanDate, formatTime } from '@/lib/formatters';

import { LogDetailSkeleton } from './LogDetailSkeleton';
import { ProgressDots } from './ProgressDots';
import { SequentialPlayer } from './SequentialPlayer';

interface Props {
  userId: string;
  date: string;
  startLogId?: string;
}

function DeleteSheet({
  open,
  onClose,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  if (!open) return null;
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />
      <SafeAreaView edges={['bottom']} className="bg-background rounded-t-2xl">
        <View className="px-4 py-2">
          <View className="w-10 h-1 bg-muted rounded-full self-center mb-4" />
          <TouchableOpacity onPress={onDelete} className="py-4">
            <Text className="text-destructive text-base">이 로그 삭제</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export function LogDetailSelf({ userId, date, startLogId }: Props) {
  const router = useRouter();
  const { logs, index, current, status, loading, next } = useLogDetail({
    userId,
    date,
    startLogId,
  });
  const [moreOpen, setMoreOpen] = useState(false);

  const willBecomeIncomplete = useMemo(() => {
    if (!current) return false;
    const before = new Set(logs.map((l) => l.hour_slot));
    const after = new Set(logs.filter((l) => l.id !== current.id).map((l) => l.hour_slot));
    return before.size >= 3 && after.size < 3;
  }, [logs, current]);

  if (loading || !current) return <LogDetailSkeleton />;

  function handleDeletePress() {
    setMoreOpen(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (router.push as any)({
      pathname: '/log-detail/delete-confirm',
      params: { logId: current!.id, userId, date, willBecomeIncomplete: willBecomeIncomplete ? '1' : '0' },
    });
  }

  return (
    <View className="flex-1 bg-black">
      <SequentialPlayer logs={logs} index={index} onComplete={next} onTap="toggle" />

      {/* 상단 헤더 */}
      <SafeAreaView edges={['top']} className="absolute top-0 left-0 right-0">
        <View className="flex-row items-center justify-between px-4 py-2">
          <Pressable onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text className="text-white text-2xl">‹</Text>
          </Pressable>
          <View className="flex-row items-center gap-2">
            <Text className="text-white text-sm">{formatKoreanDate(date)}</Text>
            <View
              className={cn(
                'rounded-full px-2 py-0.5',
                status === 'COMPLETED' ? 'bg-primary' : 'bg-white/30'
              )}
            >
              <Text className="text-white text-[10px]">
                {status === 'COMPLETED' ? '완성' : '미완성'}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => setMoreOpen(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            testID="log-detail-more"
          >
            <Text className="text-white text-xl">⋯</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {/* 하단 컨트롤 */}
      <SafeAreaView edges={['bottom']} className="absolute bottom-0 left-0 right-0">
        <View className="px-6 pb-4 gap-3">
          <ProgressDots total={logs.length} current={index} />
          <Text className="text-white text-sm text-center">
            {formatTime(current.recorded_at)}
          </Text>
        </View>
      </SafeAreaView>

      <DeleteSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onDelete={handleDeletePress}
      />
    </View>
  );
}
