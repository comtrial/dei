import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockAnalyticsCapture = jest.fn();
const mockConfirmInstantRematchPurchase = jest.fn();
const mockGetBoosterPackageOptions = jest.fn();
const mockIsPurchaseCancelled = jest.fn();
const mockPurchaseInstantRematchPackage = jest.fn();
const mockSyncPurchasesUser = jest.fn();
const mockSupabaseFrom = jest.fn();
const mockEnqueueMatchQueue = jest.fn();
const mockNeedsNotificationConsent = jest.fn();
const mockRegisterPushToken = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, push: mockPush }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

// load-state effect: Promise.all([profile.maybeSingle(), pass(.eq().eq())]).
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
  },
}));

jest.mock('@/lib/purchases', () => ({
  confirmInstantRematchPurchase: (...args: unknown[]) =>
    mockConfirmInstantRematchPurchase(...args),
  getBoosterPackageOptions: (...args: unknown[]) =>
    mockGetBoosterPackageOptions(...args),
  isPurchaseCancelled: (...args: unknown[]) => mockIsPurchaseCancelled(...args),
  purchaseInstantRematchPackage: (...args: unknown[]) =>
    mockPurchaseInstantRematchPackage(...args),
  syncPurchasesUser: (...args: unknown[]) => mockSyncPurchasesUser(...args),
}));

jest.mock('@/lib/matching', () => ({
  enqueueMatchQueue: (...args: unknown[]) => mockEnqueueMatchQueue(...args),
}));

jest.mock('@/lib/notifications.stub', () => ({
  getAppNotificationEnabled: jest.fn().mockResolvedValue(true),
  needsNotificationConsent: (...args: unknown[]) => mockNeedsNotificationConsent(...args),
  registerPushToken: (...args: unknown[]) => mockRegisterPushToken(...args),
}));

jest.mock('@/lib/permissions', () => ({
  requestPermission: jest.fn().mockResolvedValue('granted'),
}));

// PAYMENT_PACKS 는 실제 값 사용 — selectedPack.id 가 진짜 product id 여야 한다.
jest.mock('@/lib/b-flow', () => jest.requireActual('@/lib/b-flow'));

// logger.withErrorCapture 는 래핑한 async fn 을 실제로 실행해야 결제 흐름이 돈다.
jest.mock('@dei/shared', () => ({
  analytics: { capture: (...args: unknown[]) => mockAnalyticsCapture(...args) },
  logger: {
    withErrorCapture: (_name: string, fn: () => Promise<unknown>) => fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
  },
  getRematchRestriction: () => ({ restricted: true, remainingMs: 1000 }),
  toMatchQueueMode: (value: unknown) => (value === 'college' ? 'college' : 'normal'),
  POLICY: {
    matching: { rematchCooldownHours: 12 },
    // b-flow(requireActual) 가 PAYMENT_PACKS id 를 만들 때 사용.
    payment: { instantRematchProductId: 'booster_instant_rematch_v1' },
  },
  // b-flow 가 모듈 평가 시 import 하므로 빈 배열로라도 제공해야 한다.
  REPORT_CATEGORIES: [],
}));

// 화면 뷰 컴포넌트는 의존 트리(아이콘 등)를 끊기 위해 스텁.
// Button 만 onPress 를 forward 하는 누를 수 있는 요소로 렌더한다.
jest.mock('@dei/ui', () => {
  const mockReactModule = jest.requireActual('react');
  const mockRN = jest.requireActual('react-native');
  return {
    AlertDialog: () => null,
    Badge: () => null,
    BottomActionBar: ({ children }: { children: unknown }) =>
      mockReactModule.createElement(mockRN.View, null, children),
    Button: ({
      children,
      onPress,
      disabled,
    }: {
      children: unknown;
      onPress?: () => void;
      disabled?: boolean;
    }) =>
      mockReactModule.createElement(
        mockRN.TouchableOpacity,
        { onPress, disabled, testID: 'booster-pay-button' },
        mockReactModule.createElement(mockRN.Text, null, children),
      ),
    Card: ({ children }: { children: unknown }) =>
      mockReactModule.createElement(mockRN.View, null, children),
    ChoiceList: () => null,
    CompareCard: () => null,
    IconButton: () => null,
    Spinner: () => null,
    Text: ({ children }: { children?: unknown }) => children ?? null,
    TopNav: () => null,
  };
});

// SUT import must run after all jest.mock() calls.
// eslint-disable-next-line import/first
import BoosterScreen from '../booster';

function makeProfileChain(rows: { data: unknown; error?: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest
      .fn()
      .mockResolvedValue({ data: rows.data, error: rows.error ?? null }),
  };
}

function makePassChain(rows: { data: unknown; error?: unknown }) {
  // pass 조회는 maybeSingle 없이 .select().eq().eq() thenable 로 끝난다.
  const result = { data: rows.data, error: rows.error ?? null };
  const chain: Record<string, unknown> = {
    select: jest.fn().mockReturnThis(),
    // 첫 .eq() 는 체인 유지, 두 번째 .eq() 가 결과를 resolve.
    eq: jest.fn(function eqImpl(this: unknown, ..._args: unknown[]) {
      // 두 번째 eq 호출에서만 Promise 반환하도록 토글.
      if ((chain as { _eqCalls?: number })._eqCalls === undefined) {
        (chain as { _eqCalls?: number })._eqCalls = 0;
      }
      (chain as { _eqCalls: number })._eqCalls += 1;
      if ((chain as { _eqCalls: number })._eqCalls >= 2) {
        return Promise.resolve(result);
      }
      return chain;
    }),
  };
  return chain;
}

