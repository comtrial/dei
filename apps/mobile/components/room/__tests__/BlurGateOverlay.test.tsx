/**
 * R3: BlurGateOverlay 컴포넌트 테스트.
 */
import { render, screen } from '@testing-library/react-native';

import { BlurGateOverlay } from '../BlurGateOverlay';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, testID, onPress }: { children: React.ReactNode; testID?: string; onPress?: () => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pressable } = require('react-native');
    return <Pressable testID={testID} onPress={onPress}>{children}</Pressable>;
  },
}));

jest.mock('@/components/ui/text', () => ({
  Text: ({ children }: { children: React.ReactNode }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text: RNText } = require('react-native');
    return <RNText>{children}</RNText>;
  },
}));

describe('BlurGateOverlay (R3)', () => {
  it('renders nothing when gate is open', () => {
    const { toJSON } = render(
      <BlurGateOverlay state={{ kind: 'open' }} roomId="room-1" />,
    );
    expect(toJSON()).toBeNull();
  });

  it('shows first-upload CTA when never-uploaded', () => {
    render(
      <BlurGateOverlay state={{ kind: 'never-uploaded' }} roomId="room-1" />,
    );
    expect(screen.getByTestId('room-feed-blur-overlay')).toBeTruthy();
    expect(screen.getByText('첫 영상을 올려보세요')).toBeTruthy();
    expect(screen.getByTestId('room-feed-blur-upload-cta')).toBeTruthy();
  });

  it('shows expired CTA when 24h passed', () => {
    render(
      <BlurGateOverlay
        state={{ kind: 'expired', lastUploadedAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString() }}
        roomId="room-1"
      />,
    );
    expect(screen.getByTestId('room-feed-blur-overlay')).toBeTruthy();
    expect(screen.getByText('피드가 잠겼어요')).toBeTruthy();
  });
});
