import { render } from '@testing-library/react-native';

import { HomeTopBarSlot } from '@/components/home/HomeTopBarSlot';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

// useFeatureFlag 를 테스트별로 제어 — flag 값에 따라 variant 가 갈리는지 검증.
// jest.mock factory hoisting 규칙상 mock 접두사 변수만 참조 가능.
let mockFlagValue: string = 'A';
jest.mock('@/providers/feature-flags-provider', () => ({
  useFeatureFlag: () => mockFlagValue,
}));

describe('HomeTopBarSlot (home_top_layout variant)', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('flag=A (기본/무압박) → HomeTopBar 렌더 (B/C 카드 없음)', () => {
    mockFlagValue = 'A';
    const { queryByTestId, getByLabelText } = render(
      <HomeTopBarSlot heartCount={3} daysSinceVideo={5} />,
    );
    expect(queryByTestId('home-top-variant-b')).toBeNull();
    expect(queryByTestId('home-top-variant-c')).toBeNull();
    // A 는 기본 HomeTopBar — 프로필 버튼 존재
    expect(getByLabelText('내 프로필')).toBeTruthy();
  });

  it('flag=B (모멘텀/보상레버) → 반응 통계 카드 렌더', () => {
    mockFlagValue = 'B';
    const { getByTestId, getByText } = render(
      <HomeTopBarSlot heartCount={3} daysSinceVideo={2} />,
    );
    expect(getByTestId('home-top-variant-b')).toBeTruthy();
    expect(getByText('반응이 오고 있어요')).toBeTruthy();
    expect(getByText('한 편 더 찍기')).toBeTruthy();
  });

  it('flag=C (리프레시/압박) → 새 영상 유도 카드 렌더', () => {
    mockFlagValue = 'C';
    const { getByTestId, getByText } = render(
      <HomeTopBarSlot heartCount={0} daysSinceVideo={24} />,
    );
    expect(getByTestId('home-top-variant-c')).toBeTruthy();
    expect(getByText('요즘 모습 보여주세요')).toBeTruthy();
    expect(getByText('새로 찍기')).toBeTruthy();
  });

  it('알 수 없는 flag 값 → A 로 안전 fallback', () => {
    mockFlagValue = 'ZZZ';
    const { queryByTestId, getByLabelText } = render(<HomeTopBarSlot heartCount={1} />);
    expect(queryByTestId('home-top-variant-b')).toBeNull();
    expect(queryByTestId('home-top-variant-c')).toBeNull();
    expect(getByLabelText('내 프로필')).toBeTruthy();
  });
});
