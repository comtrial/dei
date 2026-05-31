import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockGetPermissionState = jest.fn();
const mockRecordClip = jest.fn();
const mockAnalyticsCapture = jest.fn();
const mockRequestMicrophonePermissionsAsync = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ roomId: 'room-123' }),
}));

jest.mock('expo-camera', () => ({
  Camera: {
    requestMicrophonePermissionsAsync: (...args: unknown[]) =>
      mockRequestMicrophonePermissionsAsync(...args),
  },
  CameraView: 'CameraView',
}));

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

    fireEvent(screen.getByTestId('shutter-button'), 'pressIn');

    await waitFor(() => {
      expect(mockRecordClip).toHaveBeenCalledTimes(1);
    });
  });

  it('recordClip 성공 — upload-preview 로 push', async () => {
    mockGetPermissionState.mockResolvedValue('granted');
    mockRecordClip.mockResolvedValue({
      localUri: 'file://test.mp4',
      durationMs: 3000,
    });

    render(<VideoCaptureScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('shutter-button')).toBeTruthy();
    });

    fireEvent(screen.getByTestId('shutter-button'), 'pressIn');

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
