/**
 * MatchWaitingCard — 매칭 큐 대기 중 카드.
 *
 * 본인이 leader 인 group 이 queued 상태일 때 home.tsx 에 표시.
 * 매칭 성사(consumed_at set) 시 realtime 으로 useMatchQueue.matched=true 가 되면
 * 라우팅이 자동으로 방으로 전환 (home.tsx 가 처리).
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

const MS_IN_MIN = 60 * 1000;

function formatElapsed(enqueuedAt: string | null): string {
  if (!enqueuedAt) return '';
  const ms = Date.now() - new Date(enqueuedAt).getTime();
  if (ms < MS_IN_MIN) return '방금 큐에 등록됨';
  const mins = Math.floor(ms / MS_IN_MIN);
  if (mins < 60) return `${mins}분째 대기 중`;
  const hours = Math.floor(mins / 60);
  return `${hours}시간 ${mins % 60}분째 대기 중`;
}

export function MatchWaitingCard({
  groupSize,
  enqueuedAt,
  onCancel,
}: {
  groupSize: number;
  enqueuedAt: string | null;
  onCancel?: () => void;
}) {
  const [elapsed, setElapsed] = useState(() => formatElapsed(enqueuedAt));

  useEffect(() => {
    const id = setInterval(() => setElapsed(formatElapsed(enqueuedAt)), 30_000);
    return () => clearInterval(id);
  }, [enqueuedAt]);

  return (
    <View
      testID="home-match-waiting-card"
      className="rounded-2xl border border-border bg-card p-5">
      <Text className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-2">
        매칭 대기 중
      </Text>
      <Text className="text-lg font-semibold text-foreground mb-1">
        {groupSize}명이 함께 매칭을 기다려요
      </Text>
      <Text className="text-sm text-muted-foreground mb-4">
        {elapsed || '큐에 등록됐어요'} · 좋은 상대가 모이는 대로 알려드릴게요.
      </Text>
      {onCancel ? (
        <Button
          testID="home-match-waiting-cancel"
          variant="outline"
          onPress={onCancel}
          className="self-start">
          <Text>큐에서 나가기</Text>
        </Button>
      ) : null}
    </View>
  );
}
