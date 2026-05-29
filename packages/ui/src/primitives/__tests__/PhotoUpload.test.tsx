import { fireEvent, render, screen } from '@testing-library/react-native';
import type { View } from 'react-native';

import { PhotoUpload } from '../PhotoUpload';

describe('PhotoUpload (P16)', () => {
  it('empty state shows dashed ink-4 border on bg-2 with plus + label', () => {
    render(<PhotoUpload testID="pu" />);
    const node = screen.getByTestId('pu');
    const className = node.props.className as string;
    expect(className).toContain('bg-bg-2');
    expect(className).toContain('border-dashed');
    expect(className).toContain('border-ink-4');
    expect(className).toContain('rounded-md');
    // 기본 글리프 + 안내 라벨 노출
    expect(screen.getByText('📷')).toBeTruthy();
    expect(screen.getByText('지금 촬영')).toBeTruthy();
  });

  it('filled state uses solid ink border and hides the empty guidance', () => {
    render(<PhotoUpload testID="pu" state="filled" />);
    const className = screen.getByTestId('pu').props.className as string;
    expect(className).toContain('border-solid');
    expect(className).toContain('border-ink');
    expect(className).not.toContain('border-dashed');
    expect(screen.queryByText('📷')).toBeNull();
    expect(screen.queryByText('지금 촬영')).toBeNull();
  });

  it('imageUri implies filled and renders the change pill by default', () => {
    render(<PhotoUpload testID="pu" imageUri="https://x.test/a.jpg" />);
    const className = screen.getByTestId('pu').props.className as string;
    expect(className).toContain('border-solid');
    expect(screen.getByText('변경')).toBeTruthy();
  });

  it('changePill can be suppressed on a filled frame', () => {
    render(<PhotoUpload testID="pu" state="filled" changePill={false} />);
    expect(screen.queryByText('변경')).toBeNull();
  });

  it('merges caller className (last wins via cn)', () => {
    render(<PhotoUpload testID="pu" className="rounded-lg" />);
    const className = screen.getByTestId('pu').props.className as string;
    // tailwind-merge: 충돌 radius 는 caller 가 승리(rounded-md → rounded-lg).
    expect(className).toContain('rounded-lg');
    expect(className).not.toContain('rounded-md');
  });

  it('fires onPress', () => {
    const onPress = jest.fn();
    render(<PhotoUpload testID="pu" onPress={onPress} accessibilityLabel="사진 올리기" />);
    fireEvent.press(screen.getByTestId('pu'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('forwards ref to the underlying pressable', () => {
    const ref = { current: null as View | null };
    render(<PhotoUpload ref={ref} testID="pu" />);
    expect(ref.current).not.toBeNull();
  });
});
