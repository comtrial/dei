import { View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  GridRoom,
  CELL_GRADIENTS,
  type GridRoomCell,
  type GradientComponentProps,
} from '../GridRoom';

const cells: GridRoomCell[] = [
  { name: '도경', uploadTime: '14:02', gradient: 'a' },
  { name: '현수', uploadTime: '14:08', gradient: 'c' },
  { name: '예린', uploadTime: '14:11', gradient: 'b' },
  { kind: 'empty', name: '동현', tone: 'purple' },
  { name: '수아', uploadTime: '14:00', gradient: 'f' },
  { name: '민수', uploadTime: '13:55', gradient: 'e' },
  { kind: 'empty', name: '유민', tone: 'pink' },
  { kind: 'empty', name: '지훈', tone: 'green' },
];

const timeStrip = [
  { label: '11' },
  { label: '12' },
  { label: '13' },
  { label: '14:00', isNow: true },
  { label: '15' },
  { label: '16' },
  { label: '17' },
];

describe('GridRoom (X10)', () => {
  it('renders the 8-cell room on a bg surface', () => {
    render(<GridRoom cells={cells} />);
    const root = screen.getByTestId('gridroom');
    expect(root).toBeTruthy();
    expect((root.props.className as string)).toContain('bg-bg');
    // 8 cells render, each addressable by index.
    for (let i = 0; i < 8; i += 1) {
      expect(screen.getByTestId(`gridroom-cell-${i}`)).toBeTruthy();
    }
  });

  it('renders filled cells with member name + upload time', () => {
    render(<GridRoom cells={cells} />);
    expect(screen.getByText('도경')).toBeTruthy();
    expect(screen.getByText('14:02')).toBeTruthy();
    expect(screen.getByText('13:55')).toBeTruthy();
  });

  it('renders empty cells with member name + Zzz.. placeholder', () => {
    render(<GridRoom cells={cells} />);
    expect(screen.getByText('동현')).toBeTruthy();
    expect(screen.getByText('유민')).toBeTruthy();
    expect(screen.getAllByText('Zzz..').length).toBe(3);
  });

  it('uses r-md (=14px, HTML r14) rounding on cells, not r-lg', () => {
    render(<GridRoom cells={cells} />);
    const className = screen.getByTestId('gridroom-cell-0').props
      .className as string;
    expect(className).toContain('rounded-md');
    expect(className).not.toContain('rounded-lg');
    expect(className).toContain('aspect-[3/4]');
    expect(className).toContain('overflow-hidden');
  });

  it('renders timeStrip with an ink now-pill and ink-4 default chips', () => {
    render(<GridRoom cells={cells} timeStrip={timeStrip} timeHint="‹ 회상" />);
    // now 칩: ink 채움 pill.
    const nowPill = screen.getByTestId('gridroom-now-pill');
    expect((nowPill.props.className as string)).toContain('bg-ink');
    // default 칩 텍스트는 ink-4.
    const past = screen.getByText('11');
    expect((past.props.className as string)).toContain('text-ink-4');
    expect(screen.getByText('‹ 회상')).toBeTruthy();
  });

  it('omits the timeStrip when not provided', () => {
    render(<GridRoom cells={cells} />);
    expect(screen.queryByTestId('gridroom-now-pill')).toBeNull();
  });

  it('fires onCellPress with the cell + index when a cell is tapped', () => {
    const onCellPress = jest.fn();
    render(<GridRoom cells={cells} onCellPress={onCellPress} />);
    fireEvent.press(screen.getByTestId('gridroom-cell-0'));
    expect(onCellPress).toHaveBeenCalledWith(cells[0], 0);
  });

  it('fires onAvatarPress for filled cells', () => {
    const onAvatarPress = jest.fn();
    render(<GridRoom cells={cells} onAvatarPress={onAvatarPress} />);
    fireEvent.press(screen.getByTestId('gridroom-avatar-1'));
    expect(onAvatarPress).toHaveBeenCalledWith(cells[1], 1);
  });

  // 회귀: 영상 없는 empty('Zzz..') 셀의 아바타+이름 탭도 프로필 진입(멤버 프로필 S14).
  it('fires onAvatarPress for empty cells (Zzz.. 셀도 프로필 진입)', () => {
    const onAvatarPress = jest.fn();
    render(<GridRoom cells={cells} onAvatarPress={onAvatarPress} />);
    // cells[0] = { kind: 'empty', name: '동현' }
    fireEvent.press(screen.getByTestId('gridroom-avatar-0'));
    expect(onAvatarPress).toHaveBeenCalledWith(cells[0], 0);
  });

  it('falls back to a token solid (bg-bg-2) cell background without a GradientComponent', () => {
    render(<GridRoom cells={[cells[0]]} />);
    // §3B: 그라데이션 미주입 시 토큰 단색 폴백, raw hex 배경 금지.
    const fallback = screen.getByTestId('gridroom-cell-bg-fallback');
    expect((fallback.props.className as string)).toContain('bg-bg-2');
  });

  it('passes the §3B gradient color constants to an injected GradientComponent', () => {
    const received: string[][] = [];
    const FakeGradient = (props: GradientComponentProps) => {
      received.push([...props.colors]);
      return <View testID="fake-gradient" />;
    };
    render(
      <GridRoom
        cells={[{ name: '도경', uploadTime: '14:02', gradient: 'a' }]}
        GradientComponent={FakeGradient}
      />,
    );
    expect(screen.getByTestId('fake-gradient')).toBeTruthy();
    expect(received[0]).toEqual([...CELL_GRADIENTS.a]);
  });

  it('renders an injected media slot instead of the gradient placeholder', () => {
    render(
      <GridRoom
        cells={[
          { name: '도경', uploadTime: '14:02', media: <View testID="thumb" /> },
        ]}
      />,
    );
    expect(screen.getByTestId('thumb')).toBeTruthy();
  });

  it('renders the presence avatar profile photo when photoUrl is provided', () => {
    render(
      <GridRoom
        cells={[
          {
            name: '도경',
            uploadTime: '14:02',
            photoUrl: 'https://example.test/photo.jpg',
          },
        ]}
      />,
    );
    const photo = screen.getByTestId('gridroom-avatar-photo-0');
    expect(photo).toBeTruthy();
    expect(photo.props.source).toEqual({ uri: 'https://example.test/photo.jpg' });
    // 이미지가 있으면 이니셜 텍스트는 렌더하지 않는다(폴백 대체).
    expect(screen.queryByTestId('gridroom-avatar-initial-0')).toBeNull();
  });

  it('falls back to the initial when no photoUrl is provided', () => {
    render(
      <GridRoom cells={[{ name: '도경', uploadTime: '14:02' }]} />,
    );
    expect(screen.queryByTestId('gridroom-avatar-photo-0')).toBeNull();
    expect(screen.getByTestId('gridroom-avatar-initial-0')).toBeTruthy();
    expect(screen.getByText('도')).toBeTruthy();
  });

  it('forwards ref to the root View', () => {
    const ref = { current: null as View | null };
    render(<GridRoom ref={ref} cells={cells} />);
    expect(ref.current).not.toBeNull();
  });
});