describe('BoosterScreen — booster 결제 신호 계측', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetBoosterPackageOptions.mockResolvedValue(new Map());
    mockIsPurchaseCancelled.mockReturnValue(false);
    mockSyncPurchasesUser.mockResolvedValue(undefined);
    mockEnqueueMatchQueue.mockResolvedValue(undefined);
    mockNeedsNotificationConsent.mockResolvedValue(false);
    mockRegisterPushToken.mockResolvedValue(undefined);
    mockPurchaseInstantRematchPackage.mockResolvedValue({
      environment: 'Sandbox',
      productId: 'booster_instant_rematch_v1',
      purchase: { id: 'tx-1', productId: 'booster_instant_rematch_v1' },
      signedTransactionInfo: 'signed-jws',
      storeProductId: 'booster_instant_rematch_v1',
      transactionDate: 1_786_000_000_000,
      transactionId: 'tx-1',
    });
    mockConfirmInstantRematchPurchase.mockResolvedValue(undefined);

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'profile') {
        return makeProfileChain({ data: { last_room_leave_at: null } });
      }
      if (table === 'pass') {
        return makePassChain({ data: [] });
      }
      return makeProfileChain({ data: null });
    });
  });

  it('마운트 시 booster_paywall_shown 이 capture 된다', async () => {
    render(<BoosterScreen />);

    await waitFor(() => {
      expect(mockAnalyticsCapture).toHaveBeenCalledWith('F3:booster_paywall_shown', {
        reason: 'rematch_restricted',
      });
    });

  });

  it('결제 버튼을 누르면 booster_purchase_attempted 가 capture 된다', async () => {
    render(<BoosterScreen />);

    // paywall_shown 이 먼저 발사되도록 마운트 안정화.
    await waitFor(() => {
      expect(mockAnalyticsCapture).toHaveBeenCalledWith(
        'F3:booster_paywall_shown',
        expect.anything(),
      );
    });

    fireEvent.press(screen.getByTestId('booster-pay-button'));

    // attempted 는 handlePay 진입 즉시(동기) 발사된다.
    expect(mockAnalyticsCapture).toHaveBeenCalledWith(
      'F3:booster_purchase_attempted',
      expect.objectContaining({ product_id: expect.any(String) }),
    );

    // press 가 트리거한 async 결제 시작 state 업데이트를 flush 해 act 경고 방지.
    await waitFor(() => {
      expect(mockPurchaseInstantRematchPackage).toHaveBeenCalled();
    });
  });

  it('결제 성공 시 purchase → confirm → success analytics → 큐 진입 순서로 진행된다', async () => {
    render(<BoosterScreen />);

    await waitFor(() => {
      expect(mockAnalyticsCapture).toHaveBeenCalledWith(
        'F3:booster_paywall_shown',
        expect.anything(),
      );
    });

    fireEvent.press(screen.getByTestId('booster-pay-button'));

    await waitFor(() => {
      expect(mockPurchaseInstantRematchPackage).toHaveBeenCalledWith(
        expect.any(String),
      );
      expect(mockConfirmInstantRematchPurchase).toHaveBeenCalledWith(
        expect.objectContaining({
          storeProductId: 'booster_instant_rematch_v1',
          transactionId: 'tx-1',
        }),
      );
      expect(mockAnalyticsCapture).toHaveBeenCalledWith(
        'F3:booster_purchase_succeeded',
        expect.objectContaining({ product_id: expect.any(String) }),
      );
      expect(mockEnqueueMatchQueue).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/queue',
        params: { mode: 'normal' },
      });
    });
  });

  it('사용자 결제 취소는 cancelled 실패 화면으로 보낸다', async () => {
    mockPurchaseInstantRematchPackage.mockRejectedValueOnce({ code: 'user-cancelled' });
    mockIsPurchaseCancelled.mockReturnValueOnce(true);

    render(<BoosterScreen />);

    await waitFor(() => {
      expect(mockAnalyticsCapture).toHaveBeenCalledWith(
        'F3:booster_paywall_shown',
        expect.anything(),
      );
    });

    fireEvent.press(screen.getByTestId('booster-pay-button'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/booster-failed',
        params: {
          code: 'purchase_cancelled',
          message: '스토어 결제가 취소됐어요.',
        },
      });
    });
    expect(mockConfirmInstantRematchPurchase).not.toHaveBeenCalled();
  });

  it('결제 실패는 failure 화면으로 보낸다', async () => {
    mockPurchaseInstantRematchPackage.mockRejectedValueOnce(new Error('store down'));

    render(<BoosterScreen />);

    await waitFor(() => {
      expect(mockAnalyticsCapture).toHaveBeenCalledWith(
        'F3:booster_paywall_shown',
        expect.anything(),
      );
    });

    fireEvent.press(screen.getByTestId('booster-pay-button'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/booster-failed',
        params: {
          code: 'purchase_failed',
          message: 'store down',
        },
      });
    });
  });
});
