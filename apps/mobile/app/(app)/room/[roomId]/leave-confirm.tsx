import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { logger } from '@dei/shared';
import {
  AlertDialog,
  Banner,
  BottomSheet,
  Button,
  ChoiceList,
  Text,
  Textarea,
} from '@dei/ui';

import { isUuidLike, LEAVE_REASONS } from '@/lib/b-flow';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';

export default function RoomLeaveConfirmScreen() {
  const router = useRouter();
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

        if (isUuidLike(roomId)) {
          const roomIdValue = Array.isArray(roomId) ? roomId[0] : roomId;
          const { error } = await supabase.functions.invoke('leave-room', {
            body: {
              detail: detail.trim() || undefined,
              reason,
              roomId: roomIdValue,
            },
          });

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
    // transparentModal 라우트(_layout) 위에 뜨므로 화면 본체는 투명 — 뒤의 실제 방
    // 화면이 비친 채 BottomSheet 의 scrim(bg-black/55)만 어둡게 깔린다.
    <View className="flex-1">
      <BottomSheet visible heightPct={78} onClose={() => router.back()}>
        <ScrollView className="flex-1 px-[24px] pt-[14px]">
          <Text variant="h2" className="text-center text-[22px] font-extrabold">
            정말 방을 나가시겠어요?
          </Text>
          <Text className="mt-[8px] text-center text-[15.5px] leading-[20px] text-ink-3">
            한 번 나가면 같은 방으로 돌아올 수 없어요.
          </Text>

          <Banner tone="danger" icon="!" title="다음 매칭은 12시간 후부터 가능해요">
            바로 다시 매칭하려면 부스터가 필요해요. 마지막 멤버가 나가면 방의 모든 영상·채팅이 영구 소멸돼요.
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
            className="mt-[22px]"
          />

          {reason === 'bad_member' ? (
            <Banner tone="info" icon="i" title="멤버만 따로 처리할 수도 있어요">
              차단·신고로 그 멤버만 처리할 수 있어요. 그래도 방 나가기는 계속 진행할 수 있어요.
            </Banner>
          ) : null}

          <View className="pb-[22px] pt-[18px]">
            <Button
              testID="room-leave-submit"
              fullWidth
              variant="ink"
              disabled={!canLeave || isLeaving}
              onPress={handleLeave}
              accessibilityLabel="방 나가기"
              className="rounded-full bg-danger"
              textClassName="text-[15px] font-extrabold"
            >
              {isLeaving ? '나가는 중' : '방 나가기'}
            </Button>
          </View>
        </ScrollView>
      </BottomSheet>

      <AlertDialog
        visible={failed}
        tone="warn"
        icon="!"
        title="방을 나가지 못했어요"
        description="잠시 후 다시 시도해주세요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setFailed(false) }]}
        onDismiss={() => setFailed(false)}
      />
    </View>
  );
}
