import { render } from '@testing-library/react-native';
import { ProgressBar } from '../ProgressBar';

describe('ProgressBar (P12)', () => {
  it('렌더 + 선형 track/fill 토큰 className 적용 (bg-2 track, accent fill, r-full)', () => {
    const { getByTestId, root } = render(<ProgressBar value={0.33} />);

    // track: bg-2 + rounded-full + overflow-hidden
    const trackClass = (root.props as { className?: string }).className ?? '';
    expect(trackClass).toContain('bg-bg-2');
    expect(trackClass).toContain('rounded-full');
    expect(trackClass).toContain('overflow-hidden');

    // fill: accent + rounded-full
    const fill = getByTestId('progressbar-fill');
    expect(fill.props.className).toContain('bg-accent');
    expect(fill.props.className).toContain('rounded-full');
  });

  it('value 가 width 클래스(33% → w-[35%], 5% 스텝)로 매핑된다', () => {
    const { getByTestId } = render(<ProgressBar value={0.33} />);
    expect(getByTestId('progressbar-fill').props.className).toContain('w-[35%]');
  });

  it('value 100% → w-full, 0% → w-0, 범위 밖은 클램프', () => {
    const full = render(<ProgressBar value={1} />);
    expect(full.getByTestId('progressbar-fill').props.className).toContain('w-full');

    const over = render(<ProgressBar value={5} />);
    expect(over.getByTestId('progressbar-fill').props.className).toContain('w-full');

    const zero = render(<ProgressBar value={0} />);
    expect(zero.getByTestId('progressbar-fill').props.className).toContain('w-0');
  });

  it('선형 모드 accessibility: progressbar role + value', () => {
    const { root } = render(<ProgressBar value={0.5} />);
    expect(root.props.accessibilityRole).toBe('progressbar');
    expect(root.props.accessibilityValue).toEqual({ min: 0, max: 1, now: 0.5 });
  });

  it('segmented(dots): 균등 분할 + active=accent / inactive=bg-2', () => {
    // 3칸 중 1칸 active (value 0.33 * 3 ≈ 1)
    const { getByTestId } = render(<ProgressBar segmented={3} value={1 / 3} />);

    const d0 = getByTestId('progressbar-segment-0');
    const d1 = getByTestId('progressbar-segment-1');

    expect(d0.props.className).toContain('bg-accent'); // active
    expect(d0.props.className).toContain('flex-1');
    expect(d0.props.className).toContain('rounded-full');
    expect(d1.props.className).toContain('bg-bg-2'); // inactive track
  });

  it('segmented 배열 입력: 각 칸 채움 여부를 그대로 따른다', () => {
    const { getByTestId } = render(<ProgressBar segmented={[true, true, false]} />);
    expect(getByTestId('progressbar-segment-0').props.className).toContain('bg-accent');
    expect(getByTestId('progressbar-segment-1').props.className).toContain('bg-accent');
    expect(getByTestId('progressbar-segment-2').props.className).toContain('bg-bg-2');
  });

  it('props.className 머지 (cn) — 호출자 override 가능', () => {
    const { root } = render(<ProgressBar value={0.5} className="mt-4" />);
    expect((root.props as { className?: string }).className).toContain('mt-4');
  });
});
