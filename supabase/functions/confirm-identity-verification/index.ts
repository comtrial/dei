import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import {
  codedErrorResponse,
  getBirthYear,
  getFailureWindowStart,
  getLockUntil,
  getRequiredEnv,
  hashIdentityValue,
  IDENTITY_PROVIDER,
  IDENTITY_POLICY,
  isAdult,
  toBirthDate,
  toGender,
  type IdentityFailureCode,
} from '../_shared/identity-verification.ts';

type ConfirmBody = {
  failureCode?: IdentityFailureCode;
  failureMessage?: string;
  identityVerificationId?: string;
  identityVerificationTxId?: string;
};

type PortOneIdentityVerification = {
  id?: string;
  status?: string;
  verifiedAt?: string;
  verifiedCustomer?: {
    birthDate?: string;
    birthDay?: number | string;
    birthMonth?: number | string;
    birthYear?: number | string;
    ci?: string;
    di?: string;
    gender?: string;
    name?: string;
    phoneNumber?: string;
  };
};

const LOCK_EXCLUDED_FAILURES = new Set<IdentityFailureCode>([
  'CI_DUPLICATE',
  'IDENTITY_ALREADY_VERIFIED',
  'UNDERAGE',
]);

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const maybeError = error as {
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      message?: unknown;
    };
    const parts = [maybeError.message, maybeError.code, maybeError.details, maybeError.hint]
      .filter((part): part is string => typeof part === 'string' && part.length > 0);

    if (parts.length > 0) {
      return parts.join(' ');
    }
  }

  return fallback;
};

