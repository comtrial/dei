/**
 * 실PostHog 관통 e2e (온디맨드 — CI 게이트 아님).
 * ------------------------------------------------------------------
 * 전용 e2e distinct_id 로 4대 퍼널 spine 이벤트를 PostHog 의 실제 /capture/
 * 엔드포인트(앱 transport 와 동일 wire format)로 시간순 발사한다. 그 뒤 사람이
 * PostHog MCP 의 query-funnel 로 4대 퍼널 전환율 산출을 확인한다(= 4가지 질문에
 * 답 가능 실증). 기존 실데이터 무접촉 — 전용 e2e_run_id 로만 식별/필터.
 *
 * 실행: pnpm posthog:e2e
 * 필요 env: EXPO_PUBLIC_POSTHOG_KEY(공개 ingest key), EXPO_PUBLIC_POSTHOG_HOST(선택)
 *   → ~/.dei/secrets.env 를 source 하거나 직접 export.
 *
 * 검증(스크립트 발사 후 사람/MCP 단계):
 *   1) read-data-schema events 에 F0~F3 spine 이벤트가 보이는지
 *   2) query-funnel 로 activation/match/engagement/monetization 4개가 step 인식 + 전환율 산출
 *   3) North Star: engagement 방당 distinct actor >= 2 (room_id breakdown)
 */
import { FUNNELS } from '../lib/analytics/funnels';
import { ANALYTICS_EVENTS } from '../lib/analytics-taxonomy';

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

async function capture(distinctId: string, event: string, props: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: KEY,
      event,
      distinct_id: distinctId,
      properties: props,
      timestamp: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    throw new Error(`capture failed ${res.status}: ${await res.text()}`);
  }
}

async function main(): Promise<void> {
  if (!KEY) {
    throw new Error('EXPO_PUBLIC_POSTHOG_KEY 미설정 — ~/.dei/secrets.env 를 source 하세요.');
  }
  const runId = process.env.POSTHOG_E2E_RUN_ID ?? 'e2e-posthog-funnels-local';
  const distinctId = `e2e-posthog-${runId}`;

  let sent = 0;
  for (const funnel of FUNNELS) {
    for (const key of funnel.steps) {
      const eventName = ANALYTICS_EVENTS[key];
      await capture(distinctId, eventName, {
        e2e_run_id: runId,
        funnel: funnel.id,
        room_id: funnel.id === 'engagement' ? `e2e-room-${runId}` : undefined,
      });
      sent += 1;
    }
  }

  // North Star 실증용: 같은 방에 두 번째 actor 의 engagement 활동 1건 추가.
  const distinctIdB = `${distinctId}-b`;
  await capture(distinctIdB, ANALYTICS_EVENTS.video_uploaded, {
    e2e_run_id: runId,
    funnel: 'engagement',
    room_id: `e2e-room-${runId}`,
  });
  sent += 1;

  console.log(`[posthog-e2e] 발사 완료: ${sent} events, distinct_id=${distinctId}, run_id=${runId}`);
  console.log('[posthog-e2e] 다음: PostHog MCP query-funnel 로 4대 퍼널 산출 확인 (e2e_run_id 필터).');
}

main().catch((err) => {
  console.error('[posthog-e2e] 실패:', err);
  process.exitCode = 1;
});
