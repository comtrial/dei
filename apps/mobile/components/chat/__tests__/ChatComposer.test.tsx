import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChatComposer } from '../ChatComposer';
import { analytics } from '@dei/shared';

jest.mock('@dei/shared', () => ({
  analytics: { capture: jest.fn() },
}));

const captureMock = analytics.capture as jest.Mock;

beforeEach(() => {
  captureMock.mockClear();
});

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

  describe('message_send_attempted 계측 (NSM funnel)', () => {
    it('전송 tap → conversation_id + trim 길이로 capture', () => {
      render(<ChatComposer conversationId="c1" onSend={jest.fn()} />);
      fireEvent.changeText(screen.getByTestId('chat-composer-input'), '  hello  ');
      fireEvent.press(screen.getByTestId('chat-composer-send'));
      expect(captureMock).toHaveBeenCalledTimes(1);
      expect(captureMock).toHaveBeenCalledWith('message_send_attempted', {
        conversation_id: 'c1',
        length: 5,
      });
    });

    it('전송 불가(빈/초과/disabled)면 capture 하지 않음', () => {
      const { rerender } = render(<ChatComposer conversationId="c1" onSend={jest.fn()} />);
      // 빈 입력
      fireEvent.press(screen.getByTestId('chat-composer-send'));
      // 501자 초과
      fireEvent.changeText(screen.getByTestId('chat-composer-input'), 'x'.repeat(501));
      fireEvent.press(screen.getByTestId('chat-composer-send'));
      // disabled
      rerender(<ChatComposer conversationId="c1" disabled onSend={jest.fn()} />);
      fireEvent.changeText(screen.getByTestId('chat-composer-input'), 'hi');
      fireEvent.press(screen.getByTestId('chat-composer-send'));
      expect(captureMock).not.toHaveBeenCalled();
    });

    it('conversationId 미지정이면 conversation_id 는 undefined', () => {
      render(<ChatComposer onSend={jest.fn()} />);
      fireEvent.changeText(screen.getByTestId('chat-composer-input'), 'hi');
      fireEvent.press(screen.getByTestId('chat-composer-send'));
      expect(captureMock).toHaveBeenCalledWith('message_send_attempted', {
        conversation_id: undefined,
        length: 2,
      });
    });
  });
});
