import type { AccountStatus } from '@dei/api';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Eligibility } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';

type ConsentInput = {
  marketingEmailOptIn?: boolean;
  marketingPushOptIn?: boolean;
};

type ProfileInput = {
  birthDate?: string;
  bio?: string;
  displayName: string;
  gender?: string;
};

type AccountGateContextValue = {
  eligibility: Eligibility | null;
  error: string | null;
  isLoading: boolean;
  acceptConsents: (input?: ConsentInput) => Promise<void>;
  completeLocalDevIdentityVerification: () => Promise<AccountStatus>;
  completeProfile: (input: ProfileInput) => Promise<AccountStatus>;
  refresh: () => Promise<Eligibility | null>;
};

const AccountGateContext = createContext<AccountGateContextValue | null>(null);

const CONSENT_VERSION = '2026-04-25';

export function AccountGateProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setEligibility(null);
      setError(null);
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    setError(null);

    const { data, error: eligibilityError } = await supabase
      .rpc('get_my_eligibility')
      .maybeSingle();

    if (eligibilityError) {
      setEligibility(null);
      setError(eligibilityError.message);
      setIsLoading(false);
      throw eligibilityError;
    }

    setEligibility(data);
    setIsLoading(false);
    return data;
  }, [user]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    refresh().catch(() => undefined);
  }, [isAuthLoading, refresh]);

  const acceptConsents = useCallback(
    async (input: ConsentInput = {}) => {
      const { error: consentError } = await supabase.rpc('accept_required_consents', {
        p_age_policy_version: CONSENT_VERSION,
        p_community_guidelines_version: CONSENT_VERSION,
        p_marketing_email_opt_in: input.marketingEmailOptIn ?? false,
        p_marketing_push_opt_in: input.marketingPushOptIn ?? false,
        p_privacy_version: CONSENT_VERSION,
        p_terms_version: CONSENT_VERSION,
      });

      if (consentError) {
        throw consentError;
      }

      await refresh();
    },
    [refresh],
  );

  const completeLocalDevIdentityVerification = useCallback(async () => {
    const { data, error: devVerificationError } = await supabase
      .rpc('complete_local_dev_identity_verification')
      .single();

    if (devVerificationError) {
      throw devVerificationError;
    }

    await refresh();
    return data;
  }, [refresh]);

  const completeProfile = useCallback(
    async (input: ProfileInput) => {
      const { data, error: profileError } = await supabase
        .rpc('complete_profile', {
          p_birth_date: input.birthDate || undefined,
          p_bio: input.bio || undefined,
          p_display_name: input.displayName,
          p_gender: input.gender || undefined,
        })
        .single();

      if (profileError) {
        throw profileError;
      }

      await refresh();
      return data;
    },
    [refresh],
  );

  const value = useMemo<AccountGateContextValue>(
    () => ({
      eligibility,
      error,
      isLoading,
      acceptConsents,
      completeLocalDevIdentityVerification,
      completeProfile,
      refresh,
    }),
    [acceptConsents, completeLocalDevIdentityVerification, completeProfile, eligibility, error, isLoading, refresh],
  );

  return <AccountGateContext.Provider value={value}>{children}</AccountGateContext.Provider>;
}

export function useAccountGate() {
  const context = useContext(AccountGateContext);

  if (!context) {
    throw new Error('useAccountGate must be used within AccountGateProvider');
  }

  return context;
}
