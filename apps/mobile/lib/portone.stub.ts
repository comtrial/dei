import type {
  IdentityVerificationRequest,
  IdentityVerificationResponse,
  PaymentRequest,
  PaymentResponse,
} from '@portone/browser-sdk/v2';

import { supabase } from '@/lib/supabase';

export type IdentityVerificationFailureCode =
  | 'CI_DUPLICATE'
  | 'IDENTITY_ALREADY_VERIFIED'
  | 'IDENTITY_LOCKED'
  | 'MISSING_VERIFIED_CUSTOMER'
  | 'PORTONE_LOOKUP_FAILED'
  | 'PORTONE_NOT_VERIFIED'
  | 'REJOIN_LOCKED'
  | 'SDK_CANCELLED'
  | 'SDK_ERROR'
  | 'UNDERAGE';

type StartIdentityVerificationResponse = {
  channelKey: string;
  customData?: string;
  identityVerificationId: string;
  storeId: string;
};

export type ConfirmIdentityVerificationResponse = {
  authSession?: {
    accessToken: string;
    expiresAt?: number | null;
    refreshToken: string;
    userId: string;
  };
  birthDate?: string | null;
  birthYear: number;
  existingMember?: boolean;
  gender: 'male' | 'female' | null;
  identityVerifiedAt: string;
  isAdult: boolean;
};

type FunctionInvokeError = {
  context?: Response;
  message?: string;
};

type FunctionErrorPayload = {
  code?: IdentityVerificationFailureCode;
  error?: string;
  existingMember?: boolean;
  failureCount?: number;
  lockUntil?: string | null;
  message?: string;
};

export class IdentityVerificationError extends Error {
  code?: IdentityVerificationFailureCode;
  existingMember?: boolean;
  failureCount?: number;
  lockUntil?: string | null;

  constructor(message: string, payload: Partial<FunctionErrorPayload> = {}) {
    super(message);
    this.name = 'IdentityVerificationError';
    this.code = payload.code;
    this.existingMember = payload.existingMember;
    this.failureCount = payload.failureCount;
    this.lockUntil = payload.lockUntil;
  }
}

const toFriendlyMessage = (payload: Partial<FunctionErrorPayload>, fallback: string) => {
  if (payload.code === 'IDENTITY_LOCKED') {
    return '본인인증을 너무 많이 시도했어요. 24시간 뒤 다시 시도해주세요.';
  }

  if (payload.code === 'UNDERAGE') {
    return payload.error ?? payload.message ?? '만 19세 이상만 이용할 수 있어요.';
  }

  if (payload.code === 'CI_DUPLICATE') {
    return payload.error ?? payload.message ?? '이미 가입된 번호예요. 그 계정으로 들어갈게요.';
  }

  if (payload.code === 'REJOIN_LOCKED') {
    return payload.error ?? payload.message ?? '탈퇴한 번호는 30일 동안 다시 가입할 수 없어요.';
  }

  if (payload.error || payload.message) {
    return payload.error ?? payload.message ?? fallback;
  }

  return fallback;
};

const getFunctionError = async (fallback: string, error?: FunctionInvokeError | null) => {
  if (!error) {
    return new IdentityVerificationError(fallback);
  }

  if (error.context) {
    try {
      const payload = await error.context.clone().json() as FunctionErrorPayload;
      return new IdentityVerificationError(toFriendlyMessage(payload, fallback), payload);
    } catch {
      // Fall back to the SDK/client message below when the body is not JSON.
    }
  }

  return new IdentityVerificationError(error.message || fallback);
};

export async function startIdentityVerification(): Promise<IdentityVerificationRequest> {
  const { data, error } = await supabase.functions.invoke<StartIdentityVerificationResponse>(
    'start-identity-verification',
  );

  if (error || !data) {
    throw await getFunctionError('본인확인을 시작할 수 없어요.', error);
  }

  return {
    channelKey: data.channelKey,
    customData: data.customData,
    identityVerificationId: data.identityVerificationId,
    storeId: data.storeId,
  };
}

export async function startWithdrawIdentityVerification(): Promise<IdentityVerificationRequest> {
  const { data, error } = await supabase.functions.invoke<StartIdentityVerificationResponse>(
    'start-withdraw-identity-verification',
  );

  if (error || !data) {
    throw await getFunctionError('본인인증 재확인을 시작할 수 없어요.', error);
  }

  return {
    channelKey: data.channelKey,
    customData: data.customData,
    identityVerificationId: data.identityVerificationId,
    storeId: data.storeId,
  };
}

