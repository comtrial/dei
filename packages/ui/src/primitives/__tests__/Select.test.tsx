import { fireEvent, render, screen } from '@testing-library/react-native';

import { Select } from '../Select';

/**
 * Select (P4) — 렌더 + placeholder/value/locked variant + 토큰 className 검증.
 * SSOT: HTML `.s04 .field .select` (bg-2 / r-md / ink·ink-4, chevron ink-4).
 */
describe('Select', () => {
  it('renders placeholder in ink-4 when no value is selected', () => {
    render(<Select placeholder="선택해주세요" />);
    const label = screen.getByText('선택해주세요');
    expect(label.props.className).toContain('text-ink-4');
  });

  it('renders the selected value in ink (not placeholder color)', () => {
    render(<Select value="여성" placeholder="선택해주세요" />);
    const label = screen.getByText('여성');
    const cls = label.props.className as string;
    expect(cls).toContain('text-ink');
    expect(cls).not.toContain('text-ink-4');
  });

  it('applies bg-2 + rounded-md + 14px padding to the trigger (HTML .select)', () => {
    render(<Select placeholder="선택" testID="sel" />);
    const cls = screen.getByTestId('sel').props.className as string;
    expect(cls).toContain('bg-bg-2');
    expect(cls).toContain('rounded-md');
    expect(cls).toContain('p-[14px]');
    expect(cls).toContain('flex-row');
    expect(cls).toContain('justify-between');
  });

  it('locked variant uses bg-3 surface + ink-3 text and disables press', () => {
    const onPress = jest.fn();
    render(<Select value="여성" locked onPress={onPress} testID="locked" />);
    const trigger = screen.getByTestId('locked');
    expect(trigger.props.className).toContain('bg-bg-3');
    expect(screen.getByText('여성').props.className).toContain('text-ink-3');

    fireEvent.press(trigger);
    expect(onPress).not.toHaveBeenCalled();
    expect(trigger.props.accessibilityState.disabled).toBe(true);
  });

  it('exposes button role and fires onPress when interactive', () => {
    const onPress = jest.fn();
    render(<Select value="강남구" onPress={onPress} />);
    const trigger = screen.getByRole('button');
    fireEvent.press(trigger);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('merges caller className onto the trigger', () => {
    render(<Select placeholder="선택" className="mb-[18px]" testID="merge" />);
    expect(screen.getByTestId('merge').props.className).toContain('mb-[18px]');
  });
});
