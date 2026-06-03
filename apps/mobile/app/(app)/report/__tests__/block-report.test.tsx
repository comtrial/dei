import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const TARGET_ID = '00000000-0000-4000-8000-000000000001';
const ROOM_ID = '00000000-0000-4000-8000-000000000002';
const USER_ID = '00000000-0000-4000-8000-000000000003';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockRouter = { back: mockBack, replace: mockReplace };
const mockAnalyticsCapture = jest.fn();
const mockProfileMaybeSingle = jest.fn();
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
  REPORT_CATEGORIES: [],
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
import BlockReportSheetScreen from '../block-report';

describe('BlockReportSheetScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { roomId: ROOM_ID, targetId: TARGET_ID };
    mockProfileMaybeSingle.mockResolvedValue({
      data: { nickname: '철수', photo_url: null },
      error: null,
    });
    mockBlockUpsert.mockResolvedValue({ error: null });
    mockGetMemberProfile.mockResolvedValue(null);
    mockGetCachedProfilePhotoUrl.mockReturnValue(null);
    mockResolveProfilePhotoUrl.mockResolvedValue('https://cdn.example.com/report-avatar.jpg');
  });

  it('신고하기는 기존 sheet를 닫고 신고 카테고리 화면으로 replace한다', async () => {
    render(<BlockReportSheetScreen />);

    await screen.findByText('철수');

    fireEvent.press(screen.getByTestId('block-report-open-report'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/report/[targetId]',
      params: { targetId: TARGET_ID, roomId: ROOM_ID, targetNickname: '철수' },
    });
    await waitFor(() => {
      expect(screen.queryByTestId('bottom-sheet-surface')).toBeNull();
    });
  });

  it('route param에 사진이 있으면 네트워크 조회 전 첫 렌더부터 사진을 보여준다', () => {
    mockParams = {
      roomId: ROOM_ID,
      targetAvatarUrl: 'https://cdn.example.com/passed-avatar.jpg',
      targetId: TARGET_ID,
      targetNickname: '철수',
    };
    mockGetMemberProfile.mockReturnValue(new Promise(() => {}));

    render(<BlockReportSheetScreen />);

    expect(screen.getByText('철수')).toBeTruthy();
    expect(screen.getByTestId('av-photo').props.source).toEqual({
      uri: 'https://cdn.example.com/passed-avatar.jpg',
    });
  });

  it('차단하기는 확인 다이얼로그를 보여주고 최종 확인 후 block upsert를 실행한다', async () => {
    render(<BlockReportSheetScreen />);

    await screen.findByText('철수');

    fireEvent.press(screen.getByTestId('block-report-open-block-confirm'));

    expect(screen.getByText('정말 차단할까요?')).toBeTruthy();
    expect(screen.queryByTestId('bottom-sheet-surface')).toBeNull();

    fireEvent.press(screen.getByTestId('block-report-confirm-submit'));

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

    expect(screen.getByText('신고도 함께 하시겠어요?')).toBeTruthy();
    expect(screen.queryByTestId('bottom-sheet-surface')).toBeNull();
  });

  it('상대 프로필 사진이 있으면 이니셜 대신 사진을 보여준다', async () => {
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

    render(<BlockReportSheetScreen />);

    await screen.findByText('철수');

    expect(screen.getByTestId('av-photo').props.source).toEqual({
      uri: 'https://cdn.example.com/edge-avatar.jpg',
    });
    expect(mockResolveProfilePhotoUrl).not.toHaveBeenCalled();
  });
});
