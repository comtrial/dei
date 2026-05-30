import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logger } from '@dei/shared';
import { AlertDialog, BottomSheet, Button, SettingsRow, Text } from '@dei/ui';

import { isUuidLike, MOCK_TARGET_MEMBER } from '@/lib/b-flow';
import { reportRoutes, ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export default function BlockReportSheetScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ roomId?: string; targetId?: string }>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [failed, setFailed] = useState(false);

  const targetId = useMemo(
    () => params.targetId || MOCK_TARGET_MEMBER.id,
    [params.targetId],
  );
  const roomId = useMemo(() => params.roomId, [params.roomId]);

  const close = () => router.back();

  const handleBlock = () => {
    void logger.withErrorCapture(
      'safety.block-user',
      async () => {
        setIsSubmitting(true);

        if (user && isUuidLike(targetId)) {
          const { error } = await supabase.from('block').insert({
            blocked_user_id: targetId,
            blocker_user_id: user.id,
            room_id: isUuidLike(roomId) ? roomId : null,
          });

          if (error) {
            throw error;
          }
        }

        setComplete(true);
      },
      { tags: { screen: 'block-report', action: 'block' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'block-report', action: 'block-catch' },
        });
        setFailed(true);
      })
      .finally(() => setIsSubmitting(false));
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <BottomSheet visible onClose={close} heightPct={56}>
        <View className="flex-1 px-[24px] pb-[18px] pt-[8px]">
          <SettingsRow
            variant="member"
            label={MOCK_TARGET_MEMBER.nickname}
            value={MOCK_TARGET_MEMBER.sub}
            initial={MOCK_TARGET_MEMBER.initial}
            className="px-0"
          />

          <View className="mt-[22px]">
            <Text variant="h2" className="text-[20px] font-extrabold">
              어떤 조치를 할까요?
            </Text>
            <Text className="mt-[6px] text-[12.5px] leading-[19px] text-ink-3">
              차단하면 서로의 메시지와 매칭 노출이 제한돼요. 신고는 운영팀 검토 큐로 들어갑니다.
            </Text>
          </View>

          <View className="mt-[22px] gap-[10px]">
            <Button
              variant="accent"
              fullWidth
              onPress={() => router.push(reportRoutes.category(targetId))}
            >
              신고하기
            </Button>
            <Button
              variant="secondary"
              fullWidth
              disabled={isSubmitting}
              onPress={handleBlock}
            >
              {isSubmitting ? '차단 중' : '차단하기'}
            </Button>
            <Button variant="tertiary" fullWidth onPress={close}>
              닫기
            </Button>
          </View>
        </View>
      </BottomSheet>

      <AlertDialog
        visible={complete}
        tone="info"
        icon="i"
        title="차단했어요"
        description="실제 UUID 대상이 아니면 화면 흐름만 확인한 상태입니다."
        actions={[{ label: '확인', variant: 'ink', onPress: () => router.replace(ROUTES.home) }]}
        onDismiss={() => router.replace(ROUTES.home)}
      />

      <AlertDialog
        visible={failed}
        tone="warn"
        icon="!"
        title="차단하지 못했어요"
        description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setFailed(false) }]}
        onDismiss={() => setFailed(false)}
      />
    </SafeAreaView>
  );
}
