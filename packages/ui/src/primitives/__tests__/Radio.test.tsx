import { fireEvent, render, screen } from '@testing-library/react-native';

import { Radio } from '../Radio';

/**
 * Radio (P10) — 렌더 + tone(ink/accent/danger) + selected inset-fill
 * 토큰 className 검증. SSOT: all-screens `.rd` / `.sel .rd`.
 *
 * dot className 은 Pressable 의 자식 View 에 있다(Checkbox 패턴과 동일하게
 * testID 는 Pressable, dot 은 children 으로 접근).
 *
 * RNTL/jest-expo 에서 Pressable 의 children 은 배열로 노출된다
 * (`[0]` = 우리가 그린 dot View, `[1]` = Pressable 내부 요소). dot 은 항상 `[0]`.
 */
const dot = (testID: string) => screen.getByTestId(testID).props.children[0];
const dotClass = (testID: string) => dot(testID).props.className as string;

describe('Radio (P10)', () => {
  it('renders with radio role', () => {
    render(<Radio testID="rd" />);
    expect(screen.getByRole('radio')).toBeTruthy();
  });

  it('empty: 18px r-full + 1.5px ink-4 border, no inset fill', () => {
    render(<Radio testID="rd" />);
    const cls = dotClass('rd');
    expect(cls).toContain('h-[18px]');
    expect(cls).toContain('w-[18px]');
    expect(cls).toContain('rounded-full');
    expect(cls).toContain('border-[1.5px]');
    expect(cls).toContain('border-ink-4');
    // empty 일 때 dot 의 자식(inset 원) 없음.
    expect(dot('rd').props.children).toBeNull();
  });

  it('selected ink (default tone): ink fill+border + inset white ring', () => {
    render(<Radio testID="rd" selected />);
    const cls = dotClass('rd');
    expect(cls).toContain('bg-ink');
    expect(cls).toContain('border-ink');
    expect(cls).not.toContain('border-ink-4');
    // inset-fill 내부 원 — white(bg-paper) 3px 안쪽.
    const inner = dot('rd').props.children;
    expect(inner.props.className).toContain('inset-[3px]');
    expect(inner.props.className).toContain('bg-paper');
    expect(inner.props.className).toContain('rounded-full');
  });

  it('selected accent: accent fill+border (S21/S17)', () => {
    render(<Radio testID="rd" selected tone="accent" />);
    const cls = dotClass('rd');
    expect(cls).toContain('bg-accent');
    expect(cls).toContain('border-accent');
  });

  it('selected danger: danger fill+border (S20)', () => {
    render(<Radio testID="rd" selected tone="danger" />);
    const cls = dotClass('rd');
    expect(cls).toContain('bg-danger');
    expect(cls).toContain('border-danger');
  });

  it('accessibilityState reflects selected', () => {
    render(<Radio testID="rd" selected />);
    expect(screen.getByRole('radio').props.accessibilityState.selected).toBe(true);
  });

  it('fires onPress', () => {
    const onPress = jest.fn();
    render(<Radio testID="rd" onPress={onPress} />);
    fireEvent.press(screen.getByTestId('rd'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('merges custom className onto dot', () => {
    render(<Radio testID="rd" className="mt-2" />);
    expect(dotClass('rd')).toContain('mt-2');
  });
});
