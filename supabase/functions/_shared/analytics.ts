const DEFAULT_HOST = 'https://us.i.posthog.com';

/**
 * 서버(Edge Function)에서 PostHog 로 이벤트를 캡처한다.
 *
 * posthog-node 같은 npm 의존을 끌어오지 않고 PostHog 의 `/capture/`
 * 엔드포인트를 fetch 로 직접 호출한다 (Deno 환경 의존 최소화).
 *
 * 계측은 본 기능을 절대 죽이면 안 되므로:
 *   - POSTHOG_API_KEY 미설정 시 console.warn 후 no-op (throw 금지).
 *   - 전송 실패도 try/catch 로 삼켜 console.error 만 남기고 throw 하지 않는다.
 */
export async function captureServerEvent(opts: {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const apiKey = Deno.env.get('POSTHOG_API_KEY');
  const host = Deno.env.get('POSTHOG_HOST') ?? DEFAULT_HOST;

  if (!apiKey) {
    console.warn(
      '[analytics] POSTHOG_API_KEY 가 설정되지 않아 서버 이벤트 캡처를 건너뜁니다.',
    );
    return;
  }

  try {
    await fetch(`${host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        event: opts.event,
        distinct_id: opts.distinctId,
        properties: opts.properties ?? {},
      }),
    });
  } catch (error) {
    console.error('[analytics] 서버 이벤트 캡처 실패:', error);
  }
}
