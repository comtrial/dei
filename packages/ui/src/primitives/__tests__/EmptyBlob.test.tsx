import { render, screen } from '@testing-library/react-native';

import { EmptyBlob } from '../EmptyBlob';

describe('EmptyBlob (P21)', () => {
  it('renders a round blob face', () => {
    render(<EmptyBlob testID="blob" />);
    const blob = screen.getByTestId('blob');
    expect(blob).toBeTruthy();
    const className = blob.props.className as string;
    expect(className).toContain('rounded-full');
    expect(className).toContain('relative');
  });

  it('applies the §3B tone constant for pink (default)', () => {
    render(<EmptyBlob testID="blob" />);
    expect((screen.getByTestId('blob').props.className as string)).toContain(
      'bg-[#FF1B9D]',
    );
  });

  it('applies the §3B tone constant for green and purple', () => {
    const { rerender } = render(<EmptyBlob testID="blob" tone="green" />);
    expect((screen.getByTestId('blob').props.className as string)).toContain(
      'bg-[#74E36A]',
    );
    rerender(<EmptyBlob testID="blob" tone="purple" />);
    expect((screen.getByTestId('blob').props.className as string)).toContain(
      'bg-[#9A7AE8]',
    );
  });

  it('sizes the blob via className arbitrary value (no inline style color)', () => {
    render(<EmptyBlob testID="blob" size={60} />);
    const className = screen.getByTestId('blob').props.className as string;
    expect(className).toContain('w-[60px]');
    expect(className).toContain('h-[60px]');
  });

  it('exposes an image accessibility role', () => {
    render(<EmptyBlob testID="blob" />);
    expect(screen.getByTestId('blob').props.accessibilityRole).toBe('image');
  });

  it('merges caller className', () => {
    render(<EmptyBlob testID="blob" className="opacity-50" />);
    expect((screen.getByTestId('blob').props.className as string)).toContain(
      'opacity-50',
    );
  });
});
