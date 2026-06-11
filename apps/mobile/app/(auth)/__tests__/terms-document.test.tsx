import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
let mockParams: { section?: string } = { section: 'location' };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { section: 'location' };
  });

  it('앱 안에서 위치정보 약관 전문 내용을 보여준다', () => {
    render(<TermsDocumentScreen />);

    expect(screen.getByText('위치정보 이용약관')).toBeTruthy();
    expect(screen.getByText('제16조 (사업자 및 위치정보관리책임자 정보)')).toBeTruthy();
    expect(screen.getByText('공고일자 : 【2026년 06월 01일】')).toBeTruthy();
    expect(screen.getByText(/본 약관은 커맨드소프트웨어/)).toBeTruthy();
  });

  it('전체 약관 화면에서 위치정보 수집 칩을 누르면 위치정보 전문으로 이동한다', () => {
    mockParams = {};

    render(<TermsDocumentScreen />);

    fireEvent.press(screen.getByLabelText('위치정보 수집 보기'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/terms-document',
      params: { section: 'location' },
    });
  });
});
