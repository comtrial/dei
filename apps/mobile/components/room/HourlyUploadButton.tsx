/**
 * HourlyUploadButton — 방 피드 화면 우하단 FAB.
 *
 * 누르면 `room/[roomId]/upload` 화면으로 이동.
 * 이미 이 슬롯에 업로드 했으면 "이미 올렸어요" 상태로 표시.
 */
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';

type Props = {
  roomId: string;
  /** 현재 KST 시간 슬롯에 이미 업로드했는지 */
  alreadyUploadedThisSlot?: boolean;
};

export function HourlyUploadButton({ roomId, alreadyUploadedThisSlot }: Props) {
  const router = useRouter();

  return (
    <Pressable
      testID="room-hourly-upload-button"
      onPress={() => {
        if (!alreadyUploadedThisSlot) {
          router.push(`/room/${roomId}/upload` as never);
        }
      }}
      className={[
        'rounded-full w-16 h-16 items-center justify-center shadow-lg',
        alreadyUploadedThisSlot ? 'bg-muted' : 'bg-primary active:opacity-80',
      ].join(' ')}>
      <View className="items-center">
        <Text
          className={[
            'text-2xl',
            alreadyUploadedThisSlot ? 'text-muted-foreground' : 'text-primary-foreground',
          ].join(' ')}>
          {alreadyUploadedThisSlot ? '✓' : '+'}
        </Text>
      </View>
    </Pressable>
  );
}
