import { render } from '@testing-library/react-native';
import { CurationCard } from '@/components/home/CurationCard';
import type { CurationItem } from '@/hooks/useHomeScreen';

jest.mock('expo-video', () => ({
  useVideoPlayer: (_source: string | null, setup?: (player: any) => void) => {
    const player = {
      addListener: jest.fn(() => ({ remove: jest.fn() })),
      loop: false,
      muted: true,
      play: jest.fn(),
      replace: jest.fn(),
    };
    setup?.(player);
    return player;
  },
  VideoView: () => null,
}));

const item: CurationItem = {
  age: 29,
  displayName: '민지',
  gender: 'F',
  region: '서울',
  userId: 'target-user',
  videos: [{ logId: 'log-1', poolId: 'pool-1', videoUrl: 'https://example.test/video.mp4' }],
};

const baseProps = {
  item,
  isLikeUsed: false,
  onLike: jest.fn(),
  onPress: jest.fn(),
};

describe('CurationCard like button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the unliked button neutral instead of red', () => {
    const { getByLabelText, getByTestId, queryByTestId } = render(
      <CurationCard {...baseProps} isLiked={false} />,
    );

    expect(getByLabelText('좋아요 보내기')).toBeTruthy();
    expect(getByTestId('curation-like-button-idle')).toBeTruthy();
    expect(queryByTestId('curation-like-button-liked')).toBeNull();
  });

  it('turns only the liked button red', () => {
    const { getByLabelText, getByTestId, queryByTestId } = render(
      <CurationCard {...baseProps} isLiked />,
    );

    expect(getByLabelText('좋아요 보냄')).toBeTruthy();
    expect(getByTestId('curation-like-button-liked')).toBeTruthy();
    expect(queryByTestId('curation-like-button-idle')).toBeNull();
  });
});
