/**
 * BoosterPurchaseSheet — 부스터 구매/사용 바텀시트.
 *
 * `useBoosterPurchase` 위임. step 별 UI:
 *   idle       → "즉시 재매칭하기" CTA
 *   granting-free → "무료 발급 중…"
 *   purchasing → "결제 진행 중…"
 *   syncing    → "영수증 동기화 중…"
 *   consuming  → "재매칭 제한 해제 중…"
 *   done       → "완료! 잠시 후 매칭 대기로 이동"
 *   error      → 에러 + 재시도 버튼
 *
 * isFemale = true 면 "무료로 즉시 재매칭", false/other 면 "부스터 결제"
 */
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { type BoosterPurchaseStep } from '@/hooks/useBoosterPurchase';

const STEP_LABEL: Record<BoosterPurchaseStep, string> = {
  idle: '',
  'granting-free': '무료 부스터 발급 중…',
  purchasing: '결제 진행 중…',
  syncing: '영수증 동기화 중…',
  consuming: '재매칭 제한 해제 중…',
  done: '완료! 곧 매칭이 시작돼요 🎉',
  error: '처리에 실패했어요. 다시 시도해 주세요.',
};

type Props = {
  step: BoosterPurchaseStep;
  isFemale: boolean;
  onPurchase: () => void;
  onClose?: () => void;
};

export function BoosterPurchaseSheet({ step, isFemale, onPurchase, onClose }: Props) {
  const busy = step !== 'idle' && step !== 'done' && step !== 'error';
  const isDone = step === 'done';
  const isError = step === 'error';

  return (
    <View className="bg-background rounded-t-3xl px-5 pt-3 pb-10 gap-4">
      {/* 핸들 */}
      <View className="w-10 h-1 bg-border rounded-full self-center mb-2" />

      <Text className="text-xl font-semibold text-foreground text-center">
        즉시 재매칭
      </Text>
      <Text className="text-sm text-muted-foreground text-center leading-relaxed">
        {isFemale
          ? '무료 부스터로 24시간 제한을 즉시 해제하고 새 매칭을 받아보세요.'
          : '부스터를 구매하면 24시간 재매칭 제한을 즉시 해제할 수 있어요.'}
      </Text>

      {/* 상태 메시지 */}
      {busy && (
        <View className="bg-muted/40 rounded-xl p-4">
          <Text className="text-sm text-muted-foreground text-center">{STEP_LABEL[step]}</Text>
        </View>
      )}

      {isDone && (
        <View className="bg-primary/10 rounded-xl p-4">
          <Text className="text-sm text-primary text-center font-semibold">{STEP_LABEL[step]}</Text>
        </View>
      )}

      {isError && (
        <View className="bg-destructive/10 rounded-xl p-4">
          <Text className="text-sm text-destructive text-center">{STEP_LABEL[step]}</Text>
        </View>
      )}

      <Button
        testID="booster-purchase-button"
        onPress={onPurchase}
        disabled={busy || isDone}>
        <Text>
          {busy
            ? '처리 중…'
            : isDone
              ? '완료됨'
              : isFemale
                ? '무료로 즉시 재매칭하기'
                : '부스터로 즉시 재매칭하기'}
        </Text>
      </Button>

      {onClose && (
        <Button variant="ghost" onPress={onClose} disabled={busy}>
          <Text>닫기</Text>
        </Button>
      )}
    </View>
  );
}
