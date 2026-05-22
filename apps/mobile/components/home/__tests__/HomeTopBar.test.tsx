import { fireEvent, render } from '@testing-library/react-native';

import { HomeTopBar } from '@/components/home/HomeTopBar';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

describe('HomeTopBar', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('shows the current heart and refresh ticket balances and keeps the fixed notification button removed', () => {
    const { getByText, queryByLabelText } = render(
      <HomeTopBar heartCount={3} refreshItemCount={2} />,
    );

    expect(getByText('3')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
    expect(queryByLabelText('보유 하트 3개')).toBeTruthy();
    expect(queryByLabelText('보유 이용권 2개')).toBeTruthy();
    expect(queryByLabelText('알림')).toBeNull();
  });

  it('navigates to my profile from the profile button', () => {
    const { getByLabelText } = render(<HomeTopBar heartCount={0} />);

    fireEvent.press(getByLabelText('내 프로필'));
    expect(mockPush).toHaveBeenCalledWith('/my-profile');
  });
});
