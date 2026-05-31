import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import {
  codedErrorResponse,
  getFailureWindowStart,
  getLockUntil,
  getRequiredEnv,
  IDENTITY_PROVIDER,
  IDENTITY_POLICY,
  toIdentityVerificationId,
  type IdentityFailureCode,
} from '../_shared/identity-verification.ts';

const LOCK_EXCLUDED_FAILURES = new Set<IdentityFailureCode>([
  'CI_DUPLICATE',
  'IDENTITY_ALREADY_VERIFIED',
  'UNDERAGE',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return codedErrorResponse('METHOD_NOT_ALLOWED', 'method not allowed', 405);
  }

  try {
    const storeId = getRequiredEnv('PORTONE_STORE_ID');
    const channelKey = getRequiredEnv('PORTONE_IDENTITY_CHANNEL_KEY');
    const { supabase, user } = await getAuthenticatedUser(req);
    const now = new Date().toISOString();

    const { data: verified, error: verifiedError } = await supabase
      .from('auth_verification')
      .select('id, ci_hash')
      .eq('user_id', user.id)
      .eq('provider', IDENTITY_PROVIDER)
      .eq('status', 'verified')
      .not('ci_hash', 'is', null)
      .limit(1)
      .maybeSingle();

    if (verifiedError) {
      throw verifiedError;
    }

    if (!verified?.ci_hash) {
      return codedErrorResponse(
        'NOT_FOUND',
        '본인인증 정보가 없어 재확인을 시작할 수 없어요.',
        404,
      );
    }

    const { data: lock, error: lockError } = await supabase
      .from('auth_verification')
      .select('lock_until')
      .eq('user_id', user.id)
      .eq('provider', IDENTITY_PROVIDER)
      .gt('lock_until', now)
      .order('lock_until', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lockError) {
      throw lockError;
    }

    if (lock?.lock_until) {
      return codedErrorResponse(
        'IDENTITY_LOCKED',
        '본인인증을 너무 많이 시도했어요. 24시간 뒤 다시 시도해주세요.',
        423,
        { lockUntil: lock.lock_until },
      );
    }

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

    const failureCount = (recentFailures ?? []).filter((failure) =>
      !LOCK_EXCLUDED_FAILURES.has(failure.failure_code as IdentityFailureCode)
    ).length;

    if (failureCount >= IDENTITY_POLICY.maxConsecutiveFailures) {
      return codedErrorResponse(
        'IDENTITY_LOCKED',
        '본인인증을 너무 많이 시도했어요. 24시간 뒤 다시 시도해주세요.',
        423,
        { lockUntil: getLockUntil() },
      );
    }

    const identityVerificationId = toIdentityVerificationId();
    const customData = JSON.stringify({
      purpose: 'withdraw',
      source: 'mobile',
      userId: user.id,
    });

    const { error: insertError } = await supabase.from('auth_verification').insert({
      provider: IDENTITY_PROVIDER,
      provider_metadata: {
        purpose: 'withdraw',
        source: 'mobile',
      },
      provider_verification_id: identityVerificationId,
      status: 'pending',
      user_id: user.id,
    });

    if (insertError) {
      throw insertError;
    }

    return jsonResponse({
      channelKey,
      customData,
      identityVerificationId,
      storeId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'failed to start withdrawal verification';
    return codedErrorResponse('BAD_REQUEST', message);
  }
});
