export type IdentityProfileSnapshot = {
  bio?: string | null;
  birth_date?: string | null;
  birth_year?: number | null;
  gender?: string | null;
  is_adult?: boolean | null;
  nickname?: string | null;
  onboarding_completed_at?: string | null;
  photo_url?: string | null;
  region?: string | null;
};

export type IdentityVerificationSnapshot = {
  provider_metadata?: unknown | null;
  verified_at?: string | null;
};

export type VerifiedIdentityProfileSnapshot = IdentityProfileSnapshot & {
  birth_year: number;
  is_adult: true;
};

export type AuthGateRoute = 'terms' | 'profileStep1' | 'profileStep2' | 'profileStep3' | null;

export type AppGateState = {
  hasCurrentTermsAgreement: boolean;
  hasVerifiedIdentityRecord: boolean;
};

export function hasVerifiedIdentity<Profile extends IdentityProfileSnapshot>(
  profile?: Profile | null,
): profile is Profile & VerifiedIdentityProfileSnapshot {
  return Boolean(profile?.is_adult && profile.birth_year);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toBirthYear(value: unknown) {
  const year = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(year) ? year : null;
}

function toGender(value: unknown) {
  if (value === 'male' || value === 'female') {
    return value;
  }

  return null;
}

function hasProfileGender(profile?: IdentityProfileSnapshot | null) {
  return profile?.gender === 'male' || profile?.gender === 'female';
}

export function getVerifiedIdentityFromVerification(
  verification?: IdentityVerificationSnapshot | null,
): VerifiedIdentityProfileSnapshot | null {
  const metadata = verification?.provider_metadata;

  if (!isRecord(metadata)) {
    return null;
  }

  const verifiedCustomer = metadata.verifiedCustomer;

  if (!isRecord(verifiedCustomer)) {
    return null;
  }

  const birthYear = toBirthYear(verifiedCustomer.birthYear);

  if (!birthYear) {
    return null;
  }

  return {
    birth_date: typeof verifiedCustomer.birthDate === 'string'
      ? verifiedCustomer.birthDate
      : null,
    birth_year: birthYear,
    gender: toGender(verifiedCustomer.gender),
    is_adult: true,
  };
}

export function mergeProfileWithVerifiedIdentity<
  Profile extends IdentityProfileSnapshot,
>(
  profile: Profile | null | undefined,
  verification?: IdentityVerificationSnapshot | null,
): Profile | (Profile & VerifiedIdentityProfileSnapshot) | null {
  if (hasVerifiedIdentity(profile)) {
    return profile;
  }

  const identity = getVerifiedIdentityFromVerification(verification);

  if (!identity) {
    return profile ?? null;
  }

  if (!profile) {
    return identity as Profile & VerifiedIdentityProfileSnapshot;
  }

  return {
    ...(profile ?? {}),
    birth_date: profile?.birth_date ?? identity.birth_date,
    birth_year: identity.birth_year,
    gender: profile?.gender ?? identity.gender,
    is_adult: true,
  } as Profile & VerifiedIdentityProfileSnapshot;
}

export function hasCompletedProfile(profile?: IdentityProfileSnapshot | null) {
  return (
    hasVerifiedIdentity(profile)
    && hasProfileGender(profile)
    && Boolean(profile?.nickname?.trim())
    && Boolean(profile?.photo_url?.trim())
    && Boolean(profile?.onboarding_completed_at)
  );
}

export function getAuthGateRoute(profile?: IdentityProfileSnapshot | null): AuthGateRoute {
  if (!hasVerifiedIdentity(profile)) {
    return 'terms';
  }

  if (!profile?.nickname?.trim() || !hasProfileGender(profile)) {
    return 'profileStep1';
  }

  if (!profile?.photo_url?.trim()) {
    return 'profileStep2';
  }

  if (!profile.onboarding_completed_at) {
    return 'profileStep3';
  }

  return null;
}

export function getAppGateRoute(
  profile: IdentityProfileSnapshot | null | undefined,
  state: AppGateState,
): AuthGateRoute {
  if (!state.hasVerifiedIdentityRecord) {
    return 'terms';
  }

  const authGateRoute = getAuthGateRoute(profile);
  if (authGateRoute === 'terms') {
    return 'terms';
  }

  if (!state.hasCurrentTermsAgreement) {
    return 'terms';
  }

  return authGateRoute;
}
