/**
 * Activation funnel 계측: result.tsx 의 log_recorded.
 *
 * 저장 성공 시점(saveLog → success)에만 capture 가 일어나고, 실패하면 안 잡히는지,
 * 그리고 온보딩 첫 로그(is_first_log) / entry_point / duration_sec / log_id 가
 * 올바른 props 로 실리는지 검증한다. PostHog 실제 전송은 없다(analytics spy).
 */
import { analytics } from '@dei/shared';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ResultScreen from '@/app/result';

const mockSaveLog = jest.fn();
let mockEligibility: { next_step: string } | null = { next_step: 'first_video' };

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ durationMs: '3200' }),
}));

jest.mock('@/hooks/useSaveLog', () => ({
  useSaveLog: () => ({ saveLog: mockSaveLog, loading: false }),
}));

jest.mock('@/providers/account-gate-provider', () => ({
  useAccountGate: () => ({ eligibility: mockEligibility, refresh: jest.fn().mockResolvedValue(null) }),
}));

jest.mock('@/lib/recordingStore', () => ({
  getRecordingUri: () => 'file:///tmp/clip.mov',
  setOverwriteAcknowledged: jest.fn(),
}));

// expo-video / orientation / linear-gradient / file-system: 네이티브 의존성 제거.
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ loop: false, muted: true, play: jest.fn() }),
  VideoView: () => null,
}));
jest.mock('expo-screen-orientation', () => ({ unlockAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { LinearGradient: View };
});
jest.mock('expo-file-system/legacy', () => ({ deleteAsync: jest.fn().mockResolvedValue(undefined) }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const captureSpy = jest.spyOn(analytics, 'capture').mockImplementation(() => undefined);

const pressSave = (getByText: (t: string) => unknown) =>
  fireEvent.press(getByText('저장') as never);

describe('result.tsx log_recorded 계측', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEligibility = { next_step: 'first_video' };
  });

  it('저장 성공 시 온보딩 첫 로그면 is_first_log=true / entry_point=onboarding 로 capture', async () => {
    mockSaveLog.mockResolvedValue({ success: true, logId: 'log-123' });

    const { getByText } = render(<ResultScreen />);
    pressSave(getByText);

    await waitFor(() => {
      expect(captureSpy).toHaveBeenCalledWith('log_recorded', {
        log_id: 'log-123',
        duration_sec: 3, // 3200ms → 3s (반올림)
        is_first_log: true,
        entry_point: 'onboarding',
      });
    });
  });

  it('이미 온보딩 완료(complete) 상태면 is_first_log=false / entry_point=record', async () => {
    mockEligibility = { next_step: 'complete' };
    mockSaveLog.mockResolvedValue({ success: true, logId: null });

    const { getByText } = render(<ResultScreen />);
    pressSave(getByText);

    await waitFor(() => {
      expect(captureSpy).toHaveBeenCalledWith('log_recorded', {
        duration_sec: 3,
        is_first_log: false,
        entry_point: 'record',
      });
    });
  });

  it('저장 실패 시 log_recorded 를 capture 하지 않는다', async () => {
    mockSaveLog.mockResolvedValue({ success: false, message: '실패' });

    const { getByText } = render(<ResultScreen />);
    pressSave(getByText);

    await waitFor(() => {
      expect(mockSaveLog).toHaveBeenCalled();
    });
    expect(captureSpy).not.toHaveBeenCalledWith('log_recorded', expect.anything());
  });
});
