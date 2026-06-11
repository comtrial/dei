import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockAnalyticsCapture = jest.fn();
const mockGetMemberProfile = jest.fn();
const mockGetCachedProfilePhotoUrl = jest.fn();
const mockResolveProfilePhotoUrl = jest.fn();
const mockRouter = { back: mockBack, push: mockPush, replace: mockReplace };

let mockParams: { userId?: string; roomId?: string } = {
  userId: 'user-target',
  roomId: 'room-123',
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
}));

jest.mock('@/lib/room-rpc', () => ({
  getMemberProfile: (...args: unknown[]) => mockGetMemberProfile(...args),
}));

jest.mock('@/lib/profile-photo-cache', () => ({
  getCachedProfilePhotoUrl: (...args: unknown[]) => mockGetCachedProfilePhotoUrl(...args),
  resolveProfilePhotoUrl: (...args: unknown[]) => mockResolveProfilePhotoUrl(...args),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'user-self' } }),
}));

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import MemberProfileScreen from '../members';
// eslint-disable-next-line import/first -- cache helper is populated per test before render
import { setCachedRoomChatMembers } from '@/lib/chat/member-cache';

const BASE_PROFILE = {
  nickname: '철수',
  gender: 'male',
  birth_year: 2000,
  region: '서울',
  photo_url: null,
  bio: '안녕하세요',
  mbti: 'INTJ',
};

describe('MemberProfileScreen (S14)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { userId: 'user-target', roomId: 'room-123' };
    mockGetCachedProfilePhotoUrl.mockReturnValue(null);
    mockResolveProfilePhotoUrl.mockResolvedValue('https://cdn.example.com/profile.jpg');
  });

  it('프로필 mock → ProfileHero + InfoRows 렌더', async () => {
    mockGetMemberProfile.mockResolvedValue({
      memberStatus: 'active',
      profile: BASE_PROFILE,
    });

    render(<MemberProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText('철수')).toBeTruthy();
    });

    expect(screen.getByText('서울')).toBeTruthy();
    expect(screen.getByText('안녕하세요')).toBeTruthy();
    expect(screen.getByText('MBTI')).toBeTruthy();
    expect(screen.getByText('INTJ')).toBeTruthy();
  });

  it('region 빈 값 → 지역 row 숨김', async () => {
    mockGetMemberProfile.mockResolvedValue({
      memberStatus: 'active',
      profile: { ...BASE_PROFILE, region: null },
    });

    render(<MemberProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText('철수')).toBeTruthy();
    });

    expect(screen.queryByText('지역')).toBeNull();
    expect(screen.getByText('INTJ')).toBeTruthy();
  });

  it('profile photo storage path → signed URL로 렌더', async () => {
    mockGetMemberProfile.mockResolvedValue({
      memberStatus: 'active',
      profile: { ...BASE_PROFILE, photo_url: 'user-target/profile.jpg' },
    });

    render(<MemberProfileScreen />);

    await waitFor(() => {
      expect(mockResolveProfilePhotoUrl).toHaveBeenCalledWith(
        { path: 'user-target/profile.jpg', userId: 'user-target' },
        { screen: 'member-profile', roomId: 'room-123' },
      );
    });

    const image = await screen.findByTestId('member-profile-photo');
    expect(image.props.source.uri).toBe('https://cdn.example.com/profile.jpg');
  });

  it('cached photo URL이 있으면 프로필 첫 렌더부터 사진을 보여준다', async () => {
    mockGetCachedProfilePhotoUrl.mockReturnValue('https://cdn.example.com/cached-profile.jpg');
    mockResolveProfilePhotoUrl.mockReturnValue(new Promise(() => {}));
    mockGetMemberProfile.mockResolvedValue({
      memberStatus: 'active',
      profile: { ...BASE_PROFILE, photo_url: 'user-target/profile.jpg' },
    });

    render(<MemberProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText('철수')).toBeTruthy();
    });

    const image = await screen.findByTestId('member-profile-photo');
    expect(image.props.source.uri).toBe('https://cdn.example.com/cached-profile.jpg');
  });

  it('cached member profile이 있으면 네트워크 응답 전 상세 정보를 바로 보여준다', () => {
    mockParams = { userId: 'user-cached-profile', roomId: 'room-cached-profile' };
    mockGetMemberProfile.mockReturnValue(new Promise(() => {}));
    setCachedRoomChatMembers('room-cached-profile', [
      {
        avatarInitial: '철',
        name: '철수',
        photoUrl: 'https://cdn.example.com/cached-member.jpg',
        profile: {
          ...BASE_PROFILE,
          avatar_url: 'https://cdn.example.com/cached-member.jpg',
        },
        status: 'active',
        userId: 'user-cached-profile',
      },
    ]);

    render(<MemberProfileScreen />);

    expect(screen.getByText('철수')).toBeTruthy();
    expect(screen.getByText('서울')).toBeTruthy();
    expect(screen.getByText('안녕하세요')).toBeTruthy();
    expect(screen.getByText('INTJ')).toBeTruthy();
    expect(screen.queryByText('프로필을 불러오고 있어요.')).toBeNull();
  });

  it('edge avatar URL이 있으면 storage signing 없이 바로 렌더', async () => {
    mockGetMemberProfile.mockResolvedValue({
      memberStatus: 'active',
      profile: {
        ...BASE_PROFILE,
        avatar_url: 'https://cdn.example.com/edge-avatar.jpg',
        photo_url: 'user-target/profile.jpg',
      },
    });

    render(<MemberProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText('철수')).toBeTruthy();
    });

    const image = await screen.findByTestId('member-profile-photo');
    expect(image.props.source.uri).toBe('https://cdn.example.com/edge-avatar.jpg');
    expect(mockResolveProfilePhotoUrl).not.toHaveBeenCalled();
  });

  it('공개 상세 정보가 없으면 fallback을 보여준다', async () => {
    mockGetMemberProfile.mockResolvedValue({
      memberStatus: 'active',
      profile: {
        ...BASE_PROFILE,
        bio: null,
        mbti: null,
        region: null,
      },
    });

    render(<MemberProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText('철수')).toBeTruthy();
    });

    expect(screen.getByText('아직 공개한 상세 정보가 없어요.')).toBeTruthy();
  });

  it('room_member.status=left → AlertDialog 표시 + 확인 → router.back', async () => {
    mockGetMemberProfile.mockResolvedValue({
      memberStatus: 'left',
      profile: BASE_PROFILE,
    });

    render(<MemberProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText('방을 나간 친구예요')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('member-left-confirm'));

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  it('⋯ 탭 → analytics capture + router.push (param 검증)', async () => {
    mockGetMemberProfile.mockResolvedValue({
      memberStatus: 'active',
      profile: BASE_PROFILE,
    });

    render(<MemberProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText('철수')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('더보기'));

    await waitFor(() => {
      expect(mockAnalyticsCapture).toHaveBeenCalledWith(
        'S7:profile_overflow_menu_opened',
        expect.objectContaining({ roomId: 'room-123', targetUserId: 'user-target' }),
      );
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            roomId: 'room-123',
            targetId: 'user-target',
            targetNickname: '철수',
          }),
          pathname: '/(app)/report/block-report',
        }),
      );
    });
  });

  it('본인 프로필 target이면 신고/차단 메뉴 없이 내 프로필로 보낸다', async () => {
    mockParams = { userId: 'user-self', roomId: 'room-123' };

    render(<MemberProfileScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/my-profile');
    });

    expect(mockGetMemberProfile).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('더보기')).toBeNull();
  });
});
