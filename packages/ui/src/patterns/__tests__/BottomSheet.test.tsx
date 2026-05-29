import { Text, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { BottomSheet } from '../BottomSheet';

describe('BottomSheet (X3)', () => {
  it('renders scrim + paper surface with children when visible', () => {
    render(
      <BottomSheet visible onClose={() => {}}>
        <Text>시트 내용</Text>
      </BottomSheet>,
    );
    // scrim: rgba(0,0,0,.55) → bg-black/55 (raw hex 금지).
    const scrim = screen.getByTestId('bottom-sheet-scrim');
    expect((scrim.props.className as string)).toContain('bg-black/55');

    // 시트 표면: paper + 상단만 r-xl + 기본 height 78%.
    const surface = screen.getByTestId('bottom-sheet-surface');
    const surfaceClass = surface.props.className as string;
    expect(surfaceClass).toContain('bg-paper');
    expect(surfaceClass).toContain('rounded-t-xl');
    expect(surfaceClass).toContain('h-[78%]');

    expect(screen.getByText('시트 내용')).toBeTruthy();
  });

  it('does not render content when not visible (Modal closed)', () => {
    render(
      <BottomSheet visible={false} onClose={() => {}}>
        <Text>숨김 내용</Text>
      </BottomSheet>,
    );
    expect(screen.queryByText('숨김 내용')).toBeNull();
  });

  it('calls onClose when scrim is pressed', () => {
    const onClose = jest.fn();
    render(
      <BottomSheet visible onClose={onClose}>
        <View testID="child" />
      </BottomSheet>,
    );
    fireEvent.press(screen.getByTestId('bottom-sheet-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('maps heightPct prop to an arbitrary height class', () => {
    render(
      <BottomSheet visible onClose={() => {}} heightPct={50}>
        <View />
      </BottomSheet>,
    );
    expect((screen.getByTestId('bottom-sheet-surface').props.className as string)).toContain(
      'h-[50%]',
    );
  });
});
