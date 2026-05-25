/**
 * Activation funnel 계측: phone.tsx 의 본인확인 → 세션 확정 funnel.
 *
 * - phone_verification_requested: 「본인확인 시작」 탭 시 attempt_count 와 함께.
 * - phone_verification_succeeded: 본인확인 성공 결과 수신 시 attempt_count 와 함께.
 * - signup_or_login_resolved: 번호 확정 = user_id 확정 → identify(userId,{is_new_user})
 *   + capture('signup_or_login_resolved',{is_new_user}).
 *
 * PortOne SDK 와 identity-verification 모듈은 모킹해 onComplete 성공 경로를 재현한다.
 */
import { analytics } from '@dei/shared';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockStart = jest.fn();
const mockConfirm = jest.fn();
const mockGetUser = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('@/lib/identity-verification', () => ({
  startIdentityVerification: () => mockStart(),
  confirmIdentityVerification: (...args: unknown[]) => mockConfirm(...args),
}));

jest.mock('@/lib/dev-auth', () => ({ isLocalDevAuthEnabled: () => false }));

jest.mock('@/lib/routes', () => ({
  ROUTES: { profile: '/profile', home: '/home' },
  routeForEligibility: () => '/profile',
}));

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: () => mockGetUser() } },
}));

jest.mock('@/providers/account-gate-provider', () => ({
  useAccountGate: () => ({
    completeLocalDevIdentityVerification: jest.fn(),
    eligibility: { identity_verified: false },
    refresh: jest.fn().mockResolvedValue({ next_step: 'profile', account_state: 'active' }),
  }),
}));

// PortOne IdentityVerification: onComplete 를 즉시 트리거할 수 있는 버튼 스텁.
jest.mock('@portone/react-native-sdk', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    IdentityVerification: ({ onComplete }: { onComplete: (r: unknown) => void }) => (
      <Pressable testID="portone-complete" onPress={() => onComplete({ ok: true })}>
        <Text>complete</Text>
      </Pressable>
    ),
  };
});

const captureSpy = jest.spyOn(analytics, 'capture').mockImplementation(() => undefined);
const identifySpy = jest.spyOn(analytics, 'identify').mockImplementation(() => undefined);

import PhoneScreen from '@/app/(auth)/phone';

describe('phone.tsx 본인확인 funnel 계측', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStart.mockResolvedValue({ identityVerificationId: 'iv-1' });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } } });
  });

  it('「본인확인 시작」 → phone_verification_requested(attempt_count=1)', async () => {
    const { getByText } = render(<PhoneScreen />);
    fireEvent.press(getByText('본인확인 시작'));

    await waitFor(() => {
      expect(captureSpy).toHaveBeenCalledWith('phone_verification_requested', {
        attempt_count: 1,
      });
    });
  });

  it('본인확인 성공(신규) → succeeded + signup_or_login_resolved + identify(is_new_user=true)', async () => {
    mockConfirm.mockResolvedValue({ existingMember: false });

    const { getByText, findByTestId } = render(<PhoneScreen />);

    // 1) 시작 → verificationRequest set → PortOne 스텁 렌더.
    fireEvent.press(getByText('본인확인 시작'));
    const completeBtn = await findByTestId('portone-complete');

    // 2) 본인확인 완료 트리거.
    fireEvent.press(completeBtn);

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith({ ok: true }, 'iv-1');
    });

    await waitFor(() => {
      expect(captureSpy).toHaveBeenCalledWith(
        'phone_verification_succeeded',
        expect.objectContaining({ attempt_count: 1 }),
      );
    });

    expect(identifySpy).toHaveBeenCalledWith('user-abc', { is_new_user: true });
    expect(captureSpy).toHaveBeenCalledWith('signup_or_login_resolved', { is_new_user: true });
  });

  it('기존 회원이면 is_new_user=false 로 resolved + identify', async () => {
    mockConfirm.mockResolvedValue({ existingMember: true });

    const { getByText, findByTestId } = render(<PhoneScreen />);
    fireEvent.press(getByText('본인확인 시작'));
    fireEvent.press(await findByTestId('portone-complete'));

    await waitFor(() => {
      expect(identifySpy).toHaveBeenCalledWith('user-abc', { is_new_user: false });
    });
    expect(captureSpy).toHaveBeenCalledWith('signup_or_login_resolved', { is_new_user: false });
  });
});
