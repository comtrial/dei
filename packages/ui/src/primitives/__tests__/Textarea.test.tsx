import { useRef } from 'react';
import { TextInput } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Textarea } from '../Textarea';

describe('Textarea (P3)', () => {
  it('renders a multiline TextInput', () => {
    render(<Textarea testID="ta" placeholder="자유롭게 적어주세요" />);
    const input = screen.getByTestId('ta');
    expect(input).toBeTruthy();
    expect(input.props.multiline).toBe(true);
  });

  it('applies bg-2 / ink / r-md / min-height tokens (HTML .field textarea)', () => {
    render(<Textarea testID="ta" />);
    const className = screen.getByTestId('ta').props.className as string;
    expect(className).toContain('bg-bg-2');
    expect(className).toContain('text-ink');
    expect(className).toContain('rounded-md');
    expect(className).toContain('min-h-[80px]');
  });

  it('hides the char count by default', () => {
    render(<Textarea testID="ta" maxLength={60} />);
    expect(screen.queryByText(/\/ 60/)).toBeNull();
  });

  it('shows "N / maxLength" count at bottom-right when showCount (S04b)', () => {
    render(<Textarea testID="ta" showCount maxLength={60} defaultValue="hi" />);
    const count = screen.getByText('2 / 60');
    // charcount = 10.5px, ink-4, 우측 정렬 (HTML .charcount)
    const className = count.props.className as string;
    expect(className).toContain('text-ink-4');
    expect(className).toContain('text-right');
    expect(className).toContain('text-[12.5px]');
  });

  it('updates the count as the user types (uncontrolled)', () => {
    render(<Textarea testID="ta" showCount maxLength={500} />);
    expect(screen.getByText('0 / 500')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('ta'), 'hello');
    expect(screen.getByText('5 / 500')).toBeTruthy();
  });

  it('passes maxLength through to the native input', () => {
    render(<Textarea testID="ta" maxLength={60} />);
    expect(screen.getByTestId('ta').props.maxLength).toBe(60);
  });

  it('reflects controlled value length in the count', () => {
    render(<Textarea testID="ta" showCount maxLength={500} value="abcd" />);
    expect(screen.getByText('4 / 500')).toBeTruthy();
  });

  it('merges caller inputClassName (last wins via cn)', () => {
    render(<Textarea testID="ta" inputClassName="min-h-[130px]" />);
    const className = screen.getByTestId('ta').props.className as string;
    // S23 는 min-height 130px — tailwind-merge 로 caller 가 승리.
    expect(className).toContain('min-h-[130px]');
    expect(className).not.toContain('min-h-[80px]');
  });

  it('forwards ref to the underlying TextInput', () => {
    function Harness() {
      const ref = useRef<TextInput>(null);
      return (
        <Textarea
          testID="ta"
          ref={(node) => {
            (ref as { current: TextInput | null }).current = node;
            received = node;
          }}
        />
      );
    }
    let received: TextInput | null = null;
    render(<Harness />);
    expect(received).not.toBeNull();
  });
});
