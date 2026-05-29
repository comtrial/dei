import { X } from 'lucide-react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { View } from 'react-native';

import { IconButton } from '../IconButton';

describe('IconButton (P15)', () => {
  it('renders with button accessibility role and label', () => {
    render(<IconButton testID="ib" glyph={X} accessibilityLabel="닫기" />);
    const node = screen.getByTestId('ib');
    expect(node).toBeTruthy();
    expect(node.props.accessibilityRole).toBe('button');
    expect(screen.getByLabelText('닫기')).toBeTruthy();
  });

  it('ghost (default) is transparent at 32px box', () => {
    render(<IconButton testID="ib" glyph={X} />);
    const className = screen.getByTestId('ib').props.className as string;
    expect(className).toContain('bg-transparent');
    expect(className).toContain('w-[32px]');
    expect(className).toContain('h-[32px]');
    // ghost 는 채워진 원이 아니다.
    expect(className).not.toContain('bg-bg-2');
    expect(className).not.toContain('rounded-full');
  });

  it('filled-circle uses bg-2 circle (S03/S07a .x)', () => {
    render(<IconButton testID="ib" glyph={X} variant="filled-circle" size={36} />);
    const className = screen.getByTestId('ib').props.className as string;
    expect(className).toContain('bg-bg-2');
    expect(className).toContain('rounded-full');
    expect(className).toContain('w-[36px]');
    expect(className).toContain('h-[36px]');
  });

  it('glass uses glass-dark circle (S11/S11b video overlay)', () => {
    render(<IconButton testID="ib" glyph={X} variant="glass" size={36} />);
    const className = screen.getByTestId('ib').props.className as string;
    expect(className).toContain('bg-glass-dark');
    expect(className).toContain('rounded-full');
  });

  it('merges caller className (last wins via cn)', () => {
    render(<IconButton testID="ib" glyph={X} className="bg-accent" />);
    const className = screen.getByTestId('ib').props.className as string;
    // tailwind-merge: 충돌하는 배경은 caller 가 승리(bg-transparent → bg-accent).
    expect(className).toContain('bg-accent');
    expect(className).not.toContain('bg-transparent');
  });

  it('fires onPress', () => {
    const onPress = jest.fn();
    render(<IconButton testID="ib" glyph={X} onPress={onPress} accessibilityLabel="닫기" />);
    fireEvent.press(screen.getByTestId('ib'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('forwards ref to the underlying pressable', () => {
    const ref = { current: null as View | null };
    render(<IconButton ref={ref} testID="ib" glyph={X} />);
    expect(ref.current).not.toBeNull();
  });
});
