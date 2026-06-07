import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const TARGET_ID = '00000000-0000-4000-8000-000000000001';
const ROOM_ID = '00000000-0000-4000-8000-000000000002';
const USER_ID = '00000000-0000-4000-8000-000000000003';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockRouter = { back: mockBack, replace: mockReplace };
const mockAnalyticsCapture = jest.fn();
const mockProfileMaybeSingle = jest.fn();
const mockReportInsert = jest.fn();
const mockBlockUpsert = jest.fn();
const mockGetMemberProfile = jest.fn();
const mockGetCachedProfilePhotoUrl = jest.fn();
const mockResolveProfilePhotoUrl = jest.fn();
const mockFrom = jest.fn((table: string) => {
  if (table === 'profile') {
    const chain = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      maybeSingle: (...args: unknown[]) => mockProfileMaybeSingle(...args),
    };
    return chain;
  }

  if (table === 'report') {
    return {
      insert: (...args: unknown[]) => mockReportInsert(...args),
    };
  }

  if (table === 'block') {
    return {
      upsert: (...args: unknown[]) => mockBlockUpsert(...args),
    };
  }

  throw new Error(`unexpected table: ${table}`);
});

let mockParams: { roomId?: string; targetId?: string } = {
  roomId: ROOM_ID,
  targetId: TARGET_ID,
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@dei/shared', () => ({
  analytics: { capture: (...args: unknown[]) => mockAnalyticsCapture(...args) },
  logger: {
    captureException: jest.fn(),
    withErrorCapture: jest.fn((_name: string, fn: () => unknown) => Promise.resolve(fn())),
  },
  POLICY: {
    payment: { instantRematchProductId: 'instant-rematch' },
  },
  REPORT_CATEGORIES: [{ code: 'spam', label: '광고·스팸' }],
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}));

jest.mock('@/lib/room-rpc', () => ({
  getMemberProfile: (...args: unknown[]) => mockGetMemberProfile(...args),
}));

jest.mock('@/lib/profile-photo-cache', () => ({
  getCachedProfilePhotoUrl: (...args: unknown[]) => mockGetCachedProfilePhotoUrl(...args),
  resolveProfilePhotoUrl: (...args: unknown[]) => mockResolveProfilePhotoUrl(...args),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: USER_ID } }),
}));

// eslint-disable-next-line import/first -- SUT import must run after mocks.
import ReportCategoryScreen from '../[targetId]';

describe('ReportCategoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { roomId: ROOM_ID, targetId: TARGET_ID };
    mockProfileMaybeSingle.mockResolvedValue({
      data: { nickname: '철수', photo_url: null },
      error: null,
    });
    mockReportInsert.mockResolvedValue({ error: null });
    mockBlockUpsert.mockResolvedValue({ error: null });
    mockGetMemberProfile.mockResolvedValue(null);
    mockGetCachedProfilePhotoUrl.mockReturnValue(null);
    mockResolveProfilePhotoUrl.mockResolvedValue('https://cdn.example.com/report-avatar.jpg');
  });

  it('신고 제출은 기본적으로 상대를 함께 차단하지 않는다', async () => {
    render(<ReportCategoryScreen />);

    await screen.findByText('철수');

    expect(screen.getByTestId('report-block-too-toggle')).toHaveProp('accessibilityState', {
      checked: false,
    });

    fireEvent.press(screen.getByText('광고·스팸'));
    fireEvent.press(screen.getByTestId('report-submit'));

    await waitFor(() => {
      expect(mockReportInsert).toHaveBeenCalledWith({
        category: 'spam',
        detail: null,
        reported_user_id: TARGET_ID,
        reporter_user_id: USER_ID,
        room_id: ROOM_ID,
      });
    });

    expect(mockBlockUpsert).not.toHaveBeenCalled();
  });

  it('route param에 사진이 있으면 신고 화면 첫 렌더부터 사진을 보여준다', () => {
    mockParams = {
      roomId: ROOM_ID,
      targetAvatarUrl: 'https://cdn.example.com/passed-avatar.jpg',
      targetId: TARGET_ID,
      targetNickname: '철수',
    };
    mockGetMemberProfile.mockReturnValue(new Promise(() => {}));

    render(<ReportCategoryScreen />);

    expect(screen.getByText('철수')).toBeTruthy();
    expect(screen.getByTestId('av-photo').props.source).toEqual({
      uri: 'https://cdn.example.com/passed-avatar.jpg',
    });
  });

  it('상대 프로필 사진이 있으면 신고 화면에서도 사진을 보여준다', async () => {
    mockGetMemberProfile.mockResolvedValue({
      memberStatus: 'active',
      profile: {
        avatar_url: 'https://cdn.example.com/edge-avatar.jpg',
        bio: null,
        birth_year: null,
        gender: null,
        mbti: null,
        nickname: '철수',
        photo_url: 'user-target/profile.jpg',
        region: null,
      },
    });

    render(<ReportCategoryScreen />);

    await screen.findByText('철수');

    expect(screen.getByTestId('av-photo').props.source).toEqual({
      uri: 'https://cdn.example.com/edge-avatar.jpg',
    });
    expect(mockResolveProfilePhotoUrl).not.toHaveBeenCalled();
  });

  it('함께 차단하기를 켠 경우에만 block upsert를 실행한다', async () => {
    render(<ReportCategoryScreen />);

    await screen.findByText('철수');

    fireEvent.press(screen.getByText('광고·스팸'));
    fireEvent.press(screen.getByTestId('report-block-too-toggle'));
    fireEvent.press(screen.getByTestId('report-submit'));

    await waitFor(() => {
      expect(mockBlockUpsert).toHaveBeenCalledWith(
        {
          blocked_user_id: TARGET_ID,
          blocker_user_id: USER_ID,
          room_id: ROOM_ID,
          unblocked_at: null,
        },
        { onConflict: 'blocker_user_id,blocked_user_id' },
      );
    });
  });
});
