import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { sha256 } from '../_shared/hash.ts';

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
    birthYear?: number;
    ci?: string;
    di?: string;
    gender?: string;
    name?: string;
    phoneNumber?: string;
  };
};

type ExistingAccountSnapshot = {
  accountState: string | null;
  discoveryEnabled: boolean;
  firstVideoUploaded: boolean;
  onboardingState: string | null;
  profileComplete: boolean;
};

const toSafeProviderMetadata = (
  identityVerification: PortOneIdentityVerification,
  identityVerificationTxId?: string,
) => ({
  identityVerificationTxId: identityVerificationTxId ?? null,
  portoneId: identityVerification.id ?? null,
  status: identityVerification.status ?? null,
  verifiedCustomer: {
    birthDate: identityVerification.verifiedCustomer?.birthDate ?? null,
    birthYear: identityVerification.verifiedCustomer?.birthYear ?? null,
    gender: identityVerification.verifiedCustomer?.gender ?? null,
    hasCi: Boolean(identityVerification.verifiedCustomer?.ci),
    hasDi: Boolean(identityVerification.verifiedCustomer?.di),
    hasName: Boolean(identityVerification.verifiedCustomer?.name),
    hasPhoneNumber: Boolean(identityVerification.verifiedCustomer?.phoneNumber),
  },
});

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
};

const getPhoneCountryCode = (phoneNumber?: string) => {
  if (!phoneNumber) {
    return null;
  }

  return phoneNumber.startsWith('+82') ? '+82' : null;
};

const getPhoneHash = async (phoneNumber?: string) => {
  if (!phoneNumber) {
    return null;
  }

  const salt = getRequiredEnv('PHONE_HASH_SALT');
  return sha256(`${salt}:${phoneNumber}`);
};

const getIdentityHash = async (type: 'ci' | 'di', value?: string) => {
  if (!value) {
    return null;
  }

  const salt = getRequiredEnv('PHONE_HASH_SALT');
  return sha256(`${salt}:${type}:${value}`);
};

const getIdentityMatchFilter = ({
  ciHash,
  diHash,
  phoneHash,
}: {
  ciHash: string | null;
  diHash: string | null;
  phoneHash: string | null;
}) => {
  if (ciHash) {
    return `ci_hash.eq.${ciHash}`;
  }

  if (diHash) {
    return `di_hash.eq.${diHash}`;
  }

  if (phoneHash) {
    return `phone_hash.eq.${phoneHash}`;
  }

  return '';
};

