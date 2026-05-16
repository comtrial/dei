import { useVideoPlayer, VideoView } from 'expo-video';
import { TouchableOpacity, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { ProfileLogDay, ProfileLogItem } from '@/lib/profileLogs';

type ProfileLogFeedProps = {
  days: ProfileLogDay[];
  emptyMessage?: string;
  onLogPress?: (log: ProfileLogItem) => void;
};

function formatRecordedTime(recordedAt: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(new Date(recordedAt));
}

function ProfileLogCard({
  log,
  onPress,
}: {
  log: ProfileLogItem;
  onPress?: (log: ProfileLogItem) => void;
}) {
  const player = useVideoPlayer(log.videoUrl || null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      className="overflow-hidden rounded-md bg-black"
      disabled={!onPress}
      onPress={() => onPress?.(log)}
      style={{ aspectRatio: 3 / 4 }}
      testID={`profile-log-card-${log.id}`}
    >
      <VideoView
        contentFit="cover"
        nativeControls={false}
        player={player}
        style={{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}
      />

      <View className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-8">
        <View className="self-start rounded-md bg-black/55 px-2.5 py-1">
          <Text className="text-xs font-semibold text-white">
            {log.slotLabel} · {formatRecordedTime(log.recordedAt)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function ProfileLogFeed({
  days,
  emptyMessage = '아직 올린 로그가 없어요.',
  onLogPress,
}: ProfileLogFeedProps) {
  if (days.length === 0) {
    return (
      <View className="rounded-md border border-border bg-card px-4 py-8">
        <Text className="text-center text-sm text-muted-foreground">{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View className="gap-7">
      {days.map((day) => (
        <View className="gap-3" key={day.date}>
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-base font-semibold">{day.displayDate}</Text>
            <View
              className={
                day.isDailyLogComplete
                  ? 'rounded-md bg-primary px-2.5 py-1'
                  : 'rounded-md bg-muted px-2.5 py-1'
              }
            >
              <Text
                className={
                  day.isDailyLogComplete
                    ? 'text-xs font-semibold text-primary-foreground'
                    : 'text-xs font-semibold text-muted-foreground'
                }
              >
                {day.isDailyLogComplete
                  ? '데일리 로그 완성'
                  : `${day.completedLogCount}/3 미완성`}
              </Text>
            </View>
          </View>

          <View className="gap-3">
            {day.logs.map((log) => (
              <ProfileLogCard key={log.id} log={log} onPress={onLogPress} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
