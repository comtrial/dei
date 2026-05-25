import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { FeatureFlagsProvider, useFeatureFlags } from '@/providers/feature-flags-provider';

// --- mocks -----------------------------------------------------------------

// analytics 는 spy 로 가로채 실제 PostHog 무접촉. logger 는 no-op.
const mockRegister = jest.fn();
const mockCapture = jest.fn();
jest.mock('@dei/shared', () => ({
  analytics: {
    register: (...args: unknown[]) => mockRegister(...args),
    capture: (...args: unknown[]) => mockCapture(...args),
  },
  logger: { captureException: jest.fn() },
}));

// auth: 항상 로그인 상태(user 존재)로 둔다.
jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u-1' }, isLoading: false }),
}));

// supabase.rpc 응답을 테스트별로 제어.
let mockRpcResult: { data: unknown; error: unknown } = { data: null, error: null };
const mockRpc = jest.fn((..._args: unknown[]) => Promise.resolve(mockRpcResult));
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

// --- harness ---------------------------------------------------------------

let exposeRefresh: () => Promise<void> = async () => {};

function Probe() {
  const { refresh } = useFeatureFlags();
  exposeRefresh = refresh;
  return <Text>probe</Text>;
}

function renderProvider() {
  return render(
    <FeatureFlagsProvider>
      <Probe />
    </FeatureFlagsProvider>,
  );
}

// --- tests -----------------------------------------------------------------

describe('FeatureFlagsProvider — PostHog variant 전달', () => {
  beforeEach(() => {
    mockRegister.mockClear();
    mockCapture.mockClear();
    mockRpc.mockClear();
    mockRpcResult = { data: null, error: null };
  });

  it('flags 로드 시 평가된 variant 전체를 analytics.register 로 전달한다', async () => {
    mockRpcResult = { data: { home_top_layout: 'B', curation_layout: 'single' }, error: null };

    renderProvider();

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        home_top_layout: 'B',
        curation_layout: 'single',
      });
    });
  });

  it('각 flag 에 대해 $feature_flag_called 노출 이벤트를 발송한다', async () => {
    mockRpcResult = { data: { home_top_layout: 'A', curation_layout: 'stack3' }, error: null };

    renderProvider();

    await waitFor(() => {
      expect(mockCapture).toHaveBeenCalledWith('$feature_flag_called', {
        $feature_flag: 'home_top_layout',
        $feature_flag_response: 'A',
      });
    });
    expect(mockCapture).toHaveBeenCalledWith('$feature_flag_called', {
      $feature_flag: 'curation_layout',
      $feature_flag_response: 'stack3',
    });
    expect(mockCapture).toHaveBeenCalledTimes(2);
  });

  it('값이 동일한 refresh 에서는 $feature_flag_called 를 중복 발송하지 않는다', async () => {
    mockRpcResult = { data: { home_top_layout: 'A', curation_layout: 'stack3' }, error: null };

    renderProvider();

    await waitFor(() => expect(mockCapture).toHaveBeenCalledTimes(2));

    // 동일한 값으로 재평가 → 노출 이벤트 추가 발송 없음.
    await exposeRefresh();

    expect(mockCapture).toHaveBeenCalledTimes(2);
  });

  it('flag 값이 바뀌면 바뀐 flag 만 $feature_flag_called 를 1회 더 발송한다', async () => {
    mockRpcResult = { data: { home_top_layout: 'A', curation_layout: 'stack3' }, error: null };

    renderProvider();

    await waitFor(() => expect(mockCapture).toHaveBeenCalledTimes(2));
    mockCapture.mockClear();

    // home_top_layout 만 변경, curation_layout 은 동일.
    mockRpcResult = { data: { home_top_layout: 'C', curation_layout: 'stack3' }, error: null };
    await exposeRefresh();

    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledWith('$feature_flag_called', {
      $feature_flag: 'home_top_layout',
      $feature_flag_response: 'C',
    });
  });

  it('flags 가 null(실패/로그아웃) 이면 register/노출 발송을 하지 않는다', async () => {
    mockRpcResult = { data: null, error: { message: 'boom' } };

    renderProvider();

    // refresh 가 끝날 시간을 준다.
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());

    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });
});
