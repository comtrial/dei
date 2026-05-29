import { Text, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Popover } from '../Popover';

const items = [
  { label: '신고하기', onPress: () => {} },
  { label: '나가기', onPress: () => {}, danger: true },
];

describe('Popover (P17)', () => {
  it('renders only the trigger when closed', () => {
    render(
      <Popover
        items={items}
        trigger={(open) => (
          <Text testID="trigger" onPress={open}>
            ⋯
          </Text>
        )}
      />,
    );
    expect(screen.getByTestId('trigger')).toBeTruthy();
    expect(screen.queryByText('신고하기')).toBeNull();
  });

  it('opens the menu on trigger press and shows items', () => {
    render(
      <Popover
        items={items}
        trigger={(open) => (
          <Text testID="trigger" onPress={open}>
            ⋯
          </Text>
        )}
      />,
    );
    fireEvent.press(screen.getByTestId('trigger'));
    expect(screen.getByText('신고하기')).toBeTruthy();
    expect(screen.getByText('나가기')).toBeTruthy();
  });

  it('menu container uses paper + line + r-md + shadow-pop style (S16 .menu)', () => {
    render(
      <Popover
        items={items}
        trigger={(open) => (
          <Text testID="trigger" onPress={open}>
            ⋯
          </Text>
        )}
      />,
    );
    fireEvent.press(screen.getByTestId('trigger'));
    const menu = screen.getByTestId('popover-menu');
    const cls = menu.props.className as string;
    expect(cls).toContain('bg-paper');
    expect(cls).toContain('border-line');
    expect(cls).toContain('rounded-md');
    // shadow-pop 토큰 — 0 8px 24px rgba(0,0,0,.16)
    expect(menu.props.style.shadowRadius).toBe(24);
    expect(menu.props.style.shadowOpacity).toBeCloseTo(0.16);
  });

  it('danger item uses text-danger, normal item uses text-ink-2', () => {
    render(
      <Popover
        items={items}
        trigger={(open) => (
          <Text testID="trigger" onPress={open}>
            ⋯
          </Text>
        )}
      />,
    );
    fireEvent.press(screen.getByTestId('trigger'));
    expect((screen.getByText('나가기').props.className as string)).toContain('text-danger');
    expect((screen.getByText('신고하기').props.className as string)).toContain('text-ink-2');
  });

  it('selecting an item fires onPress and closes the menu', () => {
    const onPress = jest.fn();
    render(
      <Popover
        items={[{ label: '신고하기', onPress }]}
        trigger={(open) => (
          <Text testID="trigger" onPress={open}>
            ⋯
          </Text>
        )}
      />,
    );
    fireEvent.press(screen.getByTestId('trigger'));
    fireEvent.press(screen.getByText('신고하기'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('신고하기')).toBeNull();
  });

  it('forwards ref to the underlying View', () => {
    const ref = { current: null as View | null };
    render(
      <Popover
        ref={ref}
        items={items}
        trigger={(open) => <Text onPress={open}>⋯</Text>}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
