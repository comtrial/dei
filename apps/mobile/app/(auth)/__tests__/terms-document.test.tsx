import { render, screen } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ section: 'location' }),
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('@dei/ui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    Badge: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(RN.View, null, children),
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(RN.Text, props, children),
    TopNav: () => null,
  };
});

// eslint-disable-next-line import/first -- SUT import must run after jest.mock() calls
import TermsDocumentScreen from '../terms-document';

describe('TermsDocumentScreen', () => {
  it('앱 안에서 위치정보 약관 전문 내용을 보여준다', () => {
    render(<TermsDocumentScreen />);

    expect(screen.getByText('위치정보 수집 및 이용 동의')).toBeTruthy();
    expect(screen.getByText(/현재 위치는 지역 자동 입력과 매칭 추천 지역 보정에 사용돼요/)).toBeTruthy();
  });
});
