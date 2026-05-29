import { View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Checkbox } from '../Checkbox';

/**
 * Checkbox (P9) — 렌더 + variant(round/square/master) + checked/optional
 * 토큰 className 검증. SSOT: all-screens `.s02 .check` / `.check-all`.
 *
 * box className 은 Pressable 의 자식 View 에 있다. 글리프 유무로 children
 * 구조가 달라지므로 box View 는 전용 `${testID}-box` 로 안정적으로 조회한다.
 */
const boxClass = (testID: string) =>
  screen.getByTestId(`${testID}-box`).props.className as string;

describe('Checkbox (P9)', () => {
  it('renders with checkbox role', () => {
    render(<Checkbox testID="cb" />);
    expect(screen.getByRole('checkbox')).toBeTruthy();
  });

  it('round off: r-full + 1.5px ink border, no glyph', () => {
    render(<Checkbox testID="cb" variant="round" />);
    const cls = boxClass('cb');
    expect(cls).toContain('rounded-full');
    expect(cls).toContain('border-[1.5px]');
    expect(cls).toContain('border-ink');
    expect(cls).toContain('h-[22px]');
    expect(cls).toContain('w-[22px]');
    expect(screen.queryByText('✓')).toBeNull();
  });

  it('round checked: shows ✓ glyph in ink', () => {
    render(<Checkbox testID="cb" variant="round" checked />);
    expect(screen.getByText('✓')).toBeTruthy();
    expect(screen.getByText('✓').props.className as string).toContain('text-ink');
  });

  it('optional off → ink-4 tone (border + glyph dimmed)', () => {
    render(<Checkbox testID="cb" optional />);
    expect(boxClass('cb')).toContain('border-ink-4');
  });

  it('optional + checked → ink tone restored (.check.opt.on)', () => {
    render(<Checkbox testID="cb" optional checked />);
    const cls = boxClass('cb');
    expect(cls).toContain('border-ink');
    expect(cls).not.toContain('border-ink-4');
    expect(screen.getByText('✓').props.className as string).toContain('text-ink');
  });

  it('master: bg-ink fill, r-full, 24px, always-on white ✓', () => {
    render(<Checkbox testID="cb" variant="master" />);
    const cls = boxClass('cb');
    expect(cls).toContain('bg-ink');
    expect(cls).toContain('rounded-full');
    expect(cls).toContain('h-6');
    expect(cls).toContain('w-6');
    expect(cls).not.toContain('border-');
    // master 는 checked 미지정이어도 ✓ 상시 노출(헤더 채워진 표현).
    expect(screen.getByText('✓').props.className as string).toContain('text-bg');
  });

  it('square: rounded-sm corners (matrix P9 r3)', () => {
    render(<Checkbox testID="cb" variant="square" checked />);
    const cls = boxClass('cb');
    expect(cls).toContain('rounded-sm');
    expect(cls).not.toContain('rounded-full');
  });

  it('reflects checked in accessibilityState', () => {
    render(<Checkbox testID="cb" checked />);
    expect(screen.getByTestId('cb').props.accessibilityState.checked).toBe(true);
  });

  it('master accessibilityState.checked is always true', () => {
    render(<Checkbox testID="cb" variant="master" />);
    expect(screen.getByTestId('cb').props.accessibilityState.checked).toBe(true);
  });

  it('fires onPress when pressed', () => {
    const onPress = jest.fn();
    render(<Checkbox testID="cb" onPress={onPress} />);
    fireEvent.press(screen.getByTestId('cb'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('merges caller className onto the box', () => {
    render(<Checkbox testID="cb" className="mt-4" />);
    expect(boxClass('cb')).toContain('mt-4');
  });

  it('forwards ref to the Pressable', () => {
    const ref = { current: null as View | null };
    render(<Checkbox ref={ref} testID="cb" />);
    expect(ref.current).not.toBeNull();
  });
});
