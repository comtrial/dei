import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockGetPermissionState = jest.fn();
const mockAnalyticsCapture = jest.fn();
const mockLoggerCaptureException = jest.fn();

const mockSupabaseFrom = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useLocalSearchParams: () => ({ roomId: 'room-123' }),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'user-me' } }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
  },
}));

jest.mock('@/lib/permissions', () => ({
  getPermissionState: (...args: unknown[]) => mockGetPermissionState(...args),
}));

jest.mock('@dei/shared', () => ({
  POLICY: {
    blurGate: { visibilityWindowHours: 24 },
  },
  analytics: { capture: (...args: unknown[]) => mockAnalyticsCapture(...args) },
  logger: { captureException: (...args: unknown[]) => mockLoggerCaptureException(...args) },
}));

import RoomPreviewScreen from '../preview';

function makeVideoChain(rows: unknown[]) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: rows, error: null }),
  };
}

function makeMemberEqChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return chain;
}

function makeProfileInChain(rows: unknown[]) {
  return {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: rows, error: null }),
  };
}

describe('RoomPreviewScreen (S10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('24h 내 영상 1건 → router.replace 호출 (블러 게이트 통과)', async () => {
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'video') {
        return makeVideoChain([{ id: 'vid-1', created_at: new Date().toISOString() }]);
      }
      return makeMemberEqChain([]);
    });

    render(<RoomPreviewScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/room/room-123');
    });
  });

  it('영상 0건 → 본문 렌더 + GridRoom 표시', async () => {
    let videoCallCount = 0;
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'video') {
        videoCallCount += 1;
        return makeVideoChain([]);
      }
      if (table === 'room_member') {
        return makeMemberEqChain([
          {
            room_id: 'room-123',
            user_id: 'user-a',
            role: 'member',
            status: 'active',
            joined_at: new Date().toISOString(),
            left_at: null,
          },
          {
            room_id: 'room-123',
            user_id: 'user-b',
            role: 'member',
            status: 'active',
            joined_at: new Date().toISOString(),
            left_at: null,
          },
        ]);
      }
      if (table === 'profile') {
        return makeProfileInChain([
          { user_id: 'user-a', nickname: '철수' },
          { user_id: 'user-b', nickname: '영희' },
        ]);
      }
      return makeMemberEqChain([]);
    });

    render(<RoomPreviewScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('gridroom')).toBeTruthy();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('촬영 CTA 탭 + 권한 granted → upload 화면 push', async () => {
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'video') {
        return makeVideoChain([]);
      }
      if (table === 'room_member') {
        return makeMemberEqChain([]);
      }
      return makeProfileInChain([]);
    });
    mockGetPermissionState.mockResolvedValue('granted');

    render(<RoomPreviewScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('blur-preview-cta')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('blur-preview-cta'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(app)/room/room-123/upload');
    });
  });

  it('촬영 CTA 탭 + 권한 denied → permission/camera 화면 push', async () => {
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'video') {
        return makeVideoChain([]);
      }
      if (table === 'room_member') {
        return makeMemberEqChain([]);
      }
      return makeProfileInChain([]);
    });
    mockGetPermissionState.mockResolvedValue('denied');

    render(<RoomPreviewScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('blur-preview-cta')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('blur-preview-cta'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(app)/permission/camera');
    });
  });
});
