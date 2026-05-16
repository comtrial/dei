import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Text } from '@/components/ui/text';
import { type SendLikeError, useSendLike } from '@/hooks/useSendLike';
import { useTodayLogs } from '@/hooks/useTodayLogs';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toUserId: string;
}

function LogThumb({
  videoUrl,
  hourSlot,
  selected,
  onPress,
}: {
  videoUrl: string;
  hourSlot: number;
  selected: boolean;
  onPress: () => void;
}) {
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = true;
    p.pause();
  });

  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'w-20 h-28 rounded-xl overflow-hidden border-2 mr-2',
        selected ? 'border-primary' : 'border-transparent'
      )}
    >
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        nativeControls={false}
      />
      <View className="absolute bottom-1 left-1 bg-black/60 rounded px-1.5 py-0.5">
        <Text className="text-white text-[10px]">{hourSlot}시</Text>
      </View>
      {selected && (
        <View className="absolute top-1 right-1 bg-primary rounded-full w-5 h-5 items-center justify-center">
          <Text className="text-white text-[10px] font-bold">✓</Text>
        </View>
      )}
    </Pressable>
  );
}

function sendErrorMessage(reason: SendLikeError): string {
  switch (reason) {
    case 'no_video_history':
      return '영상을 먼저 1개 이상 올려주세요';
    case 'daily_quota_exceeded':
      return '오늘 사용할 수 있는 좋아요를 다 썼어요';
    case 'already_pending':
      return '이미 좋아요를 보냈어요';
    case 'already_matched':
      return '이미 매칭된 사이예요';
    case 'attached_log_not_owned':
      return '첨부할 수 없는 로그예요';
    default:
      return '전송에 실패했어요. 잠시 후 다시 시도해주세요';
  }
}

export function SendLikeModal({ open, onOpenChange, toUserId }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const { items: todayLogs, loading } = useTodayLogs(user?.id);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const { send, pending } = useSendLike();

  async function handleSend() {
    const result = await send({ toUserId, attachedLogId: selectedLogId });
    if (result.kind === 'ok') {
      onOpenChange(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (router.replace as any)('/(app)/likes?tab=sent');
    } else {
      Alert.alert('알림', sendErrorMessage(result.reason));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>좋아요를 보내요</DialogTitle>
          <DialogDescription>
            오늘 올린 로그 중 하나를 선택해 함께 보낼 수 있어요.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <View className="h-28 items-center justify-center">
            <Text className="text-muted-foreground text-sm">불러오는 중…</Text>
          </View>
        ) : todayLogs.length === 0 ? (
          <View className="h-28 items-center justify-center">
            <Text className="text-muted-foreground text-sm">오늘 올린 로그가 없어요</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="py-2"
          >
            {todayLogs.map((log) => (
              <LogThumb
                key={log.id}
                videoUrl={log.video_url}
                hourSlot={log.hour_slot}
                selected={selectedLogId === log.id}
                onPress={() =>
                  setSelectedLogId((prev) => (prev === log.id ? null : log.id))
                }
              />
            ))}
          </ScrollView>
        )}

        <Pressable
          onPress={() => setSelectedLogId(null)}
          className={cn(
            'rounded-xl py-2 px-4 items-center',
            selectedLogId === null ? 'bg-muted' : 'bg-transparent'
          )}
        >
          <Text
            className={cn(
              'text-sm',
              selectedLogId === null ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            선택 안 함
          </Text>
        </Pressable>

        <DialogFooter>
          <Pressable
            onPress={handleSend}
            disabled={pending}
            className={cn(
              'bg-primary rounded-xl py-3 items-center active:opacity-80',
              pending && 'opacity-50'
            )}
            testID="send-like-submit"
          >
            <Text className="text-primary-foreground font-medium">
              {pending ? '보내는 중…' : '좋아요 보내기'}
            </Text>
          </Pressable>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
