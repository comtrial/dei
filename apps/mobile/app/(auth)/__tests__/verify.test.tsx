import { render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockAnalyticsCapture = jest.fn();
const mockStartIdentityVerification = jest.fn();
const mockConfirmIdentityVerification = jest.fn();
const mockPromoteWithIdentity = jest.fn();
const mockEnsureAnonymousSession = jest.fn();
const mockEnsureLatestTermsAgreement = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

// PortOne SDK component → onComplete 을 즉시 호출해 성공 경로를 관통시킨다.
jest.mock('@portone/react-native-sdk', () => ({
  IdentityVerification: ({
    onComplete,
  }: {
    onComplete: (response: unknown) => void;
  }) => {
    const { useEffect: useEffectInner } = jest.requireActual<typeof import('react')>('react');
    useEffectInner(() => {
      onComplete({ identityVerificationId: 'iv-1' });
    }, [onComplete]);
    return null;
  },
}));

jest.mock('@/lib/portone.stub', () => {
  class IdentityVerificationError extends Error {}
  return {
    IdentityVerificationError,
    startIdentityVerification: (...args: unknown[]) =>
      mockStartIdentityVerification(...args),
    confirmIdentityVerification: (...args: unknown[]) =>
      mockConfirmIdentityVerification(...args),
    recordIdentityVerificationFailure: jest.fn(),
  };
});

jest.mock('@/lib/terms-agreement', () => ({
  ensureLatestTermsAgreementForCurrentUser: (...args: unknown[]) =>
    mockEnsureLatestTermsAgreement(...args),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({
    ensureAnonymousSession: (...args: unknown[]) => mockEnsureAnonymousSession(...args),
    promoteWithIdentity: (...args: unknown[]) => mockPromoteWithIdentity(...args),
    signOut: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('@dei/shared', () => ({
  analytics: { capture: (...args: unknown[]) => mockAnalyticsCapture(...args) },
  logger: {
    captureException: jest.fn(),
    withErrorCapture: jest.fn(),
    addBreadcrumb: jest.fn(),
  },
}));

jest.mock('@dei/ui', () => ({
  AlertDialog: () => null,
  BrandTransitionFrame: () => null,
  IconButton: () => null,
  Spinner: () => null,
  Text: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import VerifyScreen from '../verify';

describe('VerifyScreen (S03) — phone_verification_succeeded', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureAnonymousSession.mockResolvedValue(undefined);
    mockStartIdentityVerification.mockResolvedValue({
      identityVerificationId: 'iv-1',
    });
    mockPromoteWithIdentity.mockResolvedValue(undefined);
    mockEnsureLatestTermsAgreement.mockResolvedValue(undefined);
  });

  it('본인인증 성공 → analytics.capture(F0:phone_verification_succeeded) 호출 (신규 회원)', async () => {
    mockConfirmIdentityVerification.mockResolvedValue({ existingMember: false });

    render(<VerifyScreen />);

    await waitFor(() => {
      expect(mockAnalyticsCapture).toHaveBeenCalledWith(
        'F0:phone_verification_succeeded',
        expect.objectContaining({ existing_member: false }),
      );
    });
  });

  it('기존 회원 본인인증 성공 → existing_member: true 로 capture', async () => {
    mockConfirmIdentityVerification.mockResolvedValue({ existingMember: true });

    render(<VerifyScreen />);

    await waitFor(() => {
      expect(mockAnalyticsCapture).toHaveBeenCalledWith(
        'F0:phone_verification_succeeded',
        expect.objectContaining({ existing_member: true }),
      );
    });
  });
});
