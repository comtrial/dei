import { fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRouter = { push: mockPush, replace: mockReplace };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('@dei/shared', () => ({
  analytics: { capture: jest.fn() },
  logger: {
    captureException: jest.fn(),
    withErrorCapture: jest.fn((_name: string, fn: () => unknown) => Promise.resolve(fn())),
  },
  POLICY: {
    payment: { instantRematchProductId: 'instant-rematch' },
  },
  REPORT_CATEGORIES: [],
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {},
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: null }),
}));

// eslint-disable-next-line import/first -- SUT import must run after mocks.
import ProfileStep1Screen from '../step1';

describe('ProfileStep1Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('dismisses the keyboard when the user taps outside the nickname input', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(jest.fn());

    render(<ProfileStep1Screen />);

    fireEvent.press(screen.getByTestId('onboarding-step1-dismiss-area'));

    expect(dismissSpy).toHaveBeenCalledTimes(1);
    dismissSpy.mockRestore();
  });
});
