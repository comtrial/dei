import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { BottomTabBar } from '../bottom-tab-bar';

/**
 * Phase 1 정리 후 — likes/messages 탭 제거 + useLikesUnreadCount 의존 제거.
 * Phase 3 에서 새 도메인 탭 (방/묶음 등) 추가 시 이 테스트도 함께 확장.
 */
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

const ROUTE_NAMES = ['home', 'record'];

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

describe('BottomTabBar', () => {
  it('Phase 1 단순화: 홈 + My dei 만 렌더한다', () => {
    render(<BottomTabBar {...makeProps('home').props} />);
    expect(screen.getByText('홈')).toBeTruthy();
    expect(screen.getByText('My dei')).toBeTruthy();
    // 옛 좋아요·DM 탭은 사라진 상태
    expect(screen.queryByText('좋아요')).toBeNull();
    expect(screen.queryByText('DM')).toBeNull();
  });

  it('녹화(record) 화면에서는 탭바 전체를 숨긴다', () => {
    render(<BottomTabBar {...makeProps('record').props} />);
    expect(screen.queryByTestId('tab-home')).toBeNull();
    expect(screen.queryByText('My dei')).toBeNull();
  });

  // 포커스되지 않은 일반 탭 → 다른 일반 탭 이동 케이스는 Phase 3 에서 새
  // 도메인 탭(방/묶음 등)이 추가되면 그때 다시 작성. 현재는 일반 탭이 home
  // 하나뿐 + record 포커스 시 탭바 자체가 hidden 이라 무의미한 케이스.

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
