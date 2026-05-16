import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChatEmptyState } from '../ChatEmptyState';

describe('ChatEmptyState (CH3 빈 상태)', () => {
  it('빈 상태 안내와 CTA 를 렌더한다', () => {
    render(<ChatEmptyState onRecord={jest.fn()} />);
    expect(screen.getByText('아직 매칭이 없어요')).toBeTruthy();
    expect(screen.getByTestId('chat-empty-state')).toBeTruthy();
    expect(screen.getByText('일상 로그 기록하기')).toBeTruthy();
  });

  it('CTA tap → onRecord 호출 (→ R3 촬영)', () => {
    const onRecord = jest.fn();
    render(<ChatEmptyState onRecord={onRecord} />);
    fireEvent.press(screen.getByTestId('chat-empty-record'));
    expect(onRecord).toHaveBeenCalledTimes(1);
  });
});
