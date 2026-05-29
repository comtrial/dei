import { View } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { SheetHandle } from '../SheetHandle';

// 데코 그랩이라 기본적으로 a11y 트리에서 숨겨진다 → 쿼리는 hidden 포함.
const HIDDEN = { includeHiddenElements: true } as const;

describe('SheetHandle (P19)', () => {
  it('renders a View', () => {
    render(<SheetHandle testID="handle" />);
    expect(screen.getByTestId('handle', HIDDEN)).toBeTruthy();
  });

  it('applies the SSOT grab tokens (36×4, ink-4, full radius, .5 opacity, centered)', () => {
    render(<SheetHandle testID="handle" />);
    const className = screen.getByTestId('handle', HIDDEN).props.className as string;
    expect(className).toContain('w-[36px]');
    expect(className).toContain('h-[4px]');
    expect(className).toContain('bg-ink-4');
    expect(className).toContain('rounded-full');
    expect(className).toContain('opacity-50');
    expect(className).toContain('self-center');
    expect(className).toContain('shrink-0');
  });

  it('hides itself from the accessibility tree by default (decorative)', () => {
    render(<SheetHandle testID="handle" />);
    const node = screen.getByTestId('handle', HIDDEN);
    expect(node.props.accessibilityElementsHidden).toBe(true);
    expect(node.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('merges caller className (last wins via cn)', () => {
    render(<SheetHandle testID="handle" className="bg-line" />);
    const className = screen.getByTestId('handle', HIDDEN).props.className as string;
    // tailwind-merge: 충돌하는 배경색은 caller 가 승리(bg-ink-4 → bg-line).
    expect(className).toContain('bg-line');
    expect(className).not.toContain('bg-ink-4');
  });

  it('forwards ref to the underlying View', () => {
    const ref = { current: null as View | null };
    render(<SheetHandle ref={ref} testID="handle" />);
    expect(ref.current).not.toBeNull();
  });
});
