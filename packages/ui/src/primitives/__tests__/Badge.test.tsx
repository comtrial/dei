import { View } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { Badge } from '../Badge';

describe('Badge (P7)', () => {
  it('renders count label inside a View', () => {
    render(
      <Badge testID="badge" variant="count">
        3 / 5
      </Badge>,
    );
    expect(screen.getByTestId('badge')).toBeTruthy();
    expect(screen.getByText('3 / 5')).toBeTruthy();
  });

  it('count variant uses bg-2 pill + ink-3 label + r-full (S06 nav)', () => {
    render(
      <Badge testID="badge" variant="count">
        3 / 5
      </Badge>,
    );
    const container = screen.getByTestId('badge').props.className as string;
    expect(container).toContain('bg-bg-2');
    expect(container).toContain('rounded-full');
    const label = screen.getByText('3 / 5').props.className as string;
    expect(label).toContain('text-ink-3');
  });

  it('age variant: ink pill with accent inner pill (S02 19+)', () => {
    render(
      <Badge testID="badge" variant="age">
        {'19세 미만'}
        {'이용 불가'}
      </Badge>,
    );
    const container = screen.getByTestId('badge').props.className as string;
    // 바깥 칩 = ink 배경 + r-full
    expect(container).toContain('bg-ink');
    expect(container).toContain('rounded-full');
    // 바깥 라벨은 흰색
    const base = screen.getByText('19세 미만').props.className as string;
    expect(base).toContain('text-white');
    // 내부 pill = accent 배경
    expect(screen.getByText('이용 불가')).toBeTruthy();
  });

  it('icon variant maps tone to *-soft bg + matching fg (IconBadge)', () => {
    render(
      <Badge testID="badge" variant="icon" tone="danger">
        !
      </Badge>,
    );
    const container = screen.getByTestId('badge').props.className as string;
    expect(container).toContain('bg-danger-soft');
    expect(container).toContain('rounded-full');
    const glyph = screen.getByText('!').props.className as string;
    expect(glyph).toContain('text-danger');
  });

  it('icon variant tone=info uses info-soft + info fg', () => {
    render(
      <Badge testID="badge" variant="icon" tone="info">
        i
      </Badge>,
    );
    const container = screen.getByTestId('badge').props.className as string;
    expect(container).toContain('bg-info-soft');
    expect(screen.getByText('i').props.className as string).toContain('text-info');
  });

  it('dot variant renders a paper-ringed accent circle with no label', () => {
    render(<Badge testID="badge" variant="dot" />);
    const container = screen.getByTestId('badge').props.className as string;
    expect(container).toContain('bg-accent');
    expect(container).toContain('rounded-full');
    expect(container).toContain('border-paper');
  });

  it('required variant defaults to accent label, info tone mutes to ink-3', () => {
    render(
      <Badge testID="req" variant="required">
        필수
      </Badge>,
    );
    expect((screen.getByText('필수').props.className as string)).toContain('text-accent');

    render(
      <Badge testID="opt" variant="required" tone="info">
        선택
      </Badge>,
    );
    expect((screen.getByText('선택').props.className as string)).toContain('text-ink-3');
  });

  it('discount variant uses accent label (S17 price badge)', () => {
    render(
      <Badge testID="badge" variant="discount">
        12% 할인
      </Badge>,
    );
    const label = screen.getByText('12% 할인').props.className as string;
    expect(label).toContain('text-accent');
    const container = screen.getByTestId('badge').props.className as string;
    expect(container).toContain('rounded-full');
  });

  it('lock variant uses on-dark white pill (S09/S10 blur 게이트)', () => {
    render(
      <Badge testID="badge" variant="lock">
        🔒 blur 게이트
      </Badge>,
    );
    const container = screen.getByTestId('badge').props.className as string;
    expect(container).toContain('rounded-full');
    expect(container).toContain('bg-white/10');
    expect((screen.getByText('🔒 blur 게이트').props.className as string)).toContain(
      'text-white/80',
    );
  });

  it('merges caller className (last wins via cn)', () => {
    render(
      <Badge testID="badge" variant="count" className="bg-accent-soft">
        N
      </Badge>,
    );
    const container = screen.getByTestId('badge').props.className as string;
    // tailwind-merge: 충돌하는 bg 는 caller 가 승리(bg-2 → accent-soft).
    expect(container).toContain('bg-accent-soft');
    expect(container).not.toContain('bg-bg-2');
  });

  it('forwards ref to the underlying View', () => {
    const ref = { current: null as View | null };
    render(<Badge ref={ref} testID="badge" variant="dot" />);
    expect(ref.current).not.toBeNull();
  });
});
