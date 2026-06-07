import { fireEvent, render, screen } from '@testing-library/react-native';

import { MatchingWaitingView } from '../MatchingWaitingView';

describe('MatchingWaitingView', () => {
  it('renders the shared waiting layout with optional action and toast', () => {
    const onPress = jest.fn();

    render(
      <MatchingWaitingView
        action={{ label: '매칭 취소', onPress }}
        cardLabel="평균 대기 시간"
        cardValue="확인 중"
        description={`앱을 닫아도 매칭되면\n알림으로 알려드려요.`}
        title={`곧 만날 사람들을\n찾고 있어요`}
        toast="바로 매칭 시작할게요"
      />,
    );

    expect(screen.getByText('dei')).toBeTruthy();
    expect(screen.getByText('곧 만날 사람들을\n찾고 있어요')).toBeTruthy();
    expect(screen.getByText('평균 대기 시간')).toBeTruthy();
    expect(screen.getByText('확인 중')).toBeTruthy();
    expect(screen.getByText('바로 매칭 시작할게요')).toBeTruthy();

    fireEvent.press(screen.getByText('매칭 취소'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
