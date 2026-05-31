import { supabase } from '@/lib/supabase';

type FunctionInvokeError = {
  context?: Response;
  message?: string;
};

type FunctionErrorPayload = {
  code?: string;
  error?: string;
  message?: string;
};

export type MatchQueueRegistration = {
  enqueuedAt: string;
  expiresAt: string | null;
  freeRematchWaived?: boolean;
  memberCount: number | null;
  passConsumed?: boolean;
  queueId: string;
  reused: boolean;
  teamId: string;
};

export class MatchQueueError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'MatchQueueError';
    this.code = code;
  }
}

export function isMatchQueueErrorCode(error: unknown, code: string) {
  return error instanceof MatchQueueError && error.code === code;
}

async function toFunctionError(fallback: string, error?: FunctionInvokeError | null) {
  if (error?.context) {
    try {
      const payload = await error.context.clone().json() as FunctionErrorPayload;
      return new MatchQueueError(payload.error ?? payload.message ?? fallback, payload.code);
    } catch {
      // Fall through to the client error message.
    }
  }

  return new MatchQueueError(error?.message || fallback);
}

export async function enqueueMatchQueue(memberIds: string[] = []) {
  const { data, error } = await supabase.functions.invoke<MatchQueueRegistration>(
    'enqueue-match-queue',
    {
      body: { memberIds },
    },
  );

  if (error || !data) {
    throw await toFunctionError('매칭 큐에 들어가지 못했어요.', error);
  }

  return data;
}

export async function cancelMatchQueue() {
  const { data, error } = await supabase.functions.invoke<{ cancelledCount: number; ok: true }>(
    'cancel-match-queue',
  );

  if (error || !data) {
    throw await toFunctionError('매칭을 취소하지 못했어요.', error);
  }

  return data;
}

export async function expireMatchQueue() {
  const { data, error } = await supabase.functions.invoke<{ expiredCount: number; ok: true }>(
    'expire-match-queue',
  );

  if (error || !data) {
    throw await toFunctionError('만료된 매칭 큐를 정리하지 못했어요.', error);
  }

  return data;
}

export function isQueueExpired(expiresAt?: string | null) {
  if (!expiresAt) {
    return false;
  }

  return new Date(expiresAt).getTime() <= Date.now();
}

export function formatQueueElapsed(enqueuedAt?: string | null) {
  if (!enqueuedAt) {
    return '방금';
  }

  const enqueuedAtMs = new Date(enqueuedAt).getTime();
  if (!Number.isFinite(enqueuedAtMs)) {
    return '방금';
  }

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - enqueuedAtMs) / 60_000));
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}분`;
  }

  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
}
