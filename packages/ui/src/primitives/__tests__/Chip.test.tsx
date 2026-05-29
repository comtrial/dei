import { View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Chip } from '../Chip';

describe('Chip (P8)', () => {
  it('renders a default chip label inside a View (S06 멤버 칩)', () => {
    render(
      <Chip testID="chip" variant="default" label="민준" />,
    );
    expect(screen.getByTestId('chip')).toBeTruthy();
    expect(screen.getByText('민준')).toBeTruthy();
  });

  it('default variant uses paper + line border + r-full (S06 .chip)', () => {
    render(<Chip testID="chip" variant="default" label="민준" />);
    const container = screen.getByTestId('chip').props.className as string;
    expect(container).toContain('bg-paper');
    expect(container).toContain('border-line');
    expect(container).toContain('rounded-full');
    const label = screen.getByText('민준').props.className as string;
    expect(label).toContain('text-ink');
  });

  it('me variant uses border-accent and renders the accent-soft badge pill', () => {
    render(<Chip testID="chip" variant="me" label="도경" badge="초대한 사람" />);
    const container = screen.getByTestId('chip').props.className as string;
    expect(container).toContain('border-accent');
    // .bdg accent-soft pill + accent label
    expect(screen.getByText('초대한 사람')).toBeTruthy();
    const badge = screen.getByText('초대한 사람').props.className as string;
    expect(badge).toContain('text-accent');
  });

  it('busy variant uses dashed warn border and warn label (다른 방 사용 중)', () => {
    render(<Chip testID="chip" variant="busy" label="수아" />);
    const container = screen.getByTestId('chip').props.className as string;
    expect(container).toContain('border-warn');
    expect(container).toContain('border-dashed');
    const label = screen.getByText('수아').props.className as string;
    expect(label).toContain('text-warn');
  });

  it('add variant uses transparent + dashed ink-4 border (+ 친구)', () => {
    render(<Chip testID="chip" variant="add" label="+ 친구" />);
    const container = screen.getByTestId('chip').props.className as string;
    expect(container).toContain('bg-transparent');
    expect(container).toContain('border-dashed');
    expect(container).toContain('border-ink-4');
    const label = screen.getByText('+ 친구').props.className as string;
    expect(label).toContain('text-ink-3');
  });

  it('removable renders an × button that fires onRemove', () => {
    const onRemove = jest.fn();
    render(
      <Chip testID="chip" variant="default" label="민준" removable onRemove={onRemove} />,
    );
    fireEvent.press(screen.getByText('×'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('renders the avatar slot for non-add variants', () => {
    render(
      <Chip
        testID="chip"
        variant="default"
        label="민준"
        avatar={<View testID="chip-avatar" />}
      />,
    );
    expect(screen.getByTestId('chip-avatar')).toBeTruthy();
  });

  it('add variant ignores the avatar slot and removable', () => {
    render(
      <Chip
        testID="chip"
        variant="add"
        label="+ 친구"
        avatar={<View testID="chip-avatar" />}
        removable
      />,
    );
    expect(screen.queryByTestId('chip-avatar')).toBeNull();
    expect(screen.queryByText('×')).toBeNull();
  });

  it('merges caller className (last wins via cn)', () => {
    render(<Chip testID="chip" variant="default" label="민준" className="bg-bg-2" />);
    const container = screen.getByTestId('chip').props.className as string;
    // tailwind-merge: 충돌하는 bg 는 caller 가 승리(paper → bg-2).
    expect(container).toContain('bg-bg-2');
    expect(container).not.toContain('bg-paper');
  });

  it('forwards ref to the underlying View', () => {
    const ref = { current: null as View | null };
    render(<Chip ref={ref} testID="chip" variant="default" label="민준" />);
    expect(ref.current).not.toBeNull();
  });
});
