import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logger } from '@dei/shared';
import {
  AlertDialog,
  Banner,
  BottomActionBar,
  ChoiceList,
  SlideToConfirm,
  Text,
  Textarea,
  TopNav,
} from '@dei/ui';

import { isUuidLike, LEAVE_REASONS } from '@/lib/b-flow';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export default function RoomLeaveConfirmScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [isLeaving, setIsLeaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const canLeave = !!reason && (reason !== 'other' || detail.trim().length > 0);

  const handleLeave = () => {
    if (!canLeave || isLeaving) {
      return;
    }

    void logger.withErrorCapture(
      'room.leave',
      async () => {
        setIsLeaving(true);

        if (user && isUuidLike(roomId)) {
          const { error } = await supabase
            .from('room_member')
            .update({ left_at: new Date().toISOString(), status: 'left' })
            .eq('room_id', Array.isArray(roomId) ? roomId[0] : roomId)
            .eq('user_id', user.id);

          if (error) {
            throw error;
          }
        }

        router.replace(ROUTES.home);
      },
      { tags: { screen: 'room-leave-confirm', action: 'leave' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'room-leave-confirm', action: 'leave-catch' },
        });
        setFailed(true);
      })
      .finally(() => setIsLeaving(false));
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav title="방 나가기" onLeftPress={() => router.back()} />

      <ScrollView className="flex-1 bg-bg">
        <View className="px-[24px] pb-[128px] pt-[22px]">
          <Text variant="h1" className="text-[25px] leading-[33px]">
            정말 방을 나갈까요?
          </Text>
          <Text className="mt-[8px] text-[13.5px] leading-[20px] text-ink-3">
            나가면 이 방의 대화와 영상 흐름으로 다시 돌아올 수 없어요.
          </Text>

          <Banner tone="danger" icon="!" title="24시간 재매칭 제한">
            방을 나가면 일정 시간 동안 새 매칭이 제한될 수 있어요.
          </Banner>

          <ChoiceList
            value={reason}
            onChange={setReason}
            options={LEAVE_REASONS.map((item) => ({
              ...item,
              conditionalInput:
                item.value === 'other' ? (
                  <Textarea
                    value={detail}
                    onChangeText={setDetail}
                    maxLength={160}
                    showCount
                    placeholder="사유를 적어주세요"
                  />
                ) : undefined,
            }))}
            className="mt-[24px]"
          />
        </View>
      </ScrollView>

      <BottomActionBar fixed>
        <SlideToConfirm
          tone="ink"
          disabled={!canLeave || isLeaving}
          onConfirm={handleLeave}
          label={isLeaving ? '나가는 중' : '길게 눌러 방 나가기'}
          className={!canLeave || isLeaving ? 'opacity-40' : undefined}
        />
      </BottomActionBar>

      <AlertDialog
        visible={failed}
        tone="warn"
        icon="!"
        title="방을 나가지 못했어요"
        description="잠시 후 다시 시도해주세요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setFailed(false) }]}
        onDismiss={() => setFailed(false)}
      />
    </SafeAreaView>
  );
}
