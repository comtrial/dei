import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChatMoreSheet } from '../ChatMoreSheet';

describe('ChatMoreSheet (CH4 더보기 시트)', () => {
  it('열렸을 때 2개 항목을 렌더한다 (상대 프로필 보기 / 나가기)', () => {
    render(
      <ChatMoreSheet
        onClose={jest.fn()}
        onLeave={jest.fn()}
        onViewProfile={jest.fn()}
        visible
      />,
    );
    expect(screen.getByText('상대 프로필 보기')).toBeTruthy();
    expect(screen.getByText('나가기')).toBeTruthy();
  });

  it('"상대 프로필 보기" tap → onViewProfile (→ OP3)', () => {
    const onViewProfile = jest.fn();
    render(
      <ChatMoreSheet
        onClose={jest.fn()}
        onLeave={jest.fn()}
        onViewProfile={onViewProfile}
        visible
      />,
    );
    fireEvent.press(screen.getByTestId('chat-more-view-profile'));
    expect(onViewProfile).toHaveBeenCalledTimes(1);
  });

  it('"나가기" tap → onLeave (→ CH5 다이얼로그)', () => {
    const onLeave = jest.fn();
    render(
      <ChatMoreSheet
        onClose={jest.fn()}
        onLeave={onLeave}
        onViewProfile={jest.fn()}
        visible
      />,
    );
    fireEvent.press(screen.getByTestId('chat-more-leave'));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('backdrop tap → onClose', () => {
    const onClose = jest.fn();
    render(
      <ChatMoreSheet
        onClose={onClose}
        onLeave={jest.fn()}
        onViewProfile={jest.fn()}
        visible
      />,
    );
    fireEvent.press(screen.getByTestId('chat-more-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
