import { useRouter } from 'expo-router';
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
  const { user } = useAuth();
  const [category, setCategory] = useState<(typeof SUPPORT_CATEGORIES)[number]>('결제·환불');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.support_form_opened);
  }, []);

  const canSubmit = message.trim().length >= 10;

  const submit = () => {
    if (!canSubmit || isSubmitting) {
      return;
    }

    void logger.withErrorCapture(
      'support.submit',
      async () => {
        setIsSubmitting(true);

        if (user && category === '결제·환불') {
          const { error } = await supabase.from('refund_ticket').insert({
            reason: [message.trim(), email.trim() ? `reply:${email.trim()}` : null]
              .filter(Boolean)
              .join('\n'),
            user_id: user.id,
          });

          if (error) {
            throw error;
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
            문의 내용을 남겨주세요
          </Text>
          <Text className="mt-[8px] text-[13.5px] leading-[20px] text-ink-3">
            문의 유형에 맞게 접수하고 확인 후 답변드릴게요.
          </Text>

          <View className="mt-[26px]">
            <Text variant="eyebrow" tone="ink-3">
              문의 분류
            </Text>
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
          </View>

          <Input
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            label="회신 이메일"
            placeholder="name@example.com"
            helper="선택 입력이에요. 앱 알림이 불안정할 때 이메일로 답변받을 수 있어요."
            className="mt-[24px]"
          />

          <View className="mt-[22px]">
            <Text variant="eyebrow" tone="ink-3">
              문의 내용
            </Text>
            <Textarea
              value={message}
              onChangeText={setMessage}
              maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
              showCount
              placeholder="상황을 자세히 적어주세요"
              className="mt-[8px]"
            />
          </View>

          <Banner tone="info" icon="i" title="운영 답변">
            결제 환불은 결제 기록과 함께 확인해야 해서 처리 시간이 더 걸릴 수 있어요.
          </Banner>
        </View>
      </ScrollView>

      <BottomActionBar fixed>
        <Button fullWidth disabled={!canSubmit || isSubmitting} onPress={submit}>
          {isSubmitting ? '접수 중' : '문의 접수'}
        </Button>
      </BottomActionBar>

      <AlertDialog
        visible={complete}
        tone="info"
        icon="i"
        title="문의가 접수됐어요"
        description="운영팀이 확인한 뒤 답변할게요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => router.replace(ROUTES.myProfile) }]}
        onDismiss={() => router.replace(ROUTES.myProfile)}
      />

      <AlertDialog
        visible={failed}
        tone="warn"
        icon="!"
        title="문의를 접수하지 못했어요"
        description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
        actions={[{ label: '확인', variant: 'ink', onPress: () => setFailed(false) }]}
        onDismiss={() => setFailed(false)}
      />
    </SafeAreaView>
  );
}
