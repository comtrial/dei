import { Alert } from 'react-native';

import { analytics } from '@dei/shared';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ProfileScreen } from '@/components/profile/ProfileScreen';
import { useProfileFeed } from '@/hooks/useProfileFeed';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('expo-video', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    VideoView: ({ testID }: { testID?: string }) => <View testID={testID ?? 'video-view'} />,
    useVideoPlayer: jest.fn(() => ({ loop: false, muted: true })),
  };
});

jest.mock('@/hooks/useProfileFeed', () => ({
  useProfileFeed: jest.fn(),
}));

jest.mock('@/hooks/useDeleteLog', () => ({
  useDeleteLog: () => ({
    deleteLog: jest.fn(),
    pending: false,
  }),
}));

const mockUseProfileFeed = useProfileFeed as jest.Mock;
const captureSpy = jest.spyOn(analytics, 'capture').mockImplementation(() => undefined);

function mockProfileFeedState(overrides = {}) {
  mockUseProfileFeed.mockReturnValue({
    blockProfile: jest.fn(),
    days: [],
    error: null,
    isBlockedByViewer: false,
    isBlocking: false,
    isLoading: false,
    isReporting: false,
    profile: null,
    refresh: jest.fn(),
    reportProfile: jest.fn(),
    ...overrides,
  });
}

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a dedicated blocked-profile notice', () => {
    mockProfileFeedState({
      error: '차단한 프로필입니다.',
      isBlockedByViewer: true,
    });

    const { getByText, queryByText } = render(
      <ProfileScreen mode="public" profileUserId="blocked-user-id" />
    );

    expect(getByText('차단한 프로필입니다.')).toBeTruthy();
    expect(getByText('차단을 해제하기 전까지 이 프로필과 로그를 볼 수 없어요.')).toBeTruthy();
    expect(queryByText('프로필을 찾을 수 없어요.')).toBeNull();
  });

  it('opens report/block actions from the public profile overflow menu', async () => {
    const reportProfile = jest.fn().mockResolvedValue(true);
    mockProfileFeedState({
      profile: {
        createdAt: '2026-05-12T00:00:00.000Z',
        gender: 'F',
        interestCategories: [],
        interestTags: [],
        intro: '안녕하세요',
        mbti: 'ENTP',
        nickname: '상대',
        photoUrl: null,
        regionSido: '서울',
        regionSigungu: '강남구',
        userId: 'profile-user-id',
      },
      reportProfile,
    });

    const { getByTestId, getByText } = render(
      <ProfileScreen mode="public" profileUserId="profile-user-id" />
    );

    fireEvent.press(getByTestId('profile-more-menu'));
    expect(getByText('신고하기')).toBeTruthy();
    expect(getByText('차단하기')).toBeTruthy();

    fireEvent.press(getByTestId('profile-report-menu-item'));
    fireEvent.press(getByTestId('profile-report-reason-ABUSE'));
    fireEvent.press(getByTestId('profile-report-submit'));

    await waitFor(() => {
      expect(reportProfile).toHaveBeenCalledWith({
        description: null,
        reason: '괴롭힘 또는 혐오 표현',
        reasonCategory: 'ABUSE',
      });
    });

    await waitFor(() => {
      expect(captureSpy).toHaveBeenCalledWith('report_submitted', {
        reason: 'ABUSE',
        target_user_id: 'profile-user-id',
        source_context: 'profile',
      });
    });
  });

  it('captures block_confirmed after a successful block', async () => {
    const blockProfile = jest.fn().mockResolvedValue(true);
    mockProfileFeedState({
      profile: {
        createdAt: '2026-05-12T00:00:00.000Z',
        gender: 'F',
        interestCategories: [],
        interestTags: [],
        intro: '안녕하세요',
        mbti: 'ENTP',
        nickname: '상대',
        photoUrl: null,
        regionSido: '서울',
        regionSigungu: '강남구',
        userId: 'profile-user-id',
      },
      blockProfile,
    });

    const alertSpy = jest.spyOn(Alert, 'alert');

    const { getByTestId } = render(
      <ProfileScreen mode="public" profileUserId="profile-user-id" />
    );

    fireEvent.press(getByTestId('profile-more-menu'));
    fireEvent.press(getByTestId('profile-block-menu-item'));

    // handleBlock 가 띄운 확인 Alert 의 "차단" 버튼(onPress) 을 직접 호출.
    const confirmCall = alertSpy.mock.calls.find(([title]) => title === '차단');
    const buttons = confirmCall?.[2] as
      | { text?: string; onPress?: () => void | Promise<void> }[]
      | undefined;
    const confirmButton = buttons?.find((b) => b.text === '차단');
    await confirmButton?.onPress?.();

    expect(blockProfile).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(captureSpy).toHaveBeenCalledWith('block_confirmed', {
        target_user_id: 'profile-user-id',
      });
    });
  });
});
