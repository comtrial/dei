import { fireEvent, render, screen } from '@testing-library/react-native';
import type { View } from 'react-native';

import { InputBar } from '../InputBar';

describe('InputBar (X9)', () => {
  it('renders input and send button', () => {
    render(<InputBar />);
    expect(screen.getByTestId('input-bar-input')).toBeTruthy();
    expect(screen.getByLabelText('전송')).toBeTruthy();
  });

  it('controlled value renders and onChange fires on text input', () => {
    const onChange = jest.fn();
    render(<InputBar value="안녕" onChange={onChange} />);
    const input = screen.getByTestId('input-bar-input');
    expect(input.props.value).toBe('안녕');
    fireEvent.changeText(input, '안녕하세요');
    expect(onChange).toHaveBeenCalledWith('안녕하세요');
  });

  it('onSend fires on send button press', () => {
    const onSend = jest.fn();
    render(<InputBar onSend={onSend} />);
    fireEvent.press(screen.getByLabelText('전송'));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('sendDisabled blocks press and dims the button (opacity-40)', () => {
    const onSend = jest.fn();
    render(<InputBar onSend={onSend} sendDisabled />);
    const send = screen.getByLabelText('전송');
    expect((send.props.className as string) ?? '').toContain('opacity-40');
    expect(send.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(send);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('send button is an accent circle (bg-accent overrides glass bg-glass-dark)', () => {
    render(<InputBar />);
    const cls = (screen.getByLabelText('전송').props.className as string) ?? '';
    // .send: 32×32 accent 원형. glass 기본 배경은 accent 로 덮였다(twMerge last-wins).
    expect(cls).toContain('bg-accent');
    expect(cls).not.toContain('bg-glass-dark');
    expect(cls).toContain('w-[32px]');
  });

  it('input is a pill (rounded-full / text-15) keeping bg-2 surface when single-line', () => {
    render(<InputBar />);
    const cls = (screen.getByTestId('input-bar-input').props.className as string) ?? '';
    // S13a .input-bar input: 한 줄일 땐 pill 모양 + 카톡 수준 15px, bg-2 표면 유지.
    expect(cls).toContain('rounded-full');
    expect(cls).toContain('text-[15px]');
    expect(cls).toContain('bg-bg-2');
    // Input base 의 rounded-md 는 pill 로 덮였다.
    expect(cls).not.toContain('rounded-md');
  });

  it('input is multiline with an auto-grow height style (clamped)', () => {
    render(<InputBar />);
    const input = screen.getByTestId('input-bar-input');
    expect(input.props.multiline).toBe(true);
    // 초기 높이는 최소 경계(40)로 clamp.
    const style = Array.isArray(input.props.style) ? Object.assign({}, ...input.props.style) : input.props.style;
    expect(style?.height).toBe(40);
  });

  it('charcount renders "N / max" meta when provided, omitted otherwise', () => {
    const { rerender } = render(<InputBar />);
    expect(screen.queryByTestId('input-bar-charcount')).toBeNull();

    rerender(<InputBar charcount={{ count: 12, max: 200 }} />);
    expect(screen.getByText('12 / 200')).toBeTruthy();
  });

  it('forwards ref to the bar container', () => {
    const ref = { current: null as View | null };
    render(<InputBar ref={ref} testID="bar" />);
    expect(screen.getByTestId('bar')).toBeTruthy();
    expect(ref.current).not.toBeNull();
  });

  it('whisper mode: renders removable target chip header and accent placeholder', () => {
    render(
      <InputBar whisperTarget={{ name: '수아', avatarInitial: '수' }} onClearWhisper={jest.fn()} />,
    );
    expect(screen.getByTestId('input-bar-whisper-chip')).toBeTruthy();
    expect(screen.getByText('수아')).toBeTruthy();
    const input = screen.getByTestId('input-bar-input');
    expect(input.props.placeholder).toBe('수아에게만 보이는 귓속말…');
  });

  it('whisper mode: onClearWhisper fires when chip × pressed', () => {
    const onClearWhisper = jest.fn();
    render(<InputBar whisperTarget={{ name: '수아' }} onClearWhisper={onClearWhisper} />);
    fireEvent.press(screen.getByTestId('input-bar-whisper-clear'));
    expect(onClearWhisper).toHaveBeenCalledTimes(1);
  });

  it('whisperTarget=null keeps default placeholder (regression)', () => {
    render(<InputBar />);
    const input = screen.getByTestId('input-bar-input');
    expect(input.props.placeholder).toBe('메시지 입력 (@로 귓속말)');
    expect(screen.queryByTestId('input-bar-whisper-chip')).toBeNull();
  });
});
