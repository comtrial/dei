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
import { getMemberProfile } from '@/lib/room-rpc';
import {
  getCachedProfilePhotoUrl,
  resolveProfilePhotoUrl,
} from '@/lib/profile-photo-cache';

type TargetMember = {
  id: string;
  initial: string;
  nickname: string;
  photoUrl?: string;
};

function paramValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function BlockReportSheetScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    roomId?: string;
    targetAvatarUrl?: string;
    targetId?: string;
    targetNickname?: string;
  }>();
  const targetId = useMemo(() => paramValue(params.targetId), [params.targetId]);
  const roomIdValue = useMemo(() => paramValue(params.roomId), [params.roomId]);
  const paramNickname = useMemo(() => paramValue(params.targetNickname), [params.targetNickname]);
  const paramAvatarUrl = useMemo(() => paramValue(params.targetAvatarUrl), [params.targetAvatarUrl]);
  const activeRoomId = roomIdValue && isUuidLike(roomIdValue) ? roomIdValue : null;
  const validTargetId = targetId && isUuidLike(targetId) ? targetId : null;
  const isSelfTarget = user?.id != null && validTargetId === user.id;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [askReport, setAskReport] = useState(false);
  const [complete, setComplete] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(true);
  const [targetMember, setTargetMember] = useState<TargetMember>(() => {
    const nickname = paramNickname?.trim() || '상대';
    return {
      id: targetId ?? '',
      initial: toInitial(nickname),
      nickname,
      photoUrl: paramAvatarUrl,
    };
  });

  const canUseTarget = validTargetId != null && !isSelfTarget;
  const returnAfterComplete = useCallback(() => {
    if (activeRoomId) {
      router.replace(roomRoutes.index(activeRoomId));
      return;
    }

    router.replace(ROUTES.home);
  }, [activeRoomId, router]);

  const close = () => router.back();

  const reportRoute = useCallback(() => ({
    pathname: '/(app)/report/[targetId]' as const,
    params: {
      targetId: validTargetId ?? '',
      ...(activeRoomId ? { roomId: activeRoomId } : {}),
      ...(targetMember.nickname ? { targetNickname: targetMember.nickname } : {}),
      ...(targetMember.photoUrl ? { targetAvatarUrl: targetMember.photoUrl } : {}),
    },
  }), [activeRoomId, validTargetId, targetMember.nickname, targetMember.photoUrl]);

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.room_overflow_menu_opened);
  }, []);

  useEffect(() => {
    if (isSelfTarget) {
      router.replace(ROUTES.myProfile);
    }
  }, [isSelfTarget, router]);

  const openReportCategory = () => {
    if (isSelfTarget) {
      router.replace(ROUTES.myProfile);
      return;
    }

    if (!validTargetId) {
      setFailed(true);
      return;
    }

    setSheetVisible(false);
    router.replace(reportRoute());
  };

  useEffect(() => {
    if (!validTargetId || isSelfTarget) {
      return;
    }

    void logger.withErrorCapture(
      'safety.load-target-profile',
      async () => {
        if (activeRoomId) {
          const result = await getMemberProfile(validTargetId, activeRoomId);
          if (result?.profile?.nickname) {
            const photoUrl =
              result.profile.avatar_url ??
              getCachedProfilePhotoUrl(validTargetId, result.profile.photo_url) ??
              (result.profile.photo_url
                ? await resolveProfilePhotoUrl(
                    { path: result.profile.photo_url, userId: validTargetId },
                    { screen: 'block-report', roomId: activeRoomId },
                  )
                : null);

            setTargetMember({
              id: validTargetId,
              initial: toInitial(result.profile.nickname),
              nickname: result.profile.nickname,
              photoUrl: photoUrl ?? undefined,
            });
            return;
          }
        }

        const { data, error } = await supabase
          .from('profile')
          .select('nickname, photo_url')
          .eq('user_id', validTargetId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (data?.nickname) {
          const photoUrl = data.photo_url
            ? await resolveProfilePhotoUrl(
                { path: data.photo_url, userId: validTargetId },
                activeRoomId
                  ? { screen: 'block-report', roomId: activeRoomId }
                  : { screen: 'block-report' },
              )
            : null;

          setTargetMember({
            id: validTargetId,
            initial: toInitial(data.nickname),
            nickname: data.nickname,
            photoUrl: photoUrl ?? undefined,
          });
        }
      },
      { tags: { screen: 'block-report', action: 'load-target' } },
    );
  }, [activeRoomId, isSelfTarget, validTargetId]);

  useEffect(() => {
    if (!complete) {
      return;
    }

    const timer = setTimeout(returnAfterComplete, 900);
    return () => clearTimeout(timer);
  }, [complete, returnAfterComplete]);

  const handleBlock = () => {
    if (isSelfTarget) {
      router.replace(ROUTES.myProfile);
      return;
    }

    void logger.withErrorCapture(
      'safety.block-user',
      async () => {
        setIsSubmitting(true);

        if (user && validTargetId && !isSelfTarget) {
          const { error } = await supabase.from('block').upsert(
            {
              blocked_user_id: validTargetId,
              blocker_user_id: user.id,
              room_id: activeRoomId,
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
      <BottomSheet visible={sheetVisible} onClose={close} heightPct={56}>
        <View className="flex-1 px-[24px] pb-[18px] pt-[8px]">
          <SettingsRow
            variant="member"
            label={targetMember.nickname}
            initial={targetMember.initial}
            photoUrl={targetMember.photoUrl}
            className="px-0"
          />

          <View className="mt-[22px] overflow-hidden rounded-md border border-line bg-paper">
            <SettingsRow
              label="신고하기"
              disabled={!canUseTarget}
              onPress={openReportCategory}
              testID="block-report-open-report"
              className="px-[18px]"
            />
            <SettingsRow
              variant="danger"
              label={isSubmitting ? '차단 중' : '차단하기'}
              disabled={isSubmitting}
              onPress={() => {
                setSheetVisible(false);
                setConfirmBlock(true);
              }}
              testID="block-report-open-block-confirm"
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
          {
            label: '취소',
            variant: 'tertiary',
            onPress: () => {
              setConfirmBlock(false);
              setSheetVisible(true);
            },
          },
          {
            label: '차단하기',
            variant: 'ink',
            testID: 'block-report-confirm-submit',
            onPress: () => {
              setConfirmBlock(false);
              handleBlock();
            },
          },
        ]}
        onDismiss={() => {
          setConfirmBlock(false);
          setSheetVisible(true);
        }}
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
            testID: 'block-report-after-block-report',
            onPress: () => {
              if (!validTargetId) {
                setAskReport(false);
                setFailed(true);
                return;
              }

              setAskReport(false);
              setSheetVisible(false);
              router.replace(reportRoute());
            },
          },
          {
            label: '괜찮아요',
            variant: 'secondary',
            testID: 'block-report-after-block-skip',
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
        actions={[
          {
            label: '확인',
            variant: 'ink',
            onPress: () => {
              setFailed(false);
              setSheetVisible(true);
            },
          },
        ]}
        onDismiss={() => {
          setFailed(false);
          setSheetVisible(true);
        }}
      />
    </SafeAreaView>
  );
}
