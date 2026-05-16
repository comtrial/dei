import { render } from '@testing-library/react-native';

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

const mockUseProfileFeed = useProfileFeed as jest.Mock;

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
});
