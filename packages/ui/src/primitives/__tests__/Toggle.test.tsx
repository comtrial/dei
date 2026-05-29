import { fireEvent, render, screen } from '@testing-library/react-native';

import { Toggle } from '../Toggle';

/**
 * Toggle (P11) — 렌더 + on/off track 색(accent/ink-4) + thumb 좌/우 정렬 +
 * onValueChange 검증. SSOT: all-screens `.s22 .toggle` / `.off`.
 *
 * track/thumb 은 각자 `${testID}-track` / `${testID}-thumb` 로 노출된다
 * (Checkbox 패턴과 동일: 자식 View 에 파생 testID 부여해 직접 조회).
 */
const trackClass = (testID: string) =>
  screen.getByTestId(`${testID}-track`).props.className as string;
const thumbClass = (testID: string) =>
  screen.getByTestId(`${testID}-thumb`).props.className as string;

describe('Toggle (P11)', () => {
  it('renders with switch role', () => {
    render(<Toggle testID="tg" />);
    expect(screen.getByRole('switch')).toBeTruthy();
  });

  it('off (default): 44x26 r-full ink-4 track, thumb on left', () => {
    render(<Toggle testID="tg" />);
    const track = trackClass('tg');
    expect(track).toContain('h-[26px]');
    expect(track).toContain('w-[44px]');
    expect(track).toContain('rounded-full');
    expect(track).toContain('bg-ink-4');
    expect(track).not.toContain('bg-accent');
    // thumb: 20x20 white, 왼쪽 정렬.
    const thumb = thumbClass('tg');
    expect(thumb).toContain('h-[20px]');
    expect(thumb).toContain('bg-white');
    expect(thumb).toContain('left-[3px]');
    expect(thumb).not.toContain('right-[3px]');
  });

  it('on (value): accent track, thumb on right', () => {
    render(<Toggle testID="tg" value />);
    const track = trackClass('tg');
    expect(track).toContain('bg-accent');
    expect(track).not.toContain('bg-ink-4');
    const thumb = thumbClass('tg');
    expect(thumb).toContain('right-[3px]');
    expect(thumb).not.toContain('left-[3px]');
  });

  it('accessibilityState.checked reflects value', () => {
    render(<Toggle testID="tg" value />);
    expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(true);
  });

  it('fires onValueChange with the next state', () => {
    const onValueChange = jest.fn();
    render(<Toggle testID="tg" value={false} onValueChange={onValueChange} />);
    fireEvent.press(screen.getByTestId('tg'));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('merges custom className onto track', () => {
    render(<Toggle testID="tg" className="mt-2" />);
    expect(trackClass('tg')).toContain('mt-2');
  });
});
