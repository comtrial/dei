import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { captureEdgeError } from '../_shared/log.ts';
import {
  codedErrorResponse,
  IDENTITY_POLICY,
  IDENTITY_PROVIDER,
} from '../_shared/identity-verification.ts';

type WithdrawBody = {
  detail?: unknown;
  reason?: unknown;
};

const RECENT_REAUTH_WINDOW_MS = 10 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return codedErrorResponse('METHOD_NOT_ALLOWED', 'method not allowed', 405);
  }

  // IRREVERSIBLE action — catch 에서 식별자를 잃지 않도록 hoist.
  let userId: string | undefined;
  let withdrawStage = 'withdraw_account_pipeline';
  let capturedReason: string | null = null;

  try {
    const { supabase, user } = await getAuthenticatedUser(req);
    userId = user.id;
    const body = await req.json().catch(() => ({})) as WithdrawBody;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : null;
    const detail = typeof body.detail === 'string' ? body.detail.trim() : null;
    capturedReason = reason;
    const verifiedAfter = new Date(Date.now() - RECENT_REAUTH_WINDOW_MS).toISOString();

    const { data: recentVerification, error: verificationError } = await supabase
      .from('auth_verification')
      .select('ci_hash, id, verified_at')
      .eq('user_id', user.id)
      .eq('provider', IDENTITY_PROVIDER)
      .eq('status', 'verified')
      .eq('provider_metadata->>purpose', 'withdraw')
      .gte('verified_at', verifiedAfter)
      .order('verified_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (verificationError) {
      throw verificationError;
    }

    if (!recentVerification) {
      return codedErrorResponse(
        'BAD_REQUEST',
        '본인인증 재확인이 필요해요.',
        403,
      );
    }

    if (!recentVerification.ci_hash) {
      return codedErrorResponse(
        'BAD_REQUEST',
        '탈퇴 제한 정보를 저장할 수 없어요. 고객센터로 문의해주세요.',
        400,
      );
    }

    const rejoinLockedUntil = new Date(
      Date.now() + IDENTITY_POLICY.rejoinLockDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error: lockError } = await supabase.from('identity_rejoin_lock').upsert(
      {
        ci_hash: recentVerification.ci_hash,
        locked_until: rejoinLockedUntil,
        reason: 'withdraw',
        user_id: user.id,
      },
      { onConflict: 'ci_hash,reason' },
    );

    if (lockError) {
      throw lockError;
    }

    const { error: auditError } = await supabase.from('audit').insert({
      action: 'account_withdrawn',
      actor_user_id: user.id,
      detail: {
        detail,
        reason,
        rejoinLockedUntil,
        reauthVerificationId: recentVerification.id,
      },
      target: user.id,
    });

    if (auditError) {
      throw auditError;
    }

    // rejoin-lock·audit 는 이미 기록됐는데 deleteUser 가 실패하면 '반쯤 탈퇴'
    // 상태가 된다 — 별도 stage 로 즉시 식별 가능하게 한다.
    withdrawStage = 'delete_user';
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id, true);
    if (deleteError) {
      throw deleteError;
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    captureEdgeError('withdraw-account', error, {
      stage: withdrawStage,
      status: 500,
      userId,
      tags: { feature: 'account-withdraw', code: 'BAD_REQUEST' },
      extra: { reason: capturedReason },
    });
    const message = error instanceof Error ? error.message : 'failed to withdraw account';
    return codedErrorResponse('BAD_REQUEST', message, 400);
  }
});
