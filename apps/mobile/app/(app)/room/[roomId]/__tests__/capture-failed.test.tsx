import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockBack = jest.fn();

let mockParams: { roomId: string; reason?: string } = { roomId: 'room-123' };

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@dei/shared', () => ({
  logger: { captureException: jest.fn() },
}));

import CaptureFailedScreen from '../capture-failed';

describe('CaptureFailedScreen (S12)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { roomId: 'room-123' };
  });

  it('reason=hardware → 하드웨어 오류 헤딩 렌더', async () => {
    mockParams = { roomId: 'room-123', reason: 'hardware' };

    render(<CaptureFailedScreen />);

    await waitFor(() => {
      expect(screen.getByText('카메라를 사용할 수 없어요')).toBeTruthy();
    });
    expect(screen.getByText('하드웨어 오류')).toBeTruthy();
    expect(screen.getByText('다시 시도')).toBeTruthy();
  });

  it('reason=hardware_error → 하드웨어 오류 헤딩 렌더 (normalize)', async () => {
    mockParams = { roomId: 'room-123', reason: 'hardware_error' };

    render(<CaptureFailedScreen />);

    await waitFor(() => {
      expect(screen.getByText('카메라를 사용할 수 없어요')).toBeTruthy();
    });
  });

  it('reason=upload_failed → 업로드 실패 헤딩 렌더', async () => {
    mockParams = { roomId: 'room-123', reason: 'upload_failed' };

    render(<CaptureFailedScreen />);

    await waitFor(() => {
      expect(screen.getByText('네트워크가 약해요')).toBeTruthy();
    });
    expect(screen.getByText('업로드 실패')).toBeTruthy();
    expect(screen.getByText('지금 재시도')).toBeTruthy();
  });

  it('reason 없음 → upload fallback 헤딩 렌더', async () => {
    mockParams = { roomId: 'room-123' };

    render(<CaptureFailedScreen />);

    await waitFor(() => {
      expect(screen.getByText('네트워크가 약해요')).toBeTruthy();
    });
  });

  it('하드웨어 — "다시 시도" 탭 → router.replace upload-preview 호출', async () => {
    mockParams = { roomId: 'room-123', reason: 'hardware' };

    render(<CaptureFailedScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('capture-failed-retry')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('capture-failed-retry'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/room/[roomId]/upload-preview',
          params: expect.objectContaining({ roomId: 'room-123' }),
        }),
      );
    });
  });

  it('업로드 — "지금 재시도" 탭 → router.back 호출', async () => {
    mockParams = { roomId: 'room-123', reason: 'upload_failed' };

    render(<CaptureFailedScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('capture-failed-retry')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('capture-failed-retry'));

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  it('하드웨어 — "취소" 탭 → router.back 호출', async () => {
    mockParams = { roomId: 'room-123', reason: 'hardware' };

    render(<CaptureFailedScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('capture-failed-cancel')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('capture-failed-cancel'));

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });
});
