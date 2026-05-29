import { render, screen } from '@testing-library/react-native';

import { Spinner } from '../Spinner';

/**
 * Spinner (P13) — 렌더 + size/variant + 토큰 className 검증.
 * reanimated 는 jest preset 의 mock(react-native-reanimated/mock)로 동작한다.
 */
describe('Spinner', () => {
  it('renders with progressbar role and default a11y label', () => {
    render(<Spinner testID="default-spinner" />);
    // accessibilityRole="progressbar" 는 런타임(VoiceOver/TalkBack)에서 동작하지만,
    // RNTL 의 getByRole('progressbar') 는 host 에 accessible 플래그가 없으면 매핑하지
    // 못한다. 역할은 prop 으로, 가용성은 라벨 쿼리로 검증한다.
    expect(screen.getByTestId('default-spinner').props.accessibilityRole).toBe('progressbar');
    expect(screen.getByLabelText('로딩 중')).toBeTruthy();
  });

  it('applies track(bg-2) + accent head + rounded-full tokens to the ring', () => {
    render(<Spinner testID="spinner-36" />);
    const ring = screen.getByTestId('spinner-36').props.children.props;
    const cls = ring.className as string;
    expect(cls).toContain('border-bg-2');
    expect(cls).toContain('border-t-accent');
    expect(cls).toContain('rounded-full');
  });

  it('size 36 → 36px ring + 3px border (HTML .s01 .pulse)', () => {
    render(<Spinner size={36} testID="s36" />);
    const cls = screen.getByTestId('s36').props.children.props.className as string;
    expect(cls).toContain('h-[36px]');
    expect(cls).toContain('w-[36px]');
    expect(cls).toContain('border-[3px]');
  });

  it('size 80 → 80px ring + 5px border (HTML .s03 .progress-ring)', () => {
    render(<Spinner size={80} testID="s80" />);
    const cls = screen.getByTestId('s80').props.children.props.className as string;
    expect(cls).toContain('h-[80px]');
    expect(cls).toContain('w-[80px]');
    expect(cls).toContain('border-[5px]');
  });

  it('overlay variant fills + centers over a translucent bg', () => {
    render(<Spinner variant="overlay" testID="overlay" />);
    const cls = screen.getByTestId('overlay').props.className as string;
    expect(cls).toContain('absolute');
    expect(cls).toContain('inset-0');
    expect(cls).toContain('items-center');
    expect(cls).toContain('justify-center');
    expect(cls).toContain('bg-bg/60');
  });

  it('inline variant centers without overlay surface', () => {
    render(<Spinner variant="inline" testID="inline" />);
    const cls = screen.getByTestId('inline').props.className as string;
    expect(cls).toContain('items-center');
    expect(cls).not.toContain('absolute');
  });

  it('merges caller className and overrides a11y label', () => {
    render(<Spinner className="mt-4" accessibilityLabel="인증 중" testID="custom" />);
    expect(screen.getByTestId('custom').props.className).toContain('mt-4');
    expect(screen.getByLabelText('인증 중')).toBeTruthy();
  });
});
