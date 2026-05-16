import { render } from '@testing-library/react-native';

import { ProfileLogFeed } from '@/components/profile/ProfileLogFeed';
import type { ProfileLogDay } from '@/lib/profileLogs';

jest.mock('expo-video', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    VideoView: ({ testID }: { testID?: string }) => <View testID={testID ?? 'video-view'} />,
    useVideoPlayer: jest.fn(() => ({ loop: false, muted: true })),
  };
});

const days: ProfileLogDay[] = [
  {
    completedHourSlots: [8, 18],
    completedLogCount: 2,
    completedSlots: ['오전', '저녁'],
    date: '2026-05-12',
    displayDate: '2026년 05월 12일',
    isDailyLogComplete: false,
    logs: [
      {
        createdAt: '2026-05-12T18:00:00.000+09:00',
        durationSec: 2,
        hourSlot: 18,
        id: 'log-1',
        recordedAt: '2026-05-12T18:00:00.000+09:00',
        slotLabel: '저녁',
        videoPath: 'logs/log-1.mp4',
        videoUrl: 'https://example.test/log-1.mp4',
      },
    ],
  },
];

describe('ProfileLogFeed', () => {
  it('renders date sections and 3:4 single-column log cards', () => {
    const { getByTestId, getByText } = render(<ProfileLogFeed days={days} />);

    expect(getByText('2026년 05월 12일')).toBeTruthy();
    expect(getByText('2/3 미완성')).toBeTruthy();
    expect(getByTestId('profile-log-card-log-1')).toHaveStyle({ aspectRatio: 3 / 4 });
  });

  it('does not render archive wording', () => {
    const { queryByText } = render(<ProfileLogFeed days={days} />);

    expect(queryByText(/보관함|보관권|보관 구매/)).toBeNull();
  });
});
