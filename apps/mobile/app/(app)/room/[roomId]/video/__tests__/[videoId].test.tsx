import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockRouter = { back: mockBack, push: mockPush };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ videoId: 'vid-1', roomId: 'room-1' }),
}));

const mockGetUser = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    storage: {
      from: () => ({
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://cdn.example.com/video.mp4' },
          error: null,
        }),
      }),
    },
    from: () => ({
      select: () => ({
        or: () => ({
          is: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}));

const mockGetVideoById = jest.fn();
const mockIsBlockedBetween = jest.fn();
const mockGetSiblingVideos = jest.fn();
const mockGetRoomMembersWithProfile = jest.fn();

jest.mock('@/lib/room-rpc', () => ({
  getVideoById: (...args: unknown[]) => mockGetVideoById(...args),
  isBlockedBetween: (...args: unknown[]) => mockIsBlockedBetween(...args),
  getSiblingVideos: (...args: unknown[]) => mockGetSiblingVideos(...args),
  getRoomMembersWithProfile: (...args: unknown[]) =>
    mockGetRoomMembersWithProfile(...args),
}));

jest.mock('@/lib/video', () => ({
  getCachedVideoUri: jest.fn().mockResolvedValue('file:///cache/video.mp4'),
  getCachedThumbnailUri: jest.fn().mockResolvedValue('file:///cache/thumb.jpg'),
}));

jest.mock('@dei/shared', () => ({
  analytics: { capture: jest.fn() },
  logger: { captureException: jest.fn() },
  POLICY: {
    video: { prefetchSiblingCount: 1 },
  },
}));

const mockPlayer = {
  loop: false,
  muted: false,
  bufferOptions: {},
  playing: false,
  currentTime: 0,
  duration: 3,
  status: 'readyToPlay',
  play: jest.fn(),
  pause: jest.fn(),
  replaceAsync: jest.fn().mockResolvedValue(undefined),
};

jest.mock('expo-video', () => ({
  useVideoPlayer: (_source: unknown, setup?: (p: unknown) => void) => {
    setup?.(mockPlayer);
    return mockPlayer;
  },
  VideoView: 'VideoView',
}));

jest.mock('expo', () => ({
  useEvent: (_player: unknown, _event: string, initial: unknown) => initial,
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('react-native-gesture-handler', () => {
  const chainable: Record<string, () => unknown> = {};
  const chain = new Proxy(chainable, {
    get: () => () => chain,
  });
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    Gesture: {
      Pan: () => chain,
      LongPress: () => chain,
      Simultaneous: () => chain,
    },
  };
});

const defaultVideo = {
  id: 'vid-1',
  room_id: 'room-1',
  user_id: 'user-1',
  storage_path: 'room-1/vid-1.mp4',
  thumbnail_path: 'room-1/vid-1.jpg',
  hour_slot: 10,
  status: 'ready',
  duration_ms: 3000,
  created_at: new Date().toISOString(),
};

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import VideoFullscreenScreen from '../[videoId]';

describe('VideoFullscreenScreen (S13b)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'self-1' } } });
    mockIsBlockedBetween.mockResolvedValue(false);
    mockGetVideoById.mockResolvedValue(defaultVideo);
    mockGetSiblingVideos.mockResolvedValue([defaultVideo]);
    mockGetRoomMembersWithProfile.mockResolvedValue([
      {
        user_id: 'user-1',
        room_id: 'room-1',
        status: 'active',
        profile: { nickname: '테스트유저', gender: 'male', photo_url: null },
      },
    ]);
  });

  it('차단 멤버 영상 진입 → router.back 호출', async () => {
    mockIsBlockedBetween.mockResolvedValue(true);

    render(<VideoFullscreenScreen />);

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  it('정상 진입 → FullscreenVideo 렌더', async () => {
    render(<VideoFullscreenScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('fullscreen-video')).toBeTruthy();
    });
  });

  it('멤버 칩 탭 → S14 push', async () => {
    render(<VideoFullscreenScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('member-chip')).toBeTruthy();
    });

    fireEvent(screen.getByTestId('member-chip'), 'responderRelease');

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('members?userId=user-1'),
      );
    });
  });

  it('내 영상의 멤버 칩 탭 → 내 프로필로 이동', async () => {
    mockGetVideoById.mockResolvedValue({
      ...defaultVideo,
      user_id: 'self-1',
    });
    mockGetRoomMembersWithProfile.mockResolvedValue([
      {
        user_id: 'self-1',
        room_id: 'room-1',
        status: 'active',
        profile: { nickname: '나', gender: 'male', photo_url: null },
      },
    ]);

    render(<VideoFullscreenScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('member-chip')).toBeTruthy();
    });

    fireEvent(screen.getByTestId('member-chip'), 'responderRelease');

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(app)/my-profile');
    });
  });

  it('비디오 URI 획득 실패 → StateView error 렌더', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCachedVideoUri } = require('@/lib/video');
    (getCachedVideoUri as jest.Mock).mockResolvedValueOnce(null);

    render(<VideoFullscreenScreen />);

    await waitFor(() => {
      expect(screen.getByText('영상을 불러오지 못했어요')).toBeTruthy();
    });
  });
});
