import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEq, mockFrom, mockUpdate } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockEq: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
  },
}));

// eslint-disable-next-line import/first -- mocks must be registered before SUT import
import { repairProfileIdentityFromVerification } from './identity-profile';

describe('identity-profile', () => {
  beforeEach(() => {
    mockFrom.mockReturnValue({ eq: mockEq, update: mockUpdate });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockEq.mockResolvedValue({ error: null });
  });

  it('repairs verified identity fields from auth_verification metadata', async () => {
    const profile = await repairProfileIdentityFromVerification({
      profile: null,
      userId: 'user-1',
      verification: {
        provider_metadata: {
          verifiedCustomer: {
            birthDate: '1999-04-05',
            birthYear: 1999,
            gender: 'male',
          },
        },
        verified_at: '2026-06-07T00:00:00.000Z',
      },
    });

    expect(profile).toMatchObject({
      birth_date: '1999-04-05',
      birth_year: 1999,
      gender: 'male',
      is_adult: true,
    });
    expect(mockFrom).toHaveBeenCalledWith('profile');
    expect(mockUpdate).toHaveBeenCalledWith({
      birth_date: '1999-04-05',
      birth_year: 1999,
      gender: 'male',
      is_adult: true,
    });
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