const getMatchedKeys = ({
  existingProfile,
  ciHash,
  diHash,
  phoneHash,
}: {
  existingProfile: {
    ci_hash?: string | null;
    di_hash?: string | null;
    phone_hash?: string | null;
  };
  ciHash: string | null;
  diHash: string | null;
  phoneHash: string | null;
}) => {
  const keys: string[] = [];

  if (ciHash && existingProfile.ci_hash === ciHash) {
    keys.push('ci');
  }

  if (diHash && existingProfile.di_hash === diHash) {
    keys.push('di');
  }

  if (phoneHash && existingProfile.phone_hash === phoneHash) {
    keys.push('phone');
  }

  return keys;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('method not allowed', 405);
  }

  try {
    const body = await req.json() as ConfirmBody;
    const identityVerificationId = body.identityVerificationId?.trim();

    if (!identityVerificationId) {
      return errorResponse('identityVerificationId is required');
    }

    const apiSecret = getRequiredEnv('PORTONE_API_SECRET');
    const { supabase, user } = await getAuthenticatedUser(req);

    const { data: pendingVerification, error: pendingError } = await supabase
      .from('identity_verifications')
      .select('id, user_id, status')
      .eq('provider', 'portone')
      .eq('provider_verification_id', identityVerificationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (pendingError) {
      throw pendingError;
    }

    if (!pendingVerification) {
      return errorResponse('identity verification request was not found', 404);
    }

    const portOneResponse = await fetch(
      `https://api.portone.io/identity-verifications/${encodeURIComponent(identityVerificationId)}`,
      {
        headers: {
          Authorization: `PortOne ${apiSecret}`,
        },
      },
    );

    const portOneBody = await portOneResponse.json();

    if (!portOneResponse.ok) {
      await supabase
        .from('identity_verifications')
        .update({
          failed_at: new Date().toISOString(),
          failure_message: portOneBody?.message ?? 'PortOne verification lookup failed',
          provider_metadata: {
            message: portOneBody?.message ?? null,
            type: portOneBody?.type ?? null,
          },
          status: 'failed',
        })
        .eq('id', pendingVerification.id);

      return errorResponse(portOneBody?.message ?? 'PortOne verification lookup failed', 502);
    }

    const identityVerification = (portOneBody.identityVerification
      ?? portOneBody) as PortOneIdentityVerification;

    if (identityVerification.status !== 'VERIFIED') {
      await supabase
        .from('identity_verifications')
        .update({
          failed_at: new Date().toISOString(),
          failure_code: identityVerification.status ?? 'UNKNOWN',
          failure_message: 'PortOne verification is not verified',
          provider_metadata: toSafeProviderMetadata(
            identityVerification,
            body.identityVerificationTxId,
          ),
          status: 'failed',
        })
        .eq('id', pendingVerification.id);

      return errorResponse('PortOne verification is not verified', 400);
    }

    const verifiedAt = identityVerification.verifiedAt ?? new Date().toISOString();
    const verifiedCustomer = identityVerification.verifiedCustomer;
    const phoneNumber = verifiedCustomer?.phoneNumber;
    const ciHash = await getIdentityHash('ci', verifiedCustomer?.ci);
    const diHash = await getIdentityHash('di', verifiedCustomer?.di);
    const phoneHash = await getPhoneHash(phoneNumber);
    const phoneCountryCode = getPhoneCountryCode(phoneNumber);
    const identityMatchFilter = getIdentityMatchFilter({ ciHash, diHash, phoneHash });

    if (identityMatchFilter) {
      const { data: existingProfile, error: existingProfileError } = await supabase
        .from('private_profiles')
        .select('user_id, ci_hash, di_hash, phone_hash')
        .neq('user_id', user.id)
        .or(identityMatchFilter)
        .limit(1)
        .maybeSingle();

      if (existingProfileError) {
        throw existingProfileError;
      }

      if (existingProfile) {
        const { data: existingAccount, error: existingAccountError } = await supabase
          .from('account_status')
          .select('account_state, onboarding_state, profile_completed_at, first_video_uploaded_at, discovery_enabled_at')
          .eq('user_id', existingProfile.user_id)
          .maybeSingle();

        if (existingAccountError) {
          throw existingAccountError;
        }

        const existingAccountSnapshot: ExistingAccountSnapshot | null = existingAccount
          ? {
              accountState: existingAccount.account_state,
              discoveryEnabled: Boolean(existingAccount.discovery_enabled_at),
              firstVideoUploaded: Boolean(existingAccount.first_video_uploaded_at),
              onboardingState: existingAccount.onboarding_state,
              profileComplete: Boolean(existingAccount.profile_completed_at),
            }
          : null;
        const matchedKeys = getMatchedKeys({
          ciHash,
          diHash,
          existingProfile,
          phoneHash,
        });
        const { error: transferError } = await supabase.rpc('transfer_existing_member_account', {
          p_from_user_id: existingProfile.user_id,
          p_to_user_id: user.id,
        });

        if (transferError) {
          throw transferError;
        }

        const { error: transferredVerificationUpdateError } = await supabase
          .from('identity_verifications')
          .update({
            ci_hash: ciHash,
            di_hash: diHash,
            failure_code: null,
            failure_message: null,
            phone_country_code: phoneCountryCode,
            phone_hash: phoneHash,
            provider_metadata: {
              ...toSafeProviderMetadata(identityVerification, body.identityVerificationTxId),
              duplicateMatch: {
                matchedKeys,
                matchedUserId: existingProfile.user_id,
              },
              existingMemberTransfer: {
                fromUserId: existingProfile.user_id,
                toUserId: user.id,
              },
            },
            status: 'verified',
            verified_at: verifiedAt,
          })
          .eq('id', pendingVerification.id);

        if (transferredVerificationUpdateError) {
          throw transferredVerificationUpdateError;
        }

        const { error: transferredProfileUpdateError } = await supabase
          .from('private_profiles')
          .update({
            ci_hash: ciHash,
            di_hash: diHash,
            phone_country_code: phoneCountryCode,
            phone_hash: phoneHash,
          })
          .eq('user_id', user.id);

        if (transferredProfileUpdateError) {
          throw transferredProfileUpdateError;
        }

        const { error: transferredAccountUpdateError } = await supabase
          .from('account_status')
          .update({
            identity_verified_at: verifiedAt,
          })
          .eq('user_id', user.id)
          .is('identity_verified_at', null);

        if (transferredAccountUpdateError) {
          throw transferredAccountUpdateError;
        }

        const { data: transferredAccount, error: transferredAccountSelectError } =
          await supabase
            .from('account_status')
            .select('profile_completed_at, first_video_approved_at, discovery_enabled_at')
            .eq('user_id', user.id)
            .single();

        if (transferredAccountSelectError) {
          throw transferredAccountSelectError;
        }

        if (
          transferredAccount.profile_completed_at
          && transferredAccount.first_video_approved_at
          && !transferredAccount.discovery_enabled_at
        ) {
          const { error: transferredDiscoveryUpdateError } = await supabase
            .from('account_status')
            .update({
              discovery_enabled_at: new Date().toISOString(),
            })
            .eq('user_id', user.id);

          if (transferredDiscoveryUpdateError) {
            throw transferredDiscoveryUpdateError;
          }
        }

        const { error: oldAuthUserDeleteError } = await supabase.auth.admin.deleteUser(
          existingProfile.user_id,
        );

        if (oldAuthUserDeleteError) {
          console.warn('failed to delete transferred auth user', oldAuthUserDeleteError.message);
        }

        return jsonResponse({
          existingAccount: existingAccountSnapshot,
          existingMember: true,
          identityVerifiedAt: verifiedAt,
          matchedKeys,
          oldAuthUserDeleted: !oldAuthUserDeleteError,
          transferredFromUserId: existingProfile.user_id,
        });
      }
    }

    const { error: verificationUpdateError } = await supabase
      .from('identity_verifications')
      .update({
        ci_hash: ciHash,
        di_hash: diHash,
        phone_country_code: phoneCountryCode,
        phone_hash: phoneHash,
        provider_metadata: toSafeProviderMetadata(identityVerification, body.identityVerificationTxId),
        status: 'verified',
        verified_at: verifiedAt,
      })
      .eq('id', pendingVerification.id);

    if (verificationUpdateError) {
      throw verificationUpdateError;
    }

    const { error: profileUpdateError } = await supabase
      .from('private_profiles')
      .update({
        ci_hash: ciHash,
        di_hash: diHash,
        phone_country_code: phoneCountryCode,
        phone_hash: phoneHash,
      })
      .eq('user_id', user.id);

    if (profileUpdateError) {
      throw profileUpdateError;
    }

    const { error: accountUpdateError } = await supabase
      .from('account_status')
      .update({
        identity_verified_at: verifiedAt,
      })
      .eq('user_id', user.id);

    if (accountUpdateError) {
      throw accountUpdateError;
    }

    const { error: onboardingUpdateError } = await supabase
      .from('account_status')
      .update({
        onboarding_state: 'profile',
      })
      .eq('user_id', user.id)
      .in('onboarding_state', ['phone', 'identity_verification']);

    if (onboardingUpdateError) {
      throw onboardingUpdateError;
    }

    const { data: account, error: accountSelectError } = await supabase
      .from('account_status')
      .select('profile_completed_at, first_video_approved_at, discovery_enabled_at')
      .eq('user_id', user.id)
      .single();

    if (accountSelectError) {
      throw accountSelectError;
    }

    if (
      account.profile_completed_at
      && account.first_video_approved_at
      && !account.discovery_enabled_at
    ) {
      const { error: discoveryUpdateError } = await supabase
        .from('account_status')
        .update({
          discovery_enabled_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (discoveryUpdateError) {
        throw discoveryUpdateError;
      }
    }

    return jsonResponse({ identityVerifiedAt: verifiedAt });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'failed to confirm verification');
  }
});
