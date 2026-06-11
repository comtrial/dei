import { useRef } from 'react';
import { TextInput } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { Input } from '../Input';

describe('Input (P2)', () => {
  it('renders a single-line TextInput with bg-2 / ink / r-md tokens (HTML .field input)', () => {
    render(<Input testID="in" placeholder="닉네임" />);
    const input = screen.getByTestId('in');
    expect(input).toBeTruthy();
    expect(input.props.multiline).toBeFalsy();
    const className = input.props.className as string;
    expect(className).toContain('bg-bg-2');
    expect(className).toContain('text-ink');
    expect(className).toContain('rounded-md');
  });

  it('is editable by default', () => {
    render(<Input testID="in" />);
    expect(screen.getByTestId('in').props.editable).toBe(true);
  });

  it('locked state uses bg-3 / ink-3 and is not editable (HTML .field.locked input)', () => {
    render(<Input testID="in" state="locked" value="2001년 04월 18일" />);
    const input = screen.getByTestId('in');
    const className = input.props.className as string;
    expect(className).toContain('bg-bg-3');
    expect(className).toContain('text-ink-3');
    // tailwind-merge: bg-3 wins over base bg-2
    expect(className).not.toContain('bg-bg-2');
    expect(input.props.editable).toBe(false);
  });

  it('error state applies border-danger (matrix P2 "error=border-danger")', () => {
    render(<Input testID="in" state="error" />);
    const className = screen.getByTestId('in').props.className as string;
    expect(className).toContain('border-danger');
  });

  it('focus state applies an accent border', () => {
    render(<Input testID="in" state="focus" />);
    const className = screen.getByTestId('in').props.className as string;
    expect(className).toContain('border-accent');
  });

  it('readonly blocks editing without applying the locked surface (S23 분류)', () => {
    render(<Input testID="in" readonly value="결제·환불" />);
    const input = screen.getByTestId('in');
    expect(input.props.editable).toBe(false);
    const className = input.props.className as string;
    // readonly keeps default bg-2 (not bg-3)
    expect(className).toContain('bg-bg-2');
    expect(className).not.toContain('bg-bg-3');
  });

  it('prefixIcon adds left padding for the search glyph (S06 search)', () => {
    render(<Input testID="in" prefixIcon placeholder="닉네임으로 검색" />);
    const className = screen.getByTestId('in').props.className as string;
    expect(className).toContain('pl-[40px]');
  });

  it('renders label and labelAccessory slots (HTML .field .lbl / .lock)', () => {
    render(
      <Input testID="in" label="닉네임" labelAccessory="2 / 10" />,
    );
    expect(screen.getByText('닉네임')).toBeTruthy();
    const accessory = screen.getByText('2 / 10');
    expect(accessory.props.className).toContain('text-ink-4');
  });

  it('renders helper slot with ink-3 / 11.5px (HTML .field .helper)', () => {
    render(<Input testID="in" helper="✓ 사용 가능해요" />);
    const helper = screen.getByText('✓ 사용 가능해요');
    const className = helper.props.className as string;
    expect(className).toContain('text-ink-3');
    expect(className).toContain('text-[13.5px]');
  });

  it('merges caller helperClassName (e.g. success color, last wins)', () => {
    render(
      <Input testID="in" helper="ok" helperClassName="text-success" />,
    );
    const className = screen.getByText('ok').props.className as string;
    expect(className).toContain('text-success');
    expect(className).not.toContain('text-ink-3');
  });

  it('merges caller inputClassName (last wins via cn)', () => {
    // S23 input is 13px/14px padding — caller can override base size.
    render(<Input testID="in" inputClassName="text-[16px]" />);
    const className = screen.getByTestId('in').props.className as string;
    expect(className).toContain('text-[16px]');
    expect(className).not.toContain('text-[17px]');
  });

  it('forwards ref to the underlying TextInput', () => {
    let received: TextInput | null = null;
    function Harness() {
      const ref = useRef<TextInput>(null);
      return (
        <Input
          testID="in"
          ref={(node) => {
            (ref as { current: TextInput | null }).current = node;
            received = node;
          }}
        />
      );
    }
    render(<Harness />);
    expect(received).not.toBeNull();
  });
});
