import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import {
  codedErrorResponse,
  getBirthYear,
  getRequiredEnv,
  hashIdentityValue,
  IDENTITY_PROVIDER,
  toBirthDate,
  toGender,
} from '../_shared/identity-verification.ts';

type ConfirmBody = {
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

const safeMetadata = (
  identityVerification: PortOneIdentityVerification,
  identityVerificationTxId?: string,
) => {
  const customer = identityVerification.verifiedCustomer;
  const birthDate = toBirthDate(customer ?? {});

  return {
    identityVerificationTxId: identityVerificationTxId ?? null,
    portoneId: identityVerification.id ?? null,
    purpose: 'withdraw',
    status: identityVerification.status ?? null,
    verifiedCustomer: {
      birthDate,
      birthYear: getBirthYear(birthDate, customer?.birthYear),
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
    const { data: pending, error: pendingError } = await supabase
      .from('auth_verification')
      .select('id, provider_metadata')
      .eq('provider', IDENTITY_PROVIDER)
      .eq('provider_verification_id', identityVerificationId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();

    if (pendingError) {
      throw pendingError;
    }

    if (!pending) {
      return codedErrorResponse(
        'NOT_FOUND',
        'withdraw identity verification request was not found',
        404,
      );
    }

    const metadata = pending.provider_metadata as { purpose?: string } | null;
    if (metadata?.purpose !== 'withdraw') {
      return codedErrorResponse(
        'BAD_REQUEST',
        'withdraw identity verification request is invalid',
        400,
      );
    }

    const markFailed = async (message: string, providerMetadata: Record<string, unknown>) => {
      const { error } = await supabase
        .from('auth_verification')
        .update({
          failed_at: new Date().toISOString(),
          failure_code: 'PORTONE_NOT_VERIFIED',
          failure_count: 1,
          failure_message: message,
          identity_verification_tx_id: body.identityVerificationTxId ?? null,
          provider_metadata: providerMetadata,
          status: 'failed',
        })
        .eq('id', pending.id);

      if (error) {
        throw error;
      }
    };

    stage = 'fetch_portone_verification';
    const apiSecret = getRequiredEnv('PORTONE_API_SECRET');
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
      await markFailed(
        portOneBody?.message ?? 'PortOne verification lookup failed',
        {
          message: portOneBody?.message ?? null,
          purpose: 'withdraw',
          type: portOneBody?.type ?? null,
        },
      );

      return codedErrorResponse(
        'PORTONE_LOOKUP_FAILED',
        '본인확인 결과를 확인할 수 없어요.',
        502,
      );
    }

    stage = 'parse_portone_response';
    const identityVerification = (portOneBody.identityVerification
      ?? portOneBody) as PortOneIdentityVerification;

    if (identityVerification.status !== 'VERIFIED') {
      await markFailed(
        'PortOne verification is not verified',
        safeMetadata(identityVerification, body.identityVerificationTxId),
      );

      return codedErrorResponse(
        'PORTONE_NOT_VERIFIED',
        '본인확인이 완료되지 않았어요.',
        400,
      );
    }

    const customer = identityVerification.verifiedCustomer;
    const ciHash = await hashIdentityValue('ci', customer?.ci);
    const diHash = await hashIdentityValue('di', customer?.di);

    if (!ciHash) {
      await markFailed(
        'PortOne verified customer is incomplete',
        safeMetadata(identityVerification, body.identityVerificationTxId),
      );

      return codedErrorResponse(
        'MISSING_VERIFIED_CUSTOMER',
        '본인확인 결과가 충분하지 않아요.',
        400,
      );
    }

    stage = 'verify_same_identity';
    const { data: existing, error: existingError } = await supabase
      .from('auth_verification')
      .select('id')
      .eq('provider', IDENTITY_PROVIDER)
      .eq('status', 'verified')
      .eq('user_id', user.id)
      .eq('ci_hash', ciHash)
      .neq('id', pending.id)
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (!existing) {
      await markFailed(
        'withdraw identity verification does not match current account',
        safeMetadata(identityVerification, body.identityVerificationTxId),
      );

      return codedErrorResponse(
        'PORTONE_NOT_VERIFIED',
        '현재 계정의 본인인증 정보와 일치하지 않아요.',
        403,
      );
    }

    const verifiedAt = identityVerification.verifiedAt ?? new Date().toISOString();

    stage = 'mark_verified';
    const { error: updateError } = await supabase
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
        provider_metadata: safeMetadata(identityVerification, body.identityVerificationTxId),
        status: 'verified',
        verified_at: verifiedAt,
      })
      .eq('id', pending.id);

    if (updateError) {
      throw updateError;
    }

    return jsonResponse({ identityVerifiedAt: verifiedAt, ok: true });
  } catch (_error) {
    return codedErrorResponse(
      'BAD_REQUEST',
      '본인확인 결과를 저장할 수 없어요.',
      400,
      { stage },
    );
  }
});
