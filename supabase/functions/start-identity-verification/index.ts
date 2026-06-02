import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import {
  codedErrorResponse,
  getRequiredEnv,
  IDENTITY_PROVIDER,
  toIdentityVerificationId,
} from '../_shared/identity-verification.ts';

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
      .select('id')
      .eq('user_id', user.id)
      .eq('provider', IDENTITY_PROVIDER)
      .eq('status', 'verified')
      .limit(1)
      .maybeSingle();

    if (verifiedError) {
      throw verifiedError;
    }

    if (verified) {
      return codedErrorResponse(
        'IDENTITY_ALREADY_VERIFIED',
        '이미 본인인증이 완료됐어요.',
        409,
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

    const identityVerificationId = toIdentityVerificationId();
    const customData = JSON.stringify({ source: 'mobile', userId: user.id });

    const { error: insertError } = await supabase.from('auth_verification').insert({
      provider: IDENTITY_PROVIDER,
      provider_metadata: {
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
    const message = error instanceof Error ? error.message : 'failed to start verification';
    return codedErrorResponse('BAD_REQUEST', message);
  }
});
