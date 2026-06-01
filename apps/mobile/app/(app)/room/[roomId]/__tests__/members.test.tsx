import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockAnalyticsCapture = jest.fn();
const mockGetMemberProfile = jest.fn();

let mockParams: { userId?: string; roomId?: string } = {
  userId: 'user-target',
  roomId: 'room-123',
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@dei/shared', () => ({
  analytics: { capture: (...args: unknown[]) => mockAnalyticsCapture(...args) },
  logger: { captureException: jest.fn() },
}));

jest.mock('@/lib/room-rpc', () => ({
  getMemberProfile: (...args: unknown[]) => mockGetMemberProfile(...args),
}));

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import MemberProfileScreen from '../members';

const BASE_PROFILE = {
  nickname: '철수',
  gender: 'male',
  birth_year: 2000,
  region: '서울',
  photo_url: null,
  bio: '안녕하세요',
};

describe('MemberProfileScreen (S14)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { userId: 'user-target', roomId: 'room-123' };
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
  });

  it('MBTI row 영구 hide — 텍스트 "MBTI" 0건', async () => {
    mockGetMemberProfile.mockResolvedValue({
      memberStatus: 'active',
      profile: BASE_PROFILE,
    });

    render(<MemberProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText('철수')).toBeTruthy();
    });

    expect(screen.queryByText('MBTI')).toBeNull();
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
        expect.stringContaining('targetId=user-target'),
      );
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('roomId=room-123'),
      );
    });
  });
});
