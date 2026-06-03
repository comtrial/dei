import { describe, expect, it } from 'vitest';

import {
  getAppGateRoute,
  getVerifiedIdentityFromVerification,
  getAuthGateRoute,
  hasCompletedProfile,
  hasVerifiedIdentity,
  mergeProfileWithVerifiedIdentity,
} from './auth-flow';

describe('auth-flow', () => {
  it('requires terms and identity verification when identity is not complete', () => {
    expect(getAuthGateRoute(null)).toBe('terms');
    expect(getAuthGateRoute({ is_adult: false, birth_year: 2001, nickname: '하루' })).toBe('terms');
    expect(getAuthGateRoute({ is_adult: true, birth_year: null, nickname: '하루' })).toBe('terms');
    expect(hasVerifiedIdentity({ is_adult: true, birth_year: null })).toBe(false);
  });

  it('routes verified users without a nickname or gender to profile onboarding', () => {
    expect(getAuthGateRoute({ is_adult: true, birth_year: 2001, nickname: null })).toBe('profileStep1');
    expect(getAuthGateRoute({ is_adult: true, birth_year: 2001, nickname: '   ' })).toBe('profileStep1');
    expect(getAuthGateRoute({ is_adult: true, birth_year: 2001, nickname: '하루산책', gender: null })).toBe('profileStep1');
  });

  it('routes verified users without a profile photo to profile photo onboarding', () => {
    const profile = { is_adult: true, birth_year: 2001, gender: 'female', nickname: '하루산책' };

    expect(getAuthGateRoute(profile)).toBe('profileStep2');
    expect(hasCompletedProfile(profile)).toBe(false);
  });

  it('routes verified users without onboarding completion to the final optional step', () => {
    const profile = {
      is_adult: true,
      birth_year: 2001,
      gender: 'female',
      nickname: '하루산책',
      photo_url: 'user/profile.jpg',
    };

    expect(getAuthGateRoute(profile)).toBe('profileStep3');
    expect(hasCompletedProfile(profile)).toBe(false);
  });

  it('allows verified users with nickname, profile photo, and onboarding completion through the app gate', () => {
    const profile = {
      is_adult: true,
      birth_year: 2001,
      gender: 'female',
      nickname: '하루산책',
      onboarding_completed_at: '2026-05-30T00:00:00.000Z',
      photo_url: 'user/profile.jpg',
    };

    expect(getAuthGateRoute(profile)).toBeNull();
    expect(hasVerifiedIdentity(profile)).toBe(true);
    expect(hasCompletedProfile(profile)).toBe(true);
  });

  it('blocks app routes unless a verified identity record and current terms exist', () => {
    const completeProfile = {
      is_adult: true,
      birth_year: 2001,
      gender: 'female',
      nickname: '하루산책',
      onboarding_completed_at: '2026-05-30T00:00:00.000Z',
      photo_url: 'user/profile.jpg',
    };

    expect(getAppGateRoute(completeProfile, {
      hasCurrentTermsAgreement: true,
      hasVerifiedIdentityRecord: false,
    })).toBe('terms');
    expect(getAppGateRoute(completeProfile, {
      hasCurrentTermsAgreement: false,
      hasVerifiedIdentityRecord: true,
    })).toBe('terms');
    expect(getAppGateRoute({
      ...completeProfile,
      photo_url: null,
    }, {
      hasCurrentTermsAgreement: true,
      hasVerifiedIdentityRecord: true,
    })).toBe('profileStep2');
    expect(getAppGateRoute(completeProfile, {
      hasCurrentTermsAgreement: true,
      hasVerifiedIdentityRecord: true,
    })).toBeNull();
  });

  it('recovers verified identity from auth_verification metadata when profile identity fields are missing', () => {
    const verification = {
      provider_metadata: {
        isAdult: true,
        verifiedCustomer: {
          birthDate: '1998-02-03',
          birthYear: 1998,
          gender: 'female',
        },
      },
      verified_at: '2026-05-30T00:00:00.000Z',
    };

    expect(getVerifiedIdentityFromVerification(verification)).toMatchObject({
      birth_year: 1998,
      birth_date: '1998-02-03',
      gender: 'female',
      is_adult: true,
    });

    const profile = mergeProfileWithVerifiedIdentity(
      {
        is_adult: false,
        nickname: '하루산책',
      },
      verification,
    );

    expect(getAuthGateRoute(profile)).toBe('profileStep2');
    expect(profile).toMatchObject({
      birth_year: 1998,
      gender: 'female',
      is_adult: true,
      nickname: '하루산책',
    });
  });
});
