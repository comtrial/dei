import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockGetPermissionState = jest.fn();
const mockRecordClip = jest.fn();
const mockAnalyticsCapture = jest.fn();
const mockRequestMicrophonePermissionsAsync = jest.fn();

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
      React.useEffect(() => {
        if (onCameraReady) onCameraReady();
      }, [onCameraReady]);
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
