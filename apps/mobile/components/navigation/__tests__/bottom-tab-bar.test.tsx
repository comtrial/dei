import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { BottomTabBar } from '../bottom-tab-bar';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

const mockUnread = jest.fn(() => 0);
jest.mock('@/hooks/useLikesUnreadCount', () => ({
  useLikesUnreadCount: () => mockUnread(),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const ROUTE_NAMES = ['home', 'likes', 'messages', 'record'];

function makeProps(focusedName = 'home') {
  const routes = ROUTE_NAMES.map((name, i) => ({ key: `${name}-${i}`, name }));
  const navigation = {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  };
  const props = {
    state: { index: routes.findIndex((r) => r.name === focusedName), routes },
    navigation,
    descriptors: {},
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  } as unknown as BottomTabBarProps;
  return { props, navigation };
}

beforeEach(() => {
  mockUnread.mockReturnValue(0);
});

describe('BottomTabBar', () => {
  it('홈·좋아요·DM·My dei 4개 항목을 렌더한다 (REC → My dei)', () => {
    render(<BottomTabBar {...makeProps('home').props} />);
    expect(screen.getByText('홈')).toBeTruthy();
    expect(screen.getByText('좋아요')).toBeTruthy();
    expect(screen.getByText('DM')).toBeTruthy();
    expect(screen.getByText('My dei')).toBeTruthy();
    expect(screen.queryByText('REC')).toBeNull();
  });

  it('좋아요 미확인이 있으면 빨강 배지를 보여준다', () => {
    mockUnread.mockReturnValue(3);
    render(<BottomTabBar {...makeProps('home').props} />);
    expect(screen.getByTestId('tab-likes-badge')).toBeTruthy();
  });

  it('좋아요 미확인이 없으면 배지를 숨긴다', () => {
    mockUnread.mockReturnValue(0);
    render(<BottomTabBar {...makeProps('home').props} />);
    expect(screen.queryByTestId('tab-likes-badge')).toBeNull();
  });

  it('녹화(record) 화면에서는 탭바 전체를 숨긴다', () => {
    render(<BottomTabBar {...makeProps('record').props} />);
    expect(screen.queryByTestId('tab-home')).toBeNull();
    expect(screen.queryByText('My dei')).toBeNull();
  });

  it('포커스되지 않은 탭을 누르면 해당 라우트로 이동한다', () => {
    const { props, navigation } = makeProps('home');
    render(<BottomTabBar {...props} />);
    fireEvent.press(screen.getByTestId('tab-likes'));
    expect(navigation.navigate).toHaveBeenCalledWith('likes');
  });

  it('My dei(녹화) 버튼을 누르면 record 라우트로 이동한다', () => {
    const { props, navigation } = makeProps('home');
    render(<BottomTabBar {...props} />);
    fireEvent.press(screen.getByTestId('tab-record'));
    expect(navigation.navigate).toHaveBeenCalledWith('record');
  });

  it('이미 포커스된 탭을 누르면 중복 이동하지 않는다', () => {
    const { props, navigation } = makeProps('home');
    render(<BottomTabBar {...props} />);
    fireEvent.press(screen.getByTestId('tab-home'));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
