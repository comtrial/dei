import { render, screen } from '@testing-library/react-native';

import { BrandTransitionFrame } from '../BrandTransitionFrame';

describe('BrandTransitionFrame (X15)', () => {
  it('renders the default dei → PortOne transition row', () => {
    render(<BrandTransitionFrame testID="btf" />);
    expect(screen.getByTestId('btf')).toBeTruthy();
    expect(screen.getByText('→')).toBeTruthy();
    expect(screen.getByText('PortOne')).toBeTruthy();
  });

  it('frame is a flex row with gap-14 (.brand-frame)', () => {
    render(<BrandTransitionFrame testID="btf" />);
    const frame = screen.getByTestId('btf').props.className as string;
    expect(frame).toContain('flex-row');
    expect(frame).toContain('items-center');
    expect(frame).toContain('gap-[14px]');
  });

  it('brand mark uses ink 22px/800 with an accent dot (.logo-side / accent)', () => {
    render(<BrandTransitionFrame testID="btf" />);
    const brand = screen.getByTestId('brand-mark').props.className as string;
    expect(brand).toContain('text-ink');
    expect(brand).toContain('font-extrabold');
    expect(brand).toContain('text-[22px]');
    const dot = screen.getByTestId('brand-dot').props.className as string;
    expect(dot).toContain('text-accent');
  });

  it('arrow uses ink-4 / 18px (.dash)', () => {
    render(<BrandTransitionFrame testID="btf" />);
    const arrow = screen.getByTestId('brand-arrow').props.className as string;
    expect(arrow).toContain('text-ink-4');
    expect(arrow).toContain('text-[18px]');
  });

  it('target renders as an ink-3 / bg-2 pill with r-sm (.portone)', () => {
    render(<BrandTransitionFrame testID="btf" target="PortOne" />);
    const pill = screen.getByTestId('brand-target-pill').props.className as string;
    expect(pill).toContain('bg-bg-2');
    expect(pill).toContain('rounded-sm');
    const label = screen.getByText('PortOne').props.className as string;
    expect(label).toContain('text-ink-3');
    expect(label).toContain('font-bold');
  });

  it('omits the accent dot when showDot is false', () => {
    render(<BrandTransitionFrame brand="dei" showDot={false} />);
    expect(screen.queryByTestId('brand-dot')).toBeNull();
  });

  it('exposes an accessible label for the transition', () => {
    render(<BrandTransitionFrame testID="btf" brand="dei" target="PortOne" />);
    expect(screen.getByTestId('btf').props.accessibilityLabel).toBe('dei PortOne');
  });
});
