import { fireEvent, render, screen } from '@testing-library/react-native';
import { View, type View as RNView } from 'react-native';

import { TopNav } from '../TopNav';

describe('TopNav (X1)', () => {
  it('renders title and the default back control (paper surface, bottom line)', () => {
    render(<TopNav testID="nav" title="멤버 초대" />);
    expect(screen.getByText('멤버 초대')).toBeTruthy();
    // 기본 left=back → '뒤로' 라벨 IconButton.
    expect(screen.getByLabelText('뒤로')).toBeTruthy();
    // surface 토큰: bg-paper + border-b border-line (매트릭스 X1 지정).
    const bar = screen.getByTestId('nav');
    const cls = (bar.props.className as string) ?? '';
    expect(cls).toContain('bg-paper');
    expect(cls).toContain('border-b');
    expect(cls).toContain('border-line');
  });

  it('left="close" renders close (X) control with 닫기 label', () => {
    render(<TopNav left="close" title="인증" />);
    expect(screen.getByLabelText('닫기')).toBeTruthy();
    expect(screen.queryByLabelText('뒤로')).toBeNull();
  });

  it('left="none" renders no left control', () => {
    render(<TopNav left="none" title="제목만" />);
    expect(screen.queryByLabelText('뒤로')).toBeNull();
    expect(screen.queryByLabelText('닫기')).toBeNull();
    expect(screen.getByText('제목만')).toBeTruthy();
  });

  it('fires onLeftPress when the left control is tapped', () => {
    const onLeftPress = jest.fn();
    render(<TopNav left="back" onLeftPress={onLeftPress} />);
    fireEvent.press(screen.getByLabelText('뒤로'));
    expect(onLeftPress).toHaveBeenCalledTimes(1);
  });

  it('renders rightActions slot nodes', () => {
    render(
      <TopNav
        title="멤버 초대"
        rightActions={<View testID="count-pill" />}
      />,
    );
    expect(screen.getByTestId('count-pill')).toBeTruthy();
  });

  it('leftSlot overrides the default back|close IconButton', () => {
    render(
      <TopNav left="back" leftSlot={<View testID="hero-left" />} title="도현" />,
    );
    expect(screen.getByTestId('hero-left')).toBeTruthy();
    // 커스텀 slot 이 기본 back IconButton 을 대체.
    expect(screen.queryByLabelText('뒤로')).toBeNull();
  });

  it('has header accessibility role and forwards ref', () => {
    const ref = { current: null as RNView | null };
    render(<TopNav ref={ref} testID="nav" title="제목" />);
    expect(screen.getByTestId('nav').props.accessibilityRole).toBe('header');
    expect(ref.current).not.toBeNull();
  });
});
