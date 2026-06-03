// supabase/functions/_shared/log.ts
//
// Edge Function 서버측 에러 로깅 공통 모듈.
//
// 배경: Edge Function 들은 그동안 errorResponse 로 코드만 반환하고 5xx/예외/
// RPC error 를 서버 어디에도 기록하지 않았다 (채팅 send_failed uuid 버그를
// 서버에서 못 잡은 원인). 이 모듈은 그 공백을 닫는다.
//
// 설계 원칙(analytics.ts 의 error-tracking 쌍):
//   1. ALWAYS — 구조화된 single-line JSON 을 `console.error` 로 남긴다.
//      `supabase functions logs` / 대시보드에서 즉시 grep·parse 가능하고
//      추가 설정이 전혀 필요 없다(현재 SENTRY_EDGE_DSN 미설정 상태의 기본 동작).
//   2. OPTIONAL — `SENTRY_EDGE_DSN` 가 설정되면 npm/JSR 의존 없이 raw `fetch`
//      로 Sentry store 엔드포인트에 forwarding. DSN 이 없으면 이 분기는 no-op.
//   3. NEVER THROW — 로깅이 본 요청을 절대 실패시키지 않는다. forwarding fetch
//      는 try/catch 로 감싸 삼킨다(analytics.ts 와 동일 계약).
//
// 배포: 이 모듈은 `supabase functions deploy <name>` 로만 배포된다.
// 마이그레이션(`supabase db push`)은 Edge Function 을 배포하지 않는다.
// Sentry forwarding 을 켜려면 `supabase secrets set SENTRY_EDGE_DSN=...`
// (모바일 `EXPO_PUBLIC_SENTRY_DSN` 과 의도적으로 분리된 별도 ingest 경로).

type EdgeLogLevel = 'error' | 'warning';

export type EdgeErrorCtx = {
  stage?: string;
  status?: number;
  /** auth.uid() 만. email 등 PII 는 넣지 말 것. */
  userId?: string;
  level?: EdgeLogLevel;
  /** feature / code 등 짧은 분류 태그. */
  tags?: Record<string, string | number | boolean>;
  /** roomId, paymentId, clientMsgId, rpcMessage 등 식별자. */
  extra?: Record<string, unknown>;
};

/**
 * 임의의 throw 값(Error / PostgREST error 객체 / 문자열)을
 * `{ name, message }` 로 정규화한다.
 *
 * PostgREST 에러는 Error 인스턴스가 아니라 `{ message, code, details, hint }`
 * 형태이므로 그 필드를 join 한다(confirm-identity-verification 의 inline
 * getErrorMessage 를 여기로 hoist).
 */
export function normalizeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name || 'Error', message: error.message };
  }

  if (typeof error === 'string') {
    return { name: 'Error', message: error };
  }

  if (error && typeof error === 'object') {
    const maybeError = error as {
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      message?: unknown;
      name?: unknown;
    };
    const parts = [maybeError.message, maybeError.code, maybeError.details, maybeError.hint]
      .filter((part): part is string => typeof part === 'string' && part.length > 0);

    if (parts.length > 0) {
      return {
        name: typeof maybeError.name === 'string' && maybeError.name.length > 0
          ? maybeError.name
          : 'PostgrestError',
        message: parts.join(' '),
      };
    }
  }

  return { name: 'Error', message: 'unknown error' };
}

function emitStructured(
  fn: string,
  level: EdgeLogLevel,
  normalized: { name: string; message: string },
  ctx: EdgeErrorCtx,
): void {
  // single-line JSON — grep/parse 가능하도록.
  console.error(
    JSON.stringify({
      src: 'edge',
      fn,
      stage: ctx.stage ?? null,
      status: ctx.status ?? null,
      level,
      name: normalized.name,
      message: normalized.message,
      userId: ctx.userId ?? null,
      tags: ctx.tags ?? {},
      extra: ctx.extra ?? {},
      ts: new Date().toISOString(),
    }),
  );
}

type ParsedDsn = {
  key: string;
  host: string;
  projectId: string;
};

function parseDsn(dsn: string): ParsedDsn | null {
  // 형식: https://<key>@<host>/<projectId>
  try {
    const url = new URL(dsn);
    const key = url.username;
    const host = url.host;
    const projectId = url.pathname.replace(/^\/+/, '');
    if (!key || !host || !projectId) {
      return null;
    }
    return { key, host, projectId };
  } catch {
    return null;
  }
}

function forwardToSentry(
  fn: string,
  level: EdgeLogLevel,
  normalized: { name: string; message: string },
  ctx: EdgeErrorCtx,
): void {
  const dsn = Deno.env.get('SENTRY_EDGE_DSN');
  if (!dsn) {
    return;
  }

  const parsed = parseDsn(dsn);
  if (!parsed) {
    console.error(
      JSON.stringify({ src: 'edge', fn: '_shared/log', level: 'warning', message: 'SENTRY_EDGE_DSN parse failed' }),
    );
    return;
  }

  const eventId = crypto.randomUUID().replaceAll('-', '');
  const environment = Deno.env.get('SENTRY_EDGE_ENV') ?? 'production';

  // 로깅은 절대 본 요청을 죽이면 안 되므로 fire-and-forget + swallow.
  void (async () => {
    try {
      await fetch(`https://${parsed.host}/api/${parsed.projectId}/store/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sentry-Auth':
            `Sentry sentry_version=7, sentry_key=${parsed.key}, sentry_client=dei-edge/1.0`,
        },
        body: JSON.stringify({
          event_id: eventId,
          timestamp: new Date().toISOString(),
          platform: 'other',
          level,
          logger: `edge.${fn}`,
          environment,
          tags: {
            fn,
            ...(ctx.stage ? { stage: ctx.stage } : {}),
            ...(ctx.tags ?? {}),
          },
          user: ctx.userId ? { id: ctx.userId } : undefined,
          exception: {
            values: [{ type: normalized.name, value: normalized.message }],
          },
          extra: ctx.extra,
        }),
      });
    } catch (forwardError) {
      console.error(
        JSON.stringify({
          src: 'edge',
          fn: '_shared/log',
          level: 'warning',
          message: 'sentry forward failed',
          detail: forwardError instanceof Error ? forwardError.message : String(forwardError),
        }),
      );
    }
  })();
}

/**
 * Edge Function 의 예외/5xx/RPC error 를 서버에 기록한다.
 * 항상 구조화 console.error 로 남기고, SENTRY_EDGE_DSN 이 있으면 Sentry 로
 * forwarding 한다. 절대 throw 하지 않는다.
 */
export function captureEdgeError(fn: string, error: unknown, ctx: EdgeErrorCtx = {}): void {
  const level: EdgeLogLevel = ctx.level ?? 'error';
  const normalized = normalizeError(error);
  emitStructured(fn, level, normalized, ctx);
  forwardToSentry(fn, level, normalized, ctx);
}

/**
 * 예외는 아니지만 서버가 알아야 할 신호(인프라 502, 결제 금액 불일치 등)를
 * 메시지로 기록한다. level 기본값은 'warning'.
 */
export function captureEdgeMessage(fn: string, message: string, ctx: EdgeErrorCtx = {}): void {
  const level: EdgeLogLevel = ctx.level ?? 'warning';
  const normalized = { name: 'Message', message };
  emitStructured(fn, level, normalized, ctx);
  forwardToSentry(fn, level, normalized, ctx);
}
