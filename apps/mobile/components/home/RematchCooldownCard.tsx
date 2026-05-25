/**
 * RematchCooldownCard — 방 이탈 후 24h 재매칭 제한 표시 + 부스터 CTA.
 *
 * D11 정책:
 *   - 여성: 무료 부스터 자동 발급 가능 (CTA "지금 다시 매칭")
 *   - 남성: 유료 부스터 결제 CTA
 *   - cooldown 만료 시 카드 자체가 사라짐 (home.tsx 분기)
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

const MS_IN_HOUR = 60 * 60 * 1000;
const MS_IN_MIN = 60 * 1000;
const MS_IN_SEC = 1000;

function formatRemaining(ms: number): string {
  if (ms <= 0) return '곧 풀려요';
  const h = Math.floor(ms / MS_IN_HOUR);
  const m = Math.floor((ms % MS_IN_HOUR) / MS_IN_MIN);
  const s = Math.floor((ms % MS_IN_MIN) / MS_IN_SEC);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

export function RematchCooldownCard({
  remainingMs,
  availableBoosters,
  isFemale,
  onUseBooster,
  busy,
}: {
  remainingMs: number;
  availableBoosters: number;
  isFemale: boolean;
  onUseBooster: () => void;
  busy?: boolean;
}) {
  const [remaining, setRemaining] = useState(remainingMs);
  useEffect(() => setRemaining(remainingMs), [remainingMs]);

  const hasBooster = availableBoosters > 0;
  const ctaLabel = hasBooster
    ? '지금 다시 매칭하기'
    : isFemale
      ? '지금 다시 매칭하기 (무료)'
      : '부스터로 즉시 매칭하기';

  return (
    <View
      testID="home-rematch-cooldown-card"
      className="rounded-2xl border border-border bg-card p-5">
      <Text className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-2">
        재매칭 제한
      </Text>
      <Text className="text-lg font-semibold text-foreground mb-1">
        {formatRemaining(remaining)} 남았어요
      </Text>
      <Text className="text-sm text-muted-foreground mb-4">
        방을 나간 직후엔 24시간 동안 새로운 방으로 갈 수 없어요. 곧 좋은 만남이 다시 시작될 거예요.
      </Text>
      <Button
        testID="home-rematch-cooldown-booster"
        onPress={onUseBooster}
        disabled={busy}
        className="self-start">
        <Text>{busy ? '처리 중…' : ctaLabel}</Text>
      </Button>
    </View>
  );
}
