import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockGetPermissionState = jest.fn();
const mockRecordClip = jest.fn();
const mockAnalyticsCapture = jest.fn();
const mockRequestMicrophonePermissionsAsync = jest.fn();

// CameraView 가 onCameraReady 를 호출할지 제어한다. 권한 grant 직후 첫 마운트에서
// onCameraReady 가 끝내 안 불리는 expo-camera 버그(흰 화면)를 재현하기 위함.
const cameraViewState = { fireReady: true, mountCount: 0 };

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory runs before ESM imports; require is required.
  const React = require('react');
  return {
    useRouter: () => ({ replace: mockReplace, push: mockPush, back: mockBack }),
    useLocalSearchParams: () => ({ roomId: 'room-123' }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => {
        const cleanup = cb();
        return cleanup;
      }, [cb]);
    },
  };
});

jest.mock('expo-camera', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory runs before ESM imports; require is required.
  const React = require('react');
  return {
    Camera: {
      requestMicrophonePermissionsAsync: (...args: unknown[]) =>
        mockRequestMicrophonePermissionsAsync(...args),
    },
    CameraView: ({ onCameraReady }: { onCameraReady?: () => void }) => {
      // 실제 RN 처럼 마운트당 1회만 실행해야 key 기반 재마운트 횟수를 정확히 잴 수 있다.
      // (deps 에 onCameraReady 를 넣으면 prop 함수 재생성마다 effect 가 다시 돌아 오탐.)
      React.useEffect(() => {
        cameraViewState.mountCount += 1;
        if (onCameraReady && cameraViewState.fireReady) onCameraReady();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트당 1회 (RN 네이티브 동작 모사)
      }, []);
      return null;
    },
  };
});

jest.mock('@/lib/permissions', () => ({
  getPermissionState: (...args: unknown[]) => mockGetPermissionState(...args),
}));

jest.mock('@/lib/video', () => ({
  recordClip: (...args: unknown[]) => mockRecordClip(...args),
}));

jest.mock('@dei/shared', () => ({
  analytics: { capture: (...args: unknown[]) => mockAnalyticsCapture(...args) },
  logger: { captureException: jest.fn() },
}));

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import VideoCaptureScreen from '../upload';

describe('VideoCaptureScreen (S11)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cameraViewState.fireReady = true;
    cameraViewState.mountCount = 0;
  });

  it('권한 denied — router.replace 호출', async () => {
    mockGetPermissionState.mockResolvedValue('denied');

    render(<VideoCaptureScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/permission/camera');
    });
  });

  it('셔터 onPressIn — recordClip mock 호출', async () => {
    mockGetPermissionState.mockResolvedValue('granted');
    mockRecordClip.mockResolvedValue({
      localUri: 'file://test.mp4',
      durationMs: 2000,
    });

    render(<VideoCaptureScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('shutter-button')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('shutter-button'));

    await waitFor(() => {
      expect(mockRecordClip).toHaveBeenCalledTimes(1);
    });
  });

  it('onCameraReady 미호출(흰 화면) — 1.2초 뒤 CameraView 강제 재마운트', async () => {
    mockGetPermissionState.mockResolvedValue('granted');
    cameraViewState.fireReady = false;
    jest.useFakeTimers();

    try {
      render(<VideoCaptureScreen />);

      await waitFor(() => {
        expect(cameraViewState.mountCount).toBe(1);
      });

      act(() => {
        jest.advanceTimersByTime(1300);
      });

      await waitFor(() => {
        expect(cameraViewState.mountCount).toBe(2);
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('onCameraReady 호출됨 — 재마운트 없이 셔터 활성화', async () => {
    mockGetPermissionState.mockResolvedValue('granted');
    cameraViewState.fireReady = true;

    render(<VideoCaptureScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('shutter-button').props.accessibilityState?.disabled).toBe(false);
    });
    expect(cameraViewState.mountCount).toBe(1);
  });

  it('recordClip 성공 — upload-preview 로 push', async () => {
    mockGetPermissionState.mockResolvedValue('granted');
    mockRecordClip.mockResolvedValue({
      localUri: 'file://test.mp4',
      durationMs: 2000,
    });

    render(<VideoCaptureScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('shutter-button')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('shutter-button'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/room/[roomId]/upload-preview',
          params: expect.objectContaining({
            roomId: 'room-123',
            localUri: 'file://test.mp4',
          }),
        }),
      );
    });
  });
});