const toSafeProviderMetadata = (
  identityVerification: PortOneIdentityVerification,
  identityVerificationTxId?: string,
) => {
  const customer = identityVerification.verifiedCustomer;
  const birthDate = toBirthDate(customer ?? {});
  const birthYear = getBirthYear(birthDate, customer?.birthYear);

  return {
    identityVerificationTxId: identityVerificationTxId ?? null,
    portoneId: identityVerification.id ?? null,
    status: identityVerification.status ?? null,
    verifiedCustomer: {
      birthYear,
      gender: toGender(customer?.gender),
      hasCi: Boolean(customer?.ci),
      hasDi: Boolean(customer?.di),
      hasName: Boolean(customer?.name),
      hasPhoneNumber: Boolean(customer?.phoneNumber),
    },
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return codedErrorResponse('METHOD_NOT_ALLOWED', 'method not allowed', 405);
  }

  let stage = 'parse_request';

  try {
    const body = await req.json() as ConfirmBody;
    const identityVerificationId = body.identityVerificationId?.trim();

    if (!identityVerificationId) {
      return codedErrorResponse(
        'BAD_REQUEST',
        'identityVerificationId is required',
      );
    }

    stage = 'authenticate';
    const { supabase, user } = await getAuthenticatedUser(req);

    stage = 'find_pending_verification';
    const { data: pendingVerification, error: pendingError } = await supabase
      .from('auth_verification')
      .select('id, user_id, status')
      .eq('provider', IDENTITY_PROVIDER)
      .eq('provider_verification_id', identityVerificationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (pendingError) {
      throw pendingError;
    }

    if (!pendingVerification) {
      return codedErrorResponse(
        'NOT_FOUND',
        'identity verification request was not found',
        404,
      );
    }

    const markFailure = async (
      failureCode: IdentityFailureCode,
      failureMessage: string,
      providerMetadata: Record<string, unknown> = {},
    ) => {
      const shouldCountForLock = !LOCK_EXCLUDED_FAILURES.has(failureCode);
      const { data: recentFailures, error: recentFailuresError } = await supabase
        .from('auth_verification')
        .select('failure_code')
        .eq('user_id', user.id)
        .eq('provider', IDENTITY_PROVIDER)
        .eq('status', 'failed')
        .gte('created_at', getFailureWindowStart())
        .order('created_at', { ascending: false })
        .limit(50);

      if (recentFailuresError) {
        throw recentFailuresError;
      }

      const previousFailureCount = shouldCountForLock
        ? (recentFailures ?? []).filter((failure) =>
            !LOCK_EXCLUDED_FAILURES.has(failure.failure_code as IdentityFailureCode)
          ).length
        : 0;
      const failureCount = shouldCountForLock ? previousFailureCount + 1 : 0;
      const lockUntil =
        shouldCountForLock && failureCount >= IDENTITY_POLICY.maxConsecutiveFailures
          ? getLockUntil()
          : null;

      const { error: updateError } = await supabase
        .from('auth_verification')
        .update({
          failed_at: new Date().toISOString(),
          failure_code: failureCode,
          failure_count: failureCount,
          failure_message: failureMessage,
          identity_verification_tx_id: body.identityVerificationTxId ?? null,
          lock_until: lockUntil,
          provider_metadata: providerMetadata,
          status: 'failed',
        })
        .eq('id', pendingVerification.id);

      if (updateError) {
        throw updateError;
      }

      return { failureCount, lockUntil };
    };

    if (body.failureCode) {
      const failure = await markFailure(
        body.failureCode,
        body.failureMessage ?? '본인확인이 완료되지 않았어요.',
        {
          identityVerificationTxId: body.identityVerificationTxId ?? null,
          source: 'mobile-sdk',
        },
      );

      return codedErrorResponse(
        failure.lockUntil ? 'IDENTITY_LOCKED' : body.failureCode,
        failure.lockUntil
          ? '본인인증을 너무 많이 시도했어요. 24시간 뒤 다시 시도해주세요.'
          : '본인확인이 완료되지 않았어요.',
        failure.lockUntil ? 423 : 400,
        failure,
      );
    }

    stage = 'load_env';
    const apiSecret = getRequiredEnv('PORTONE_API_SECRET');

    stage = 'fetch_portone_verification';
    const portOneResponse = await fetch(
      `https://api.portone.io/identity-verifications/${encodeURIComponent(identityVerificationId)}`,
      {
        headers: {
          Authorization: `PortOne ${apiSecret}`,
        },
      },
    );
    const portOneBody = await portOneResponse.json().catch(() => ({}));

    if (!portOneResponse.ok) {
      const failure = await markFailure(
        'PORTONE_LOOKUP_FAILED',
        portOneBody?.message ?? 'PortOne verification lookup failed',
        {
          message: portOneBody?.message ?? null,
          type: portOneBody?.type ?? null,
        },
      );

      return codedErrorResponse(
        failure.lockUntil ? 'IDENTITY_LOCKED' : 'PORTONE_LOOKUP_FAILED',
        failure.lockUntil
          ? '본인인증을 너무 많이 시도했어요. 24시간 뒤 다시 시도해주세요.'
          : '본인확인 결과를 확인할 수 없어요.',
        failure.lockUntil ? 423 : 502,
        failure,
      );
    }

    stage = 'parse_portone_response';
    const identityVerification = (portOneBody.identityVerification
      ?? portOneBody) as PortOneIdentityVerification;

    if (identityVerification.status !== 'VERIFIED') {
      const failure = await markFailure(
        'PORTONE_NOT_VERIFIED',
        'PortOne verification is not verified',
        toSafeProviderMetadata(identityVerification, body.identityVerificationTxId),
      );

      return codedErrorResponse(
        failure.lockUntil ? 'IDENTITY_LOCKED' : 'PORTONE_NOT_VERIFIED',
        failure.lockUntil
          ? '본인인증을 너무 많이 시도했어요. 24시간 뒤 다시 시도해주세요.'
          : '본인확인이 완료되지 않았어요.',
        failure.lockUntil ? 423 : 400,
        failure,
      );
    }

    const customer = identityVerification.verifiedCustomer;
    const birthDate = toBirthDate(customer ?? {});
    const birthYear = getBirthYear(birthDate, customer?.birthYear);
    const gender = toGender(customer?.gender);

    if (!customer?.ci || birthYear == null) {
      const failure = await markFailure(
        'MISSING_VERIFIED_CUSTOMER',
        'PortOne verified customer is incomplete',
        toSafeProviderMetadata(identityVerification, body.identityVerificationTxId),
      );

      return codedErrorResponse(
        failure.lockUntil ? 'IDENTITY_LOCKED' : 'MISSING_VERIFIED_CUSTOMER',
        failure.lockUntil
          ? '본인인증을 너무 많이 시도했어요. 24시간 뒤 다시 시도해주세요.'
          : '본인확인 결과가 충분하지 않아요.',
        failure.lockUntil ? 423 : 400,
        failure,
      );
    }

    if (!isAdult(birthDate, birthYear)) {
      await markFailure(
        'UNDERAGE',
        `만 ${IDENTITY_POLICY.minAge}세 이상만 이용할 수 있어요.`,
        {
          ...toSafeProviderMetadata(identityVerification, body.identityVerificationTxId),
          isAdult: false,
        },
      );

      return codedErrorResponse(
        'UNDERAGE',
        `만 ${IDENTITY_POLICY.minAge}세 이상만 이용할 수 있어요.`,
        403,
      );
    }

    stage = 'hash_verified_customer';
    const ciHash = await hashIdentityValue('ci', customer.ci);
    const diHash = await hashIdentityValue('di', customer.di);

    if (!ciHash) {
      throw new Error('CI hash is required');
    }

    stage = 'find_duplicate_ci';
    const { data: duplicate, error: duplicateError } = await supabase
      .from('auth_verification')
      .select('user_id')
      .eq('provider', IDENTITY_PROVIDER)
      .eq('status', 'verified')
      .eq('ci_hash', ciHash)
      .neq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (duplicateError) {
      throw duplicateError;
    }

    if (duplicate) {
      await markFailure(
        'CI_DUPLICATE',
        '이미 가입된 본인확인 정보입니다.',
        {
          ...toSafeProviderMetadata(identityVerification, body.identityVerificationTxId),
          duplicateMatch: true,
        },
      );

      return codedErrorResponse(
        'CI_DUPLICATE',
        '이미 가입된 번호예요. 그 계정으로 들어갈게요.',
        409,
        { existingMember: true },
      );
    }

    const verifiedAt = identityVerification.verifiedAt ?? new Date().toISOString();
    const providerMetadata = {
      ...toSafeProviderMetadata(identityVerification, body.identityVerificationTxId),
      isAdult: true,
    };

    stage = 'update_verification';
    const { error: verificationUpdateError } = await supabase
      .from('auth_verification')
      .update({
        ci_hash: ciHash,
        di_hash: diHash,
        failed_at: null,
        failure_code: null,
        failure_count: 0,
        failure_message: null,
        identity_verification_tx_id: body.identityVerificationTxId ?? null,
        lock_until: null,
        provider_metadata: providerMetadata,
        status: 'verified',
        verified_at: verifiedAt,
      })
      .eq('id', pendingVerification.id);

    if (verificationUpdateError) {
      throw verificationUpdateError;
    }

    stage = 'update_profile';
    const { error: profileUpdateError } = await supabase
      .from('profile')
      .upsert(
        {
          birth_year: birthYear,
          gender,
          is_adult: true,
          user_id: user.id,
        },
        { onConflict: 'user_id' },
      );

    if (profileUpdateError) {
      throw profileUpdateError;
    }

    return jsonResponse({
      birthYear,
      gender,
      identityVerifiedAt: verifiedAt,
      isAdult: true,
    });
  } catch (error) {
    const message = getErrorMessage(error, 'failed to confirm verification');
    const publicMessage =
      message.includes('configured') || message.includes('authentication required')
        ? message
        : '본인확인 결과를 저장할 수 없어요.';

    return codedErrorResponse('BAD_REQUEST', publicMessage, 400, { stage });
  }
});
