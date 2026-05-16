import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChatComposer } from '../ChatComposer';

describe('ChatComposer (CH2 컴포저)', () => {
  it('빈 입력에서는 전송이 비활성, 카운터 미표시', () => {
    render(<ChatComposer onSend={jest.fn()} />);
    expect(screen.getByTestId('chat-composer-send').props.accessibilityState?.disabled).toBe(
      true,
    );
    expect(screen.queryByTestId('chat-composer-counter')).toBeNull();
  });

  it('1~500자 입력 시 전송 활성 + 카운터 표시', () => {
    render(<ChatComposer onSend={jest.fn()} />);
    fireEvent.changeText(screen.getByTestId('chat-composer-input'), '안녕');
    expect(screen.getByTestId('chat-composer-counter')).toHaveTextContent('2/500');
    expect(screen.getByTestId('chat-composer-send').props.accessibilityState?.disabled).toBe(
      false,
    );
  });

  it('전송 tap → trim 된 본문으로 onSend, 입력 초기화', () => {
    const onSend = jest.fn();
    render(<ChatComposer onSend={onSend} />);
    fireEvent.changeText(screen.getByTestId('chat-composer-input'), '  hello  ');
    fireEvent.press(screen.getByTestId('chat-composer-send'));
    expect(onSend).toHaveBeenCalledWith('hello');
    // 초기화되어 카운터가 사라짐.
    expect(screen.queryByTestId('chat-composer-counter')).toBeNull();
  });

  it('501자 입력 시 전송 비활성 (경계 초과)', () => {
    const onSend = jest.fn();
    render(<ChatComposer onSend={onSend} />);
    fireEvent.changeText(screen.getByTestId('chat-composer-input'), 'x'.repeat(501));
    fireEvent.press(screen.getByTestId('chat-composer-send'));
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByTestId('chat-composer-counter')).toHaveTextContent('501/500');
  });

  it('disabled 면 전송 불가 (상대 나감/종료 시)', () => {
    const onSend = jest.fn();
    render(<ChatComposer disabled onSend={onSend} />);
    fireEvent.changeText(screen.getByTestId('chat-composer-input'), 'hi');
    fireEvent.press(screen.getByTestId('chat-composer-send'));
    expect(onSend).not.toHaveBeenCalled();
  });
});
