import { useState } from 'react';
import { Modal, Pressable, TouchableOpacity, View } from 'react-native';

import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useLogDetail } from '@/hooks/useLogDetail';
import { formatKoreanDate, formatTime } from '@/lib/formatters';

import { LogDetailSkeleton } from './LogDetailSkeleton';
import { ProgressDots } from './ProgressDots';
import { SequentialPlayer } from './SequentialPlayer';

interface Props {
  userId: string;
  date: string;
  startLogId?: string;
  nickname?: string;
}

function MoreSheet({
  open,
  onClose,
  onReport,
  onBlock,
}: {
  open: boolean;
  onClose: () => void;
  onReport: () => void;
  onBlock: () => void;
}) {
  if (!open) return null;
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />
      <SafeAreaView edges={['bottom']} className="bg-background rounded-t-2xl">
        <View className="px-4 py-2">
          <View className="w-10 h-1 bg-muted rounded-full self-center mb-4" />
          <TouchableOpacity
            onPress={onReport}
            className="py-4 border-b border-border"
          >
            <Text className="text-foreground text-base">신고</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onBlock} className="py-4">
            <Text className="text-destructive text-base">차단</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export function LogDetailOther({ userId, date, startLogId, nickname }: Props) {
  const router = useRouter();
  const { logs, index, current, loading, next } = useLogDetail({
    userId,
    date,
    startLogId,
  });
  const [moreOpen, setMoreOpen] = useState(false);

  if (loading || !current) return <LogDetailSkeleton />;

  return (
    <View className="flex-1 bg-black">
      <SequentialPlayer logs={logs} index={index} onComplete={next} onTap="toggle" />

      {/* 상단 헤더 */}
      <SafeAreaView edges={['top']} className="absolute top-0 left-0 right-0">
        <View className="flex-row items-center justify-between px-4 py-2">
          <Pressable
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text className="text-white text-2xl">‹</Text>
          </Pressable>
          <View className="items-center">
            {nickname && (
              <Text className="text-white text-sm font-semibold">{nickname}</Text>
            )}
            <Text className="text-white/70 text-xs">{formatKoreanDate(date)}</Text>
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
        <View className="px-6 pb-6 gap-3">
          <ProgressDots total={logs.length} current={index} />
          <Text className="text-white text-sm text-center">{formatTime(current.recorded_at)}</Text>
        </View>
      </SafeAreaView>

      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onReport={() => {
          setMoreOpen(false);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (router.push as any)({
            pathname: '/profile/[id]',
            params: { id: userId, action: 'report' },
          });
        }}
        onBlock={() => {
          setMoreOpen(false);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (router.push as any)({
            pathname: '/profile/[id]',
            params: { id: userId, action: 'block' },
          });
        }}
      />
    </View>
  );
}
