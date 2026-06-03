import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { captureEdgeError, captureEdgeMessage, normalizeError } from '../_shared/log.ts';
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

type SupabaseAdminClient = Awaited<ReturnType<typeof getAuthenticatedUser>>['supabase'];

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

type TermsAgreementRow = {
  agreed_at: string;
  location_collection: boolean;
  marketing_opt_in: boolean;
  privacy_policy: boolean;
  service_terms: boolean;
  terms_version: string;
};

const LOCK_EXCLUDED_FAILURES = new Set<IdentityFailureCode>([
  'CI_DUPLICATE',
  'IDENTITY_ALREADY_VERIFIED',
  'REJOIN_LOCKED',
  'UNDERAGE',
]);

const getErrorMessage = (error: unknown, fallback: string) => {
  const { message } = normalizeError(error);
  return message && message !== 'unknown error' ? message : fallback;
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
      birthDate,
      birthYear,
      gender: toGender(customer?.gender),
      hasCi: Boolean(customer?.ci),
      hasDi: Boolean(customer?.di),
      hasName: Boolean(customer?.name),
      hasPhoneNumber: Boolean(customer?.phoneNumber),
    },
  };
};

const toInternalIdentityEmail = (ciHash: string) => {
  return `ci-${ciHash.slice(0, 32)}@identity.dei.local`;
};

const ensureExistingUserLoginEmail = async (
  supabase: SupabaseAdminClient,
  userId: string,
  ciHash: string,
) => {
  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error || !data.user) {
    throw error ?? new Error('existing member account was not found');
  }

  const existingEmail = data.user.email?.trim();
  if (existingEmail) {
    return existingEmail;
  }

  const email = toInternalIdentityEmail(ciHash);
  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });

  if (updateError) {
    throw updateError;
  }

  return email;
};

const issueSessionForExistingUser = async (
  supabase: SupabaseAdminClient,
  email: string,
) => {
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkError || !linkData.properties?.hashed_token) {
    throw linkError ?? new Error('existing member login token was not issued');
  }

  const { data: authData, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'email',
  });

  if (verifyError || !authData.session) {
    throw verifyError ?? new Error('existing member session was not issued');
  }

  return authData.session;
};

const transferLatestTermsAgreement = async (
  supabase: SupabaseAdminClient,
  fromUserId: string,
  toUserId: string,
) => {
  const { data: latestTerms, error: latestTermsError } = await supabase
    .from('terms_agreement')
    .select(
      'agreed_at, location_collection, marketing_opt_in, privacy_policy, service_terms, terms_version',
    )
    .eq('user_id', fromUserId)
    .order('agreed_at', { ascending: false })
    .limit(1)
    .maybeSingle<TermsAgreementRow>();

  if (latestTermsError) {
    throw latestTermsError;
  }

  if (!latestTerms) {
    return;
  }

  const { error: upsertError } = await supabase.from('terms_agreement').upsert(
    {
      agreed_at: latestTerms.agreed_at,
      location_collection: latestTerms.location_collection,
      marketing_opt_in: latestTerms.marketing_opt_in,
      privacy_policy: latestTerms.privacy_policy,
      service_terms: latestTerms.service_terms,
      terms_version: latestTerms.terms_version,
      user_id: toUserId,
    },
    { onConflict: 'user_id,terms_version' },
  );

  if (upsertError) {
    throw upsertError;
  }
};

const toClientAuthSession = (session: {
  access_token: string;
  expires_at?: number;
  refresh_token: string;
  user: { id: string };
}) => ({
  accessToken: session.access_token,
  expiresAt: session.expires_at ?? null,
  refreshToken: session.refresh_token,
  userId: session.user.id,
});

