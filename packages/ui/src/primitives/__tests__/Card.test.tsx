import { Text, View } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { Card } from '../Card';

describe('Card (P5)', () => {
  it('renders children inside a View', () => {
    render(
      <Card testID="card">
        <Text>안녕</Text>
      </Card>,
    );
    expect(screen.getByTestId('card')).toBeTruthy();
    expect(screen.getByText('안녕')).toBeTruthy();
  });

  it('applies default variant tokens (paper + line border + r-md)', () => {
    render(<Card testID="card" />);
    const className = screen.getByTestId('card').props.className as string;
    expect(className).toContain('bg-paper');
    expect(className).toContain('border-line');
    expect(className).toContain('rounded-md');
    // default 는 r-md 이며 r-lg 가 아니다.
    expect(className).not.toContain('rounded-lg');
  });

  it('cta-entry variant uses r-lg (S05)', () => {
    render(<Card testID="card" variant="cta-entry" />);
    const className = screen.getByTestId('card').props.className as string;
    expect(className).toContain('rounded-lg');
    expect(className).toContain('bg-paper');
    expect(className).toContain('border-line');
  });

  it('info-rows variant clips children with overflow-hidden (S16)', () => {
    render(<Card testID="card" variant="info-rows" />);
    const className = screen.getByTestId('card').props.className as string;
    expect(className).toContain('overflow-hidden');
    expect(className).toContain('rounded-md');
  });

  it('merges caller className (last wins via cn)', () => {
    render(<Card testID="card" className="rounded-lg bg-bg-2" />);
    const className = screen.getByTestId('card').props.className as string;
    // tailwind-merge: 충돌하는 radius 는 caller 가 승리(rounded-md → rounded-lg).
    expect(className).toContain('rounded-lg');
    expect(className).not.toContain('rounded-md');
    expect(className).toContain('bg-bg-2');
  });

  it('forwards ref to the underlying View', () => {
    const ref = { current: null as View | null };
    render(<Card ref={ref} testID="card" />);
    expect(ref.current).not.toBeNull();
  });
});
