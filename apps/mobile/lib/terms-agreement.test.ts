import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  consumePendingTermsAgreement,
  ensureLatestTermsAgreementForCurrentUser,
  rememberPendingTermsAgreement,
} from './terms-agreement';

const supabaseMocks = vi.hoisted(() => {
  const termsTable = {
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    select: vi.fn(),
    upsert: vi.fn(),
  };

  termsTable.select.mockReturnValue(termsTable);
  termsTable.eq.mockReturnValue(termsTable);

  return {
    from: vi.fn(() => termsTable),
    getSession: vi.fn(),
    termsTable,
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: supabaseMocks.getSession,
    },
    from: supabaseMocks.from,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  consumePendingTermsAgreement();

  supabaseMocks.from.mockReturnValue(supabaseMocks.termsTable);
  supabaseMocks.getSession.mockResolvedValue({
    data: { session: { user: { id: 'existing-user-id' } } },
    error: null,
  });
  supabaseMocks.termsTable.maybeSingle.mockResolvedValue({
    data: null,
    error: null,
  });
  supabaseMocks.termsTable.upsert.mockResolvedValue({ error: null });
});

describe('terms agreement handoff', () => {
  it('remembers and consumes the latest agreement draft once', () => {
    rememberPendingTermsAgreement({
      location_collection: true,
      marketing_opt_in: false,
      privacy_policy: true,
      service_terms: true,
    });

    expect(consumePendingTermsAgreement()).toEqual({
      location_collection: true,
      marketing_opt_in: false,
      privacy_policy: true,
      service_terms: true,
    });
    expect(consumePendingTermsAgreement()).toBeNull();
  });

  it('does not overwrite an existing current-version agreement', async () => {
    supabaseMocks.termsTable.maybeSingle.mockResolvedValueOnce({
      data: { id: 'terms-id' },
      error: null,
    });
    rememberPendingTermsAgreement({
      location_collection: true,
      marketing_opt_in: true,
      privacy_policy: true,
      service_terms: true,
    });

    await ensureLatestTermsAgreementForCurrentUser();

    expect(supabaseMocks.termsTable.upsert).not.toHaveBeenCalled();
    expect(consumePendingTermsAgreement()).toBeNull();
  });

  it('creates a current-version agreement for an existing-member login when missing', async () => {
    rememberPendingTermsAgreement({
      location_collection: true,
      marketing_opt_in: false,
      privacy_policy: true,
      service_terms: true,
    });

    await ensureLatestTermsAgreementForCurrentUser();

    expect(supabaseMocks.termsTable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        location_collection: true,
        marketing_opt_in: false,
        privacy_policy: true,
        service_terms: true,
        user_id: 'existing-user-id',
      }),
      { onConflict: 'user_id,terms_version' },
    );
  });
});
