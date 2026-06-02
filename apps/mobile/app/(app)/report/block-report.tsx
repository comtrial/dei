import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger } from '@dei/shared';
import { AlertDialog, Banner, BottomSheet, Button, SettingsRow } from '@dei/ui';

import { isUuidLike, toInitial } from '@/lib/b-flow';
import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { roomRoutes, ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type TargetMember = {
  id: string;
  initial: string;
  nickname: string;
};

export default function BlockReportSheetScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ roomId?: string; targetId?: string }>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [askReport, setAskReport] = useState(false);
  const [complete, setComplete] = useState(false);
  const [failed, setFailed] = useState(false);
  const [targetMember, setTargetMember] = useState<TargetMember>({
    id: '',
    initial: '?',
    nickname: '상대',
  });

  const targetId = useMemo(() => Array.isArray(params.targetId) ? params.targetId[0] : params.targetId, [params.targetId]);
  const roomId = useMemo(() => params.roomId, [params.roomId]);
  const roomIdValue = useMemo(() => Array.isArray(roomId) ? roomId[0] : roomId, [roomId]);
  const canUseTarget = isUuidLike(targetId);
  const returnAfterComplete = useCallback(() => {
    if (isUuidLike(roomIdValue)) {
      router.replace(roomRoutes.index(roomIdValue));
      return;
    }

    router.replace(ROUTES.home);
  }, [roomIdValue, router]);

  const close = () => router.back();

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.room_overflow_menu_opened);
  }, []);

  const openReportCategory = () => {
    if (!canUseTarget || !targetId) {
      setFailed(true);
      return;
    }

    router.push({
      pathname: '/(app)/report/[targetId]',
      params: {
        targetId,
        ...(isUuidLike(roomIdValue) ? { roomId: roomIdValue } : {}),
      },
    });
  };

  useEffect(() => {
    if (!isUuidLike(targetId)) {
      return;
    }

    void logger.withErrorCapture(
      'safety.load-target-profile',
      async () => {
        const { data, error } = await supabase
          .from('profile')
          .select('nickname')
          .eq('user_id', targetId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (data?.nickname) {
          setTargetMember({
            id: targetId,
            initial: toInitial(data.nickname),
            nickname: data.nickname,
          });
        }
      },
      { tags: { screen: 'block-report', action: 'load-target' } },
    );
  }, [targetId]);

  useEffect(() => {
    if (!complete) {
      return;
    }

    const timer = setTimeout(returnAfterComplete, 900);
    return () => clearTimeout(timer);
  }, [complete, returnAfterComplete]);

  const handleBlock = () => {
    void logger.withErrorCapture(
      'safety.block-user',
      async () => {
        setIsSubmitting(true);

        if (user && canUseTarget && targetId) {
          const { error } = await supabase.from('block').upsert(
            {
              blocked_user_id: targetId,
              blocker_user_id: user.id,
              room_id: isUuidLike(roomIdValue) ? roomIdValue : null,
              unblocked_at: null,
            },
            { onConflict: 'blocker_user_id,blocked_user_id' },
          );

          if (error) {
            throw error;
          }
        }

        setAskReport(true);
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
            label={targetMember.nickname}
            initial={targetMember.initial}
            className="px-0"
          />

          <View className="mt-[22px] overflow-hidden rounded-md border border-line bg-paper">
            <SettingsRow
              label="신고하기"
              disabled={!canUseTarget}
              onPress={openReportCategory}
              className="px-[18px]"
            />
            <SettingsRow
              variant="danger"
              label={isSubmitting ? '차단 중' : '차단하기'}
              disabled={isSubmitting}
              onPress={() => setConfirmBlock(true)}
              className="px-[18px]"
            />
          </View>

          <Banner tone="info" icon="i" title="무알림 정책" className="mt-[18px]">
            차단·신고 시 상대에게 알림이 가지 않아요. 조회 기록도 남지 않습니다.
          </Banner>

          <View className="mt-auto pt-[14px]">
            <Button variant="tertiary" fullWidth onPress={close}>
              취소
            </Button>
          </View>
        </View>
      </BottomSheet>

      <AlertDialog
        visible={confirmBlock}
        tone="danger"
        icon="!"
        title="정말 차단할까요?"
        description="차단은 영구 적용되며 해제할 수 없어요. 서로의 영상과 채팅이 보이지 않습니다."
        actions={[
          { label: '취소', variant: 'tertiary', onPress: () => setConfirmBlock(false) },
          {
            label: '차단하기',
            variant: 'ink',
            onPress: () => {
              setConfirmBlock(false);
              handleBlock();
            },
          },
        ]}
        onDismiss={() => setConfirmBlock(false)}
      />

      <AlertDialog
        visible={askReport}
        tone="info"
        icon="i"
        title="신고도 함께 하시겠어요?"
        description="차단한 이유를 운영팀에 보내면 검토에 도움이 돼요."
        actions={[
          {
            label: '신고하기',
            variant: 'ink',
            onPress: () => {
              if (!canUseTarget || !targetId) {
                setAskReport(false);
                setFailed(true);
                return;
              }

              router.replace({
                pathname: '/(app)/report/[targetId]',
                params: {
                  targetId,
                  ...(isUuidLike(roomIdValue) ? { roomId: roomIdValue } : {}),
                },
              });
            },
          },
          {
            label: '괜찮아요',
            variant: 'secondary',
            onPress: () => {
              setAskReport(false);
              setComplete(true);
            },
          },
        ]}
        onDismiss={() => {
          setAskReport(false);
          setComplete(true);
        }}
      />

      <AlertDialog
        visible={complete}
        tone="info"
        icon="i"
        title="차단했어요"
        description="상대에게 알림이 가지 않아요."
        actions={[{ label: '확인', variant: 'ink', onPress: returnAfterComplete }]}
        onDismiss={returnAfterComplete}
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