const upsertVerifiedProfileIdentity = async (
  supabase: SupabaseAdminClient,
  {
    birthDate,
    birthYear,
    gender,
    userId,
  }: {
    birthDate: string | null;
    birthYear: number;
    gender: 'male' | 'female' | null;
    userId: string;
  },
) => {
  const profileIdentity = {
    birth_date: birthDate,
    birth_year: birthYear,
    is_adult: true,
    user_id: userId,
    ...(gender ? { gender } : {}),
  };

  const { error } = await supabase
    .from('profile')
    .upsert(
      profileIdentity,
      { onConflict: 'user_id' },
    );

  if (error) {
    throw error;
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return codedErrorResponse('METHOD_NOT_ALLOWED', 'method not allowed', 405);
  }

  let stage = 'parse_request';
  // catch 에서 식별자를 잃지 않도록 hoist(user 는 authenticate stage 후에야 존재).
  let userId: string | undefined;
  let capturedVerificationId: string | undefined;

  try {
    const body = await req.json() as ConfirmBody;
    const identityVerificationId = body.identityVerificationId?.trim();
    capturedVerificationId = identityVerificationId;

    if (!identityVerificationId) {
      return codedErrorResponse(
        'BAD_REQUEST',
        'identityVerificationId is required',
      );
    }

    stage = 'authenticate';
    const { supabase, user } = await getAuthenticatedUser(req);
    userId = user.id;

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

      // PortOne 인프라 장애 — 본인확인 자체가 불가(사용자 잘못 아님).
      captureEdgeMessage('confirm-identity-verification', 'PortOne verification lookup failed', {
        stage,
        status: 502,
        level: 'warning',
        userId,
        tags: { feature: 'identity-verify' },
        extra: { identityVerificationId, portoneStatus: portOneResponse.status },
      });

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

    stage = 'check_rejoin_lock';
    const now = new Date().toISOString();
    const { data: rejoinLock, error: rejoinLockError } = await supabase
      .from('identity_rejoin_lock')
      .select('locked_until')
      .eq('ci_hash', ciHash)
      .gt('locked_until', now)
      .order('locked_until', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rejoinLockError) {
      throw rejoinLockError;
    }

    if (rejoinLock?.locked_until) {
      await markFailure(
        'REJOIN_LOCKED',
        '탈퇴한 번호는 30일 동안 다시 가입할 수 없어요.',
        {
          ...toSafeProviderMetadata(identityVerification, body.identityVerificationTxId),
          rejoinLockedUntil: rejoinLock.locked_until,
        },
      );

      return codedErrorResponse(
        'REJOIN_LOCKED',
        '탈퇴한 번호는 30일 동안 다시 가입할 수 없어요.',
        423,
        { lockUntil: rejoinLock.locked_until },
      );
    }

    stage = 'find_duplicate_ci';
    const { data: duplicate, error: duplicateError } = await supabase
      .from('auth_verification')
      .select('user_id, verified_at')
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

      stage = 'issue_existing_member_session';
      const existingEmail = await ensureExistingUserLoginEmail(
        supabase,
        duplicate.user_id,
        ciHash,
      );
      const authSession = await issueSessionForExistingUser(supabase, existingEmail);

      const { data: existingProfile, error: existingProfileError } = await supabase
        .from('profile')
        .select('birth_date, birth_year, gender, is_adult')
        .eq('user_id', duplicate.user_id)
        .maybeSingle();

      if (existingProfileError) {
        throw existingProfileError;
      }

      const existingBirthDate = existingProfile?.birth_date ?? birthDate;
      const existingBirthYear = existingProfile?.birth_year ?? birthYear;
      const existingGender = existingProfile?.gender ?? gender;

      await upsertVerifiedProfileIdentity(supabase, {
        birthDate: existingBirthDate,
        birthYear: existingBirthYear,
        gender: existingGender,
        userId: duplicate.user_id,
      });

      if (user.id !== duplicate.user_id) {
        stage = 'transfer_terms_agreement';
        await transferLatestTermsAgreement(supabase, user.id, duplicate.user_id);

        stage = 'delete_duplicate_anonymous_user';
        await supabase.auth.admin.deleteUser(user.id, true);
      }

      return jsonResponse({
        authSession: toClientAuthSession(authSession),
        birthDate: existingBirthDate,
        birthYear: existingBirthYear,
        existingMember: true,
        gender: existingGender,
        identityVerifiedAt: duplicate.verified_at ?? new Date().toISOString(),
        isAdult: true,
      });
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
    await upsertVerifiedProfileIdentity(supabase, {
      birthDate,
      birthYear,
      gender,
      userId: user.id,
    });

    return jsonResponse({
      birthDate,
      birthYear,
      gender,
      identityVerifiedAt: verifiedAt,
      isAdult: true,
    });
  } catch (error) {
    // 최고 위험 사각지대 — CI_DUPLICATE 계정 병합/세션 발급 단계의 throw 가
    // 여기서만 드러난다(account-takeover/merge 흐름). stage 로 어느 단계인지 식별.
    captureEdgeError('confirm-identity-verification', error, {
      stage,
      status: 500,
      userId,
      tags: { feature: 'identity-verify', code: 'BAD_REQUEST' },
      extra: { identityVerificationId: capturedVerificationId },
    });
    const message = getErrorMessage(error, 'failed to confirm verification');
    const publicMessage =
      message.includes('configured') || message.includes('authentication required')
        ? message
        : '본인확인 결과를 저장할 수 없어요.';

    return codedErrorResponse('BAD_REQUEST', publicMessage, 400, { stage });
  }
});
