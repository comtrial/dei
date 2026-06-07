import { fireEvent, render, screen } from '@testing-library/react-native';

import { SlideToConfirm } from '../SlideToConfirm';

/**
 * SlideToConfirm (P18) — 렌더 + tone(danger/ink) 토큰 className +
 * drag 확정 경로 검증. SSOT: all-screens `.s20 .slide`(S20) /
 * `.sLR .slide`(S16).
 *
 * thumb/label/arrows 는 testID 접미사(`-thumb`/`-label`/`-arrows`)로 접근.
 */
const cls = (testID: string) => screen.getByTestId(testID).props.className as string;

describe('SlideToConfirm (P18)', () => {
  it('renders with button role', () => {
    render(<SlideToConfirm testID="stc" />);
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('container: r-full + 54px + overflow-hidden + 6px padding', () => {
    render(<SlideToConfirm testID="stc" />);
    const c = cls('stc');
    expect(c).toContain('rounded-full');
    expect(c).toContain('h-[54px]');
    expect(c).toContain('overflow-hidden');
    expect(c).toContain('p-[6px]');
  });

  it('danger tone (default, S20): danger-soft track + danger label, no arrows', () => {
    render(<SlideToConfirm testID="stc" />);
    expect(cls('stc')).toContain('bg-danger-soft');
    expect(cls('stc-label')).toContain('text-danger');
    expect(screen.getByText('밀어서 탈퇴하기')).toBeTruthy();
    // S20 markup 엔 arrows 없음.
    expect(screen.queryByTestId('stc-arrows')).toBeNull();
  });

  it('ink tone (S16): bg-2 track + ink-3 label + ink-4 arrows', () => {
    render(<SlideToConfirm testID="stc" tone="ink" />);
    expect(cls('stc')).toContain('bg-bg-2');
    expect(cls('stc-label')).toContain('text-ink-3');
    expect(screen.getByText('밀어서 방 나가기')).toBeTruthy();
    expect(cls('stc-arrows')).toContain('text-ink-4');
    expect(screen.getByText('›››')).toBeTruthy();
  });

  it('thumb: 42x42 danger circle + white → glyph (both tones)', () => {
    render(<SlideToConfirm testID="stc" tone="ink" />);
    const thumb = cls('stc-thumb');
    expect(thumb).toContain('h-[42px]');
    expect(thumb).toContain('w-[42px]');
    expect(thumb).toContain('rounded-full');
    expect(thumb).toContain('bg-danger');
    expect(screen.getByText('→')).toBeTruthy();
  });

  it('custom label overrides tone default', () => {
    render(<SlideToConfirm testID="stc" label="밀어서 차단하기" />);
    expect(screen.getByText('밀어서 차단하기')).toBeTruthy();
  });

  it('showArrows prop forces arrows on danger / hides on ink', () => {
    const { rerender } = render(<SlideToConfirm testID="stc" showArrows />);
    expect(screen.getByTestId('stc-arrows')).toBeTruthy();
    rerender(<SlideToConfirm testID="stc" tone="ink" showArrows={false} />);
    expect(screen.queryByTestId('stc-arrows')).toBeNull();
  });

  it('fires onConfirm on long-press (fallback 확정 경로)', () => {
    const onConfirm = jest.fn();
    render(<SlideToConfirm testID="stc" onConfirm={onConfirm} />);
    fireEvent(screen.getByTestId('stc'), 'longPress');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not fire onConfirm on press', () => {
    const onConfirm = jest.fn();
    render(<SlideToConfirm testID="stc" onConfirm={onConfirm} />);
    fireEvent.press(screen.getByTestId('stc'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('fires onConfirm when the thumb is dragged past the threshold', () => {
    const onConfirm = jest.fn();
    render(<SlideToConfirm testID="stc" onConfirm={onConfirm} />);
    const thumb = screen.getByTestId('stc-thumb');

    fireEvent(thumb, 'responderGrant', { nativeEvent: { pageX: 0 } });
    fireEvent(thumb, 'responderMove', { nativeEvent: { pageX: 260 } });
    fireEvent(thumb, 'responderRelease', { nativeEvent: { pageX: 260 } });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('resets without confirming when the thumb is released before the threshold', () => {
    const onConfirm = jest.fn();
    render(<SlideToConfirm testID="stc" onConfirm={onConfirm} />);
    const thumb = screen.getByTestId('stc-thumb');

    fireEvent(thumb, 'responderGrant', { nativeEvent: { pageX: 0 } });
    fireEvent(thumb, 'responderMove', { nativeEvent: { pageX: 20 } });
    fireEvent(thumb, 'responderRelease', { nativeEvent: { pageX: 20 } });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not fire onConfirm on press when disabled', () => {
    const onConfirm = jest.fn();
    render(<SlideToConfirm testID="stc" onConfirm={onConfirm} disabled />);
    fireEvent.press(screen.getByTestId('stc'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('merges custom className onto container', () => {
    render(<SlideToConfirm testID="stc" className="mt-3" />);
    expect(cls('stc')).toContain('mt-3');
  });
});
