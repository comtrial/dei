import { renderHook, waitFor } from '@testing-library/react-native';

import { requestAndRegisterPushToken } from '@/lib/push-notifications';

import { usePushTokenRegistration } from '../usePushTokenRegistration';

jest.mock('@/lib/push-notifications', () => ({
  requestAndRegisterPushToken: jest.fn(),
}));

jest.mock('@dei/shared', () => ({
  logger: {
    captureException: jest.fn(),
  },
}));

const mockRequestAndRegisterPushToken = requestAndRegisterPushToken as jest.MockedFunction<
  typeof requestAndRegisterPushToken
>;

type HookProps = {
  userId: string | undefined;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestAndRegisterPushToken.mockResolvedValue({
    ok: true,
    platform: 'ios',
    pushProvider: 'expo',
    pushToken: 'ExponentPushToken[test]',
  });
});

describe('usePushTokenRegistration', () => {
  it('인증된 사용자로 앱에 진입하면 푸시 토큰 등록을 요청한다', async () => {
    renderHook(() => usePushTokenRegistration('user-1'));

    await waitFor(() => {
      expect(mockRequestAndRegisterPushToken).toHaveBeenCalledWith('user-1');
    });
  });

  it('같은 사용자로 재렌더링돼도 중복 등록 요청을 하지 않는다', async () => {
    const { rerender } = renderHook(
      ({ userId }: HookProps) => usePushTokenRegistration(userId),
      { initialProps: { userId: 'user-1' } as HookProps },
    );

    await waitFor(() => {
      expect(mockRequestAndRegisterPushToken).toHaveBeenCalledTimes(1);
    });

    rerender({ userId: 'user-1' });

    expect(mockRequestAndRegisterPushToken).toHaveBeenCalledTimes(1);
  });

  it('로그아웃 후 같은 사용자가 다시 진입하면 다시 등록 요청을 한다', async () => {
    const { rerender } = renderHook(
      ({ userId }: HookProps) => usePushTokenRegistration(userId),
      { initialProps: { userId: 'user-1' } as HookProps },
    );

    await waitFor(() => {
      expect(mockRequestAndRegisterPushToken).toHaveBeenCalledTimes(1);
    });

    rerender({ userId: undefined });
    rerender({ userId: 'user-1' });

    await waitFor(() => {
      expect(mockRequestAndRegisterPushToken).toHaveBeenCalledTimes(2);
    });
  });
});
