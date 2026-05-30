import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
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
  Text,
  Textarea,
  TopNav,
} from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { isUuidLike, reportCategoryOptions } from '@/lib/b-flow';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export default function ReportCategoryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { targetId, roomId } = useLocalSearchParams<{ roomId?: string; targetId?: string }>();
  const [category, setCategory] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [blockToo, setBlockToo] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [failed, setFailed] = useState(false);

  const needsDetail = category === 'other';
  const canSubmit = !!category && (!needsDetail || detail.trim().length > 0);

  const handleSubmit = () => {
    if (!canSubmit || isSubmitting) {
      return;
    }

    void logger.withErrorCapture(
      'safety.submit-report',
      async () => {
        setIsSubmitting(true);

        if (user && isUuidLike(targetId)) {
          const reportedUserId = (Array.isArray(targetId) ? targetId[0] : targetId) ?? '';
          const activeRoomId = isUuidLike(roomId) ? (Array.isArray(roomId) ? roomId[0] : roomId) : null;

          const { error: reportError } = await supabase.from('report').insert({
            category: category!,
            detail: detail.trim() || null,
            reported_user_id: reportedUserId,
            reporter_user_id: user.id,
            room_id: activeRoomId,
          });

          if (reportError) {
            throw reportError;
          }

          if (blockToo) {
            const { error: blockError } = await supabase.from('block').insert({
              blocked_user_id: reportedUserId,
              blocker_user_id: user.id,
              room_id: activeRoomId,
            });

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
          <Text variant="h1" className="text-[25px] leading-[33px]">
            신고 사유를 선택해주세요
          </Text>
          <Text className="mt-[8px] text-[13.5px] leading-[20px] text-ink-3">
            선택한 내용은 상대에게 공개되지 않고 운영팀 검토 큐로만 전달돼요.
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

          {category && category !== 'other' ? (
            <Textarea
              value={detail}
              onChangeText={setDetail}
              maxLength={300}
              showCount
              placeholder="추가 설명이 있다면 적어주세요"
              className="mt-[12px]"
            />
          ) : null}

          <Pressable
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

          <Banner tone="info" icon="i" title="자동 정지는 하지 않아요" className="mt-[22px]">
            계정 정지는 자동 처리하지 않고 운영팀 검토 후 판단합니다.
          </Banner>
        </View>
      </ScrollView>

      <BottomActionBar fixed>
        <Button fullWidth disabled={!canSubmit || isSubmitting} onPress={handleSubmit}>
          {isSubmitting ? '제출 중' : '신고 제출'}
        </Button>
      </BottomActionBar>

      <AlertDialog
        visible={complete}
        tone="info"
        icon="i"
        title="신고를 접수했어요"
        description="운영팀이 내용을 확인할게요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => router.replace(ROUTES.home) }]}
        onDismiss={() => router.replace(ROUTES.home)}
      />

      <AlertDialog
        visible={failed}
        tone="warn"
        icon="!"
        title="신고를 제출하지 못했어요"
        description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setFailed(false) }]}
        onDismiss={() => setFailed(false)}
      />
    </SafeAreaView>
  );
}
