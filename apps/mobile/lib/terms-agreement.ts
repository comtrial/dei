import { TERMS_VERSION } from '@/lib/b-flow';
import { supabase } from '@/lib/supabase';

export type TermsAgreementDraft = {
  location_collection: boolean;
  marketing_opt_in: boolean;
  privacy_policy: boolean;
  service_terms: boolean;
};

let pendingTermsAgreement: TermsAgreementDraft | null = null;

export function rememberPendingTermsAgreement(draft: TermsAgreementDraft) {
  pendingTermsAgreement = { ...draft };
}

export function consumePendingTermsAgreement() {
  const draft = pendingTermsAgreement;
  pendingTermsAgreement = null;
  return draft;
}

const FALLBACK_TERMS_AGREEMENT: TermsAgreementDraft = {
  location_collection: false,
  marketing_opt_in: false,
  privacy_policy: true,
  service_terms: true,
};

export async function ensureLatestTermsAgreementForCurrentUser(
  draft = consumePendingTermsAgreement(),
) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const userId = sessionData.session?.user.id;

  if (!userId) {
    throw new Error('기존 계정 세션을 확인할 수 없어요.');
  }

  const { data: existingTerms, error: termsError } = await supabase
    .from('terms_agreement')
    .select('id')
    .eq('user_id', userId)
    .eq('terms_version', TERMS_VERSION)
    .maybeSingle();

  if (termsError) {
    throw termsError;
  }

  if (existingTerms) {
    return;
  }

  const agreement = draft ?? FALLBACK_TERMS_AGREEMENT;
  const { error: upsertError } = await supabase.from('terms_agreement').upsert(
    {
      agreed_at: new Date().toISOString(),
      location_collection: agreement.location_collection,
      marketing_opt_in: agreement.marketing_opt_in,
      privacy_policy: agreement.privacy_policy,
      service_terms: agreement.service_terms,
      terms_version: TERMS_VERSION,
      user_id: userId,
    },
    { onConflict: 'user_id,terms_version' },
  );

  if (upsertError) {
    throw upsertError;
  }
}
