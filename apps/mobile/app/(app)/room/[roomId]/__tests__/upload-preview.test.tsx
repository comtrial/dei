import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockUploadClip = jest.fn();
const mockDeleteAsync = jest.fn();
const mockAnalyticsCapture = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({
    roomId: 'room-123',
    localUri: 'file://test.mp4',
    durationMs: '2300',
  }),
}));

jest.mock('expo-video', () => ({
  useVideoPlayer: (_source: unknown, setup: (p: Record<string, unknown>) => void) => {
    const player = {
      loop: false,
      muted: true,
      status: 'readyToPlay',
      playing: false,
      play: jest.fn(),
      availableVideoTracks: [],
      addListener: jest.fn(() => ({ remove: jest.fn() })),
    };
    setup(player);
    return player;
  },
  VideoView: 'VideoView',
}));

jest.mock('expo', () => ({
  useEvent: (_player: unknown, _event: string, initial: Record<string, unknown>) => initial,
}));

jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

jest.mock('@/lib/video', () => ({
  uploadClip: (...args: unknown[]) => mockUploadClip(...args),
}));

jest.mock('@dei/shared', () => ({
  analytics: { capture: (...args: unknown[]) => mockAnalyticsCapture(...args) },
  logger: { captureException: jest.fn() },
}));

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import UploadPreviewScreen from '../upload-preview';

describe('UploadPreviewScreen (S11b)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('localUri params → VideoView 렌더', async () => {
    mockUploadClip.mockResolvedValue({ videoId: 'vid-1', thumbnailUrl: '' });

    render(<UploadPreviewScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('preview-video')).toBeTruthy();
    });
  });

  it('"올리기" 탭 → uploadClip mock 호출 → router.replace 호출', async () => {
    mockUploadClip.mockResolvedValue({ videoId: 'vid-1', thumbnailUrl: '' });

    render(<UploadPreviewScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('upload-button')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('upload-button'));

    await waitFor(() => {
      expect(mockUploadClip).toHaveBeenCalledWith(
        expect.objectContaining({ roomId: 'room-123', localUri: 'file://test.mp4' }),
        expect.objectContaining({ onProgress: expect.any(Function) }),
      );
      expect(mockAnalyticsCapture).toHaveBeenCalledWith('F2:video_uploaded', {
        room_id: 'room-123',
        duration_sec: 2.3,
      });
      expect(mockReplace).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/room/[roomId]',
          params: expect.objectContaining({ roomId: 'room-123' }),
        }),
      );
    });
  });

  it('닫기 × 탭 → AlertDialog 표시 → 확인 → router.back 호출', async () => {
    render(<UploadPreviewScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('fullscreen-video-close')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('fullscreen-video-close'));

    await waitFor(() => {
      expect(screen.getByTestId('discard-confirm-button')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('discard-confirm-button'));

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });
});
