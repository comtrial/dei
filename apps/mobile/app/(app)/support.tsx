import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { analytics, logger } from '@dei/shared';
import {
  AlertDialog,
  Banner,
  BottomActionBar,
  Button,
  Input,
  Select,
  Text,
  Textarea,
  TopNav,
} from '@dei/ui';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { SUPPORT_CATEGORIES, SUPPORT_MESSAGE_MAX_LENGTH } from '@/lib/b-flow';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export default function SupportScreen() {
  const router = useRouter();
  const { category: categoryParam } = useLocalSearchParams<{ category?: string }>();
  const { user } = useAuth();
  const initialCategory = SUPPORT_CATEGORIES.includes(
    categoryParam as (typeof SUPPORT_CATEGORIES)[number],
  )
    ? categoryParam as (typeof SUPPORT_CATEGORIES)[number]
    : '기타';
  const categoryLocked = SUPPORT_CATEGORIES.includes(
    categoryParam as (typeof SUPPORT_CATEGORIES)[number],
  );
  const [category, setCategory] = useState<(typeof SUPPORT_CATEGORIES)[number]>(initialCategory);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.support_form_opened);
  }, []);

  useEffect(() => {
    if (!complete) {
      return;
    }

    const timer = setTimeout(() => router.replace(ROUTES.myProfile), 900);
    return () => clearTimeout(timer);
  }, [complete, router]);

  const canSubmit = message.trim().length > 0;

  const submit = () => {
    if (!canSubmit || isSubmitting) {
      return;
    }

    void logger.withErrorCapture(
      'support.submit',
      async () => {
        setIsSubmitting(true);

        if (user) {
          const trimmedEmail = email.trim() || null;
          const trimmedMessage = message.trim();
          const { error: ticketError } = await supabase.from('support_ticket').insert({
            category,
            message: trimmedMessage,
            reply_email: trimmedEmail,
            user_id: user.id,
          });

          if (ticketError) {
            throw ticketError;
          }

          if (category === '결제·환불') {
            const { error: refundError } = await supabase.from('refund_ticket').insert({
              reason: [trimmedMessage, trimmedEmail ? `reply:${trimmedEmail}` : null]
                .filter(Boolean)
                .join('\n'),
              user_id: user.id,
            });

            if (refundError) {
              throw refundError;
            }
          }
        }

        analytics.capture(ANALYTICS_EVENTS.inquiry_submitted, {
          category,
        });
        setComplete(true);
      },
      { tags: { screen: 'support', action: 'submit' } },
    )
      .catch((error) => {
        logger.captureException(error, {
          tags: { screen: 'support', action: 'submit-catch' },
        });
        setFailed(true);
      })
      .finally(() => setIsSubmitting(false));
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <TopNav title="고객센터" onLeftPress={() => router.back()} />

      <ScrollView className="flex-1 bg-bg">
        <View className="px-[24px] pb-[128px] pt-[22px]">
          <Text variant="h1" className="text-[25px] leading-[33px]">
            무엇이 궁금하신가요?
          </Text>
          <Text className="mt-[8px] text-[13.5px] leading-[20px] text-ink-3">
            영업일 기준 2일 내 회신드려요.
          </Text>

          <View className="mt-[26px]">
            <Text variant="eyebrow" tone="ink-3">
              분류
            </Text>
            {categoryLocked ? (
              <Input value={category} readonly className="mt-[8px]" />
            ) : (
              <>
                <Select value={category} placeholder="분류 선택" className="mt-[8px]" />
                <View className="mt-[10px] flex-row flex-wrap gap-[8px]">
                  {SUPPORT_CATEGORIES.map((item) => (
                    <Button
                      key={item}
                      size="sm"
                      variant={category === item ? 'ink' : 'secondary'}
                      onPress={() => setCategory(item)}
                      className="px-[12px] py-[10px]"
                    >
                      {item}
                    </Button>
                  ))}
                </View>
              </>
            )}
          </View>

          <View className="mt-[22px]">
            <Text variant="eyebrow" tone="ink-3">
              내용
            </Text>
            <Textarea
              value={message}
              onChangeText={setMessage}
              maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
              showCount
              placeholder="문의 내용을 자세히 적어주세요"
              className="mt-[8px]"
            />
          </View>

          <Input
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            label="회신 이메일 (선택)"
            placeholder="example@email.com"
            helper="선택 입력이에요. 미입력 시 인앱 알림으로 회신해요."
            className="mt-[24px]"
          />

          <Banner tone="info" icon="i" title="회신 안내">
            이메일 미입력 시 앱 알림으로 회신드려요.
          </Banner>
        </View>
      </ScrollView>

      <BottomActionBar fixed>
        <Button fullWidth disabled={!canSubmit || isSubmitting} onPress={submit}>
          {isSubmitting ? '보내는 중' : '보내기'}
        </Button>
      </BottomActionBar>

      <AlertDialog
        visible={failed}
        tone="warn"
        icon="!"
        title="문의를 접수하지 못했어요"
        description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setFailed(false) }]}
        onDismiss={() => setFailed(false)}
      />

      {complete ? (
        <View className="absolute bottom-[34px] left-0 right-0 items-center px-[24px]">
          <View className="rounded-full bg-ink px-[16px] py-[10px]">
            <Text className="text-center text-[12.5px] font-bold text-white">
              문의를 받았어요
            </Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
