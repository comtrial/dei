import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger } from '@dei/shared';
import {
  AlertDialog,
  Banner,
  BottomActionBar,
  Button,
  Checkbox,
  ChoiceList,
  SettingsRow,
  Text,
  Textarea,
  TopNav,
} from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import {
  isUuidLike,
  reportCategoryOptions,
  toInitial,
} from '@/lib/b-flow';
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

export default function ReportCategoryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    roomId?: string;
    targetAvatarUrl?: string;
    targetId?: string;
    targetNickname?: string;
  }>();
  const targetIdValue = paramValue(params.targetId);
  const roomIdValue = paramValue(params.roomId);
  const paramNickname = paramValue(params.targetNickname);
  const paramAvatarUrl = paramValue(params.targetAvatarUrl);
  const activeRoomId = roomIdValue && isUuidLike(roomIdValue) ? roomIdValue : null;
  const validTargetId = targetIdValue && isUuidLike(targetIdValue) ? targetIdValue : null;
  const [category, setCategory] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [blockToo, setBlockToo] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [failed, setFailed] = useState(false);
  const [targetMember, setTargetMember] = useState<TargetMember>(() => {
    const nickname = paramNickname?.trim() || '상대';
    return {
      id: targetIdValue ?? '',
      initial: toInitial(nickname),
      nickname,
      photoUrl: paramAvatarUrl,
    };
  });

  const needsDetail = category === 'other';
  const canUseTarget = validTargetId != null;
  const canSubmit = canUseTarget && !!category && (!needsDetail || detail.trim().length > 0);
  const returnAfterComplete = useCallback(() => {
    if (activeRoomId) {
      router.replace(roomRoutes.index(activeRoomId));
      return;
    }

    router.replace(ROUTES.home);
  }, [activeRoomId, router]);

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.report_category_entered);
  }, []);

  useEffect(() => {
    if (!validTargetId) {
      return;
    }

    void logger.withErrorCapture(
      'safety.load-report-target',
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
                    { screen: 'report-category', roomId: activeRoomId },
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
                  ? { screen: 'report-category', roomId: activeRoomId }
                  : { screen: 'report-category' },
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
      { tags: { screen: 'report-category', action: 'load-target' } },
    );
  }, [activeRoomId, validTargetId]);

  useEffect(() => {
    if (!complete) {
      return;
    }

    const timer = setTimeout(returnAfterComplete, 900);
    return () => clearTimeout(timer);
  }, [complete, returnAfterComplete]);

  const handleSubmit = () => {
    if (!canSubmit || isSubmitting) {
      return;
    }

    void logger.withErrorCapture(
      'safety.submit-report',
      async () => {
        setIsSubmitting(true);

        if (user && validTargetId) {
          const { error: reportError } = await supabase.from('report').insert({
            category: category!,
            detail: detail.trim() || null,
            reported_user_id: validTargetId,
            reporter_user_id: user.id,
            room_id: activeRoomId,
          });

          if (reportError) {
            throw reportError;
          }

          if (blockToo) {
            const { error: blockError } = await supabase.from('block').upsert(
              {
                blocked_user_id: validTargetId,
                blocker_user_id: user.id,
                room_id: activeRoomId,
                unblocked_at: null,
              },
              { onConflict: 'blocker_user_id,blocked_user_id' },
            );

            if (blockError) {
              throw blockError;
            }
          }
        }

        analytics.capture(ANALYTICS_EVENTS.report_submitted, {
          category,
          with_block: blockToo,
        });
        setComplete(true);
      },
      { tags: { screen: 'report-category', action: 'submit' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'report-category', action: 'submit-catch' },
        });
        setFailed(true);
      })
      .finally(() => setIsSubmitting(false));
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav title="신고하기" onLeftPress={() => router.back()} />

      <ScrollView className="flex-1 bg-bg">
        <View className="px-[24px] pb-[128px] pt-[22px]">
          <SettingsRow
            variant="member"
            label={targetMember.nickname}
            initial={targetMember.initial}
            photoUrl={targetMember.photoUrl}
            className="mb-[22px] px-0"
          />

          <Text variant="h1" className="text-[25px] leading-[33px]">
            어떤 점이 불편했나요?
          </Text>
          <Text className="mt-[8px] text-[13.5px] leading-[20px] text-ink-3">
            신고 시 운영팀이 검토합니다.
          </Text>

          <ChoiceList
            tone="accent"
            value={category}
            onChange={setCategory}
            options={reportCategoryOptions().map((option) => ({
              ...option,
              conditionalInput:
                option.value === 'other' ? (
                  <Textarea
                    value={detail}
                    onChangeText={setDetail}
                    maxLength={300}
                    showCount
                    placeholder="무슨 일이 있었는지 적어주세요"
                  />
                ) : undefined,
            }))}
            className="mt-[24px]"
          />

          <Pressable
            testID="report-block-too-toggle"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: blockToo }}
            onPress={() => setBlockToo((value) => !value)}
            className="mt-[18px] flex-row items-center gap-[10px]"
          >
            <Checkbox checked={blockToo} variant="square" />
            <Text className="flex-1 text-[13px] leading-[19px] text-ink-2">
              신고 제출 후 이 사용자를 함께 차단할게요.
            </Text>
          </Pressable>

          <Banner tone="info" icon="i" title="무알림 정책" className="mt-[22px]">
            상대에게 알림이 가지 않아요. 조회 기록도 남지 않습니다.
          </Banner>
        </View>
      </ScrollView>

      <BottomActionBar fixed>
        <Button
          testID="report-submit"
          fullWidth
          disabled={!canSubmit || isSubmitting}
          onPress={handleSubmit}
        >
          {isSubmitting ? '제출 중' : '신고 제출'}
        </Button>
      </BottomActionBar>

      <AlertDialog
        visible={failed}
        tone="warn"
        icon="!"
        title="신고를 제출하지 못했어요"
        description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setFailed(false) }]}
        onDismiss={() => setFailed(false)}
      />

      {complete ? (
        <View className="absolute bottom-[34px] left-0 right-0 items-center px-[24px]">
          <View className="rounded-full bg-ink px-[16px] py-[10px]">
            <Text className="text-center text-[12.5px] font-bold text-white">
              신고 접수됐어요. 운영팀이 검토합니다.
            </Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
