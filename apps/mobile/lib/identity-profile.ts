import type {
  IdentityProfileSnapshot,
  IdentityVerificationSnapshot,
  VerifiedIdentityProfileSnapshot,
} from '@/lib/auth-flow';
import {
  hasVerifiedIdentity,
  mergeProfileWithVerifiedIdentity,
} from '@/lib/auth-flow';
import { supabase } from '@/lib/supabase';

export const VERIFIED_IDENTITY_SELECT = 'provider_metadata, verified_at';

export async function repairProfileIdentityFromVerification<
  Profile extends IdentityProfileSnapshot,
>({
  profile,
  userId,
  verification,
}: {
  profile: Profile | null | undefined;
  userId: string;
  verification?: IdentityVerificationSnapshot | null;
}): Promise<Profile | (Profile & VerifiedIdentityProfileSnapshot) | null> {
  const repairedProfile = mergeProfileWithVerifiedIdentity(profile, verification);

  if (!hasVerifiedIdentity(repairedProfile)) {
    return repairedProfile;
  }

  if (hasVerifiedIdentity(profile)) {
    return repairedProfile;
  }

  const { error } = await supabase
    .from('profile')
    .update({
      birth_date: repairedProfile.birth_date ?? null,
      birth_year: repairedProfile.birth_year,
      gender: repairedProfile.gender ?? null,
      is_adult: true,
    })
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return repairedProfile;
}