export async function confirmIdentityVerification(
  response: IdentityVerificationResponse,
  fallbackIdentityVerificationId?: string,
): Promise<ConfirmIdentityVerificationResponse> {
  const identityVerificationId =
    response.identityVerificationId?.trim() || fallbackIdentityVerificationId?.trim();

  if (!identityVerificationId) {
    throw new IdentityVerificationError('본인확인 결과 식별자를 확인할 수 없어요. 다시 시도해 주세요.');
  }

  if (response.code) {
    await recordIdentityVerificationFailure({
      failureCode: 'SDK_ERROR',
      failureMessage: response.message || response.code,
      identityVerificationId,
      identityVerificationTxId: response.identityVerificationTxId,
    });
  }

  const { data, error } = await supabase.functions.invoke<ConfirmIdentityVerificationResponse>(
    'confirm-identity-verification',
    {
      body: {
        identityVerificationId,
        identityVerificationTxId: response.identityVerificationTxId,
      },
    },
  );

  if (error || !data) {
    throw await getFunctionError('본인확인 결과를 저장할 수 없어요.', error);
  }

  return data;
}

export async function confirmWithdrawIdentityVerification(
  response: IdentityVerificationResponse,
  fallbackIdentityVerificationId?: string,
): Promise<{ identityVerifiedAt: string; ok: true }> {
  const identityVerificationId =
    response.identityVerificationId?.trim() || fallbackIdentityVerificationId?.trim();

  if (!identityVerificationId) {
    throw new IdentityVerificationError('본인확인 결과 식별자를 확인할 수 없어요. 다시 시도해 주세요.');
  }

  const { data, error } = await supabase.functions.invoke<{ identityVerifiedAt: string; ok: true }>(
    'confirm-withdraw-identity-verification',
    {
      body: {
        identityVerificationId,
        identityVerificationTxId: response.identityVerificationTxId,
      },
    },
  );

  if (error || !data) {
    throw await getFunctionError('본인인증 재확인을 완료할 수 없어요.', error);
  }

  return data;
}

export async function recordIdentityVerificationFailure({
  failureCode,
  failureMessage,
  identityVerificationId,
  identityVerificationTxId,
}: {
  failureCode: IdentityVerificationFailureCode;
  failureMessage?: string;
  identityVerificationId: string;
  identityVerificationTxId?: string;
}) {
  const { error } = await supabase.functions.invoke('confirm-identity-verification', {
    body: {
      failureCode,
      failureMessage,
      identityVerificationId,
      identityVerificationTxId,
    },
  });

  if (error) {
    throw await getFunctionError('본인확인이 완료되지 않았어요.', error);
  }

  throw new IdentityVerificationError(failureMessage || '본인확인이 완료되지 않았어요.', {
    code: failureCode,
  });
}

export async function withdrawAccount({
  detail,
  reason,
}: {
  detail?: string;
  reason: string;
}): Promise<{ ok: true }> {
  const { data, error } = await supabase.functions.invoke<{ ok: true }>(
    'withdraw-account',
    {
      body: {
        detail,
        reason,
      },
    },
  );

  if (error || !data) {
    throw await getFunctionError('탈퇴 처리에 실패했어요.', error);
  }

  return data;
}

export async function startInstantRematchPayment(productId: string): Promise<PaymentRequest> {
  const { data, error } = await supabase.functions.invoke<{ request: PaymentRequest }>(
    'start-instant-rematch-payment',
    {
      body: {
        productId,
      },
    },
  );

  if (error || !data?.request) {
    throw await getFunctionError('결제를 시작할 수 없어요.', error);
  }

  return data.request;
}

export async function confirmInstantRematchPayment(
  response: PaymentResponse,
  productId: string,
): Promise<{ granted: number; ok: true; paymentId: string }> {
  if (!response.paymentId) {
    throw new Error('결제 결과 식별자를 확인할 수 없어요.');
  }

  const { data, error } = await supabase.functions.invoke<{
    granted: number;
    ok: true;
    paymentId: string;
  }>('confirm-instant-rematch-payment', {
    body: {
      code: response.code,
      message: response.message,
      paymentId: response.paymentId,
      productId,
      txId: response.txId,
    },
  });

  if (error || !data) {
    throw await getFunctionError('결제를 확인할 수 없어요.', error);
  }

  return data;
}
