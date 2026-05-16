import { useState } from 'react';
import { View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { DeleteConfirmDialog } from '@/components/log-detail/DeleteConfirmDialog';
import { Toast } from '@/components/ui/toast';
import { useDeleteLog } from '@/hooks/useDeleteLog';
import { useLogDetail } from '@/hooks/useLogDetail';

export default function DeleteConfirmRoute() {
  const router = useRouter();
  const { logId, userId, date, willBecomeIncomplete } = useLocalSearchParams<{
    logId: string;
    userId: string;
    date: string;
    willBecomeIncomplete: string;
  }>();

  const { logs } = useLogDetail({ userId, date });
  const current = logs.find((l) => l.id === logId) ?? null;

  const { deleteLog, pending } = useDeleteLog();
  const [confirmOpen, setConfirmOpen] = useState(true);
  const [toastVisible, setToastVisible] = useState(false);

  async function handleConfirm() {
    if (!current) return;
    const result = await deleteLog({
      logId: current.id,
      videoUrl: current.video_url,
      date,
      userId,
    });

    setConfirmOpen(false);

    if (result.kind === 'error') {
      router.back();
      return;
    }

    if (result.kind === 'ok-day-empty') {
      router.dismiss(2);
      return;
    }

    if (willBecomeIncomplete === '1') {
      setToastVisible(true);
    } else {
      router.back();
    }
  }

  return (
    <View className="flex-1">
      <DeleteConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) router.back();
          setConfirmOpen(open);
        }}
        date={date}
        recordedAt={current?.recorded_at ?? new Date().toISOString()}
        willBecomeIncomplete={willBecomeIncomplete === '1'}
        pending={pending}
        onConfirm={handleConfirm}
      />
      <Toast
        message="데일리 로그가 미완성 되었어요"
        subMessage="같은 날 로그가 3개 이상 모이면 완성 돼요"
        visible={toastVisible}
        onHide={() => {
          setToastVisible(false);
          router.dismiss(2);
        }}
      />
    </View>
  );
}
