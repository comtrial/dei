import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { PulseRing } from '../PulseRing';

/**
 * PulseRing (P20) — 렌더 + rings/core/delay + 토큰 className 검증.
 * reanimated 는 jest preset 의 mock(react-native-reanimated/mock)로 동작한다.
 */
describe('PulseRing', () => {
  it('renders with progressbar role and default a11y label', () => {
    render(<PulseRing testID="root" />);
    const root = screen.getByTestId('root');
    expect(root.props.accessibilityRole).toBe('progressbar');
    expect(screen.getByLabelText('매칭 중')).toBeTruthy();
  });

  it('applies pulse-area container tokens (140px, relative, centered)', () => {
    render(<PulseRing testID="area" />);
    const cls = screen.getByTestId('area').props.className as string;
    expect(cls).toContain('h-[140px]');
    expect(cls).toContain('w-[140px]');
    expect(cls).toContain('relative');
    expect(cls).toContain('items-center');
  });

  it('renders the requested number of pulse rings (default 2)', () => {
    render(<PulseRing testID="rings" />);
    // children: [ring, ring, core] → 2 rings + 1 core = 3
    const children = screen.getByTestId('rings').props.children;
    const ringLayers = children[0];
    expect(ringLayers).toHaveLength(2);
  });

  it('renders rings=3 → 3 staggered ring layers', () => {
    render(<PulseRing rings={3} testID="rings3" />);
    const ringLayers = screen.getByTestId('rings3').props.children[0];
    expect(ringLayers).toHaveLength(3);
  });

  it('core slot is wrapped in an accent circle and renders content', () => {
    render(
      <PulseRing core={<Text>♥</Text>} testID="with-core" />,
    );
    expect(screen.getByText('♥')).toBeTruthy();
  });

  it('merges caller className and overrides a11y label', () => {
    render(<PulseRing className="mb-8" accessibilityLabel="연결 중" testID="custom" />);
    expect(screen.getByTestId('custom').props.className).toContain('mb-8');
    expect(screen.getByLabelText('연결 중')).toBeTruthy();
  });
});
