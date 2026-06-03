import { fireEvent, render, screen } from '@testing-library/react-native';

import { NewMessageJumpButton } from '../NewMessageJumpButton';

describe('NewMessageJumpButton', () => {
  it('renders "↓ N개 새 메시지" when count > 0', () => {
    render(<NewMessageJumpButton count={3} onPress={jest.fn()} />);
    expect(screen.getByText('↓ 3개 새 메시지')).toBeTruthy();
  });

  it('onPress fires when tapped', () => {
    const onPress = jest.fn();
    render(<NewMessageJumpButton count={1} onPress={onPress} />);
    fireEvent.press(screen.getByTestId('new-message-jump'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('returns null when count <= 0', () => {
    const { toJSON } = render(<NewMessageJumpButton count={0} onPress={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it('returns null when visible=false', () => {
    const { toJSON } = render(
      <NewMessageJumpButton count={5} onPress={jest.fn()} visible={false} />,
    );
    expect(toJSON()).toBeNull();
  });
});
