import { render, screen } from '@testing-library/react-native';

import { CompareCard, NOW_GLOW_COLORS, type GlowComponentProps } from '../CompareCard';

const current = { label: '그냥 기다리기', value: '23시간 32분', sub: '내일 13:45 가능' };
const now = { label: '바로 매치', value: '지금 즉시', sub: '바로 큐 진입' };

describe('CompareCard (X14)', () => {
  it('renders both cur and now columns with labels, values, subs', () => {
    render(<CompareCard testID="cc" current={current} now={now} />);
    expect(screen.getByTestId('cc')).toBeTruthy();
    expect(screen.getByText('그냥 기다리기')).toBeTruthy();
    expect(screen.getByText('23시간 32분')).toBeTruthy();
    expect(screen.getByText('내일 13:45 가능')).toBeTruthy();
    expect(screen.getByText('바로 매치')).toBeTruthy();
    expect(screen.getByText('지금 즉시')).toBeTruthy();
    expect(screen.getByText('바로 큐 진입')).toBeTruthy();
  });

  it('lays out as a flex row with gap-8 (.compare 2col grid)', () => {
    render(<CompareCard testID="cc" current={current} now={now} />);
    const root = screen.getByTestId('cc').props.className as string;
    expect(root).toContain('flex-row');
    expect(root).toContain('gap-[8px]');
  });

  it('cur column uses bg-2 surface + rounded-lg (.card.cur)', () => {
    render(<CompareCard current={current} now={now} />);
    const cur = screen.getByTestId('compare-cur').props.className as string;
    expect(cur).toContain('bg-bg-2');
    expect(cur).toContain('rounded-lg');
    expect(cur).toContain('flex-1');
  });

  it('now column uses ink surface + overflow-hidden glow clip (.card.now)', () => {
    render(<CompareCard current={current} now={now} />);
    const nowCard = screen.getByTestId('compare-now').props.className as string;
    expect(nowCard).toContain('bg-ink');
    expect(nowCard).toContain('overflow-hidden');
    expect(nowCard).toContain('rounded-lg');
  });

  it('cur label is ink-3, now label is accent (.lbl tone split)', () => {
    render(<CompareCard current={current} now={now} />);
    const curLbl = screen.getByTestId('compare-cur-label').props.className as string;
    const nowLbl = screen.getByTestId('compare-now-label').props.className as string;
    expect(curLbl).toContain('text-ink-3');
    expect(nowLbl).toContain('text-accent');
  });

  it('cur value is ink, now value is white, both tabular (.val tone split)', () => {
    render(<CompareCard current={current} now={now} />);
    const curVal = screen.getByTestId('compare-cur-value').props.className as string;
    const nowVal = screen.getByTestId('compare-now-value').props.className as string;
    expect(curVal).toContain('text-ink');
    expect(curVal).toContain('tabular-nums');
    expect(nowVal).toContain('text-white');
    expect(nowVal).toContain('tabular-nums');
  });

  it('now sub is white@60% while cur sub is ink-3 (.sub tone split)', () => {
    render(<CompareCard current={current} now={now} />);
    const curSub = screen.getByTestId('compare-cur-sub').props.className as string;
    const nowSub = screen.getByTestId('compare-now-sub').props.className as string;
    expect(curSub).toContain('text-ink-3');
    expect(nowSub).toContain('text-white/60');
  });

  it('renders accent-soft fallback glow when no GlowComponent injected', () => {
    render(<CompareCard current={current} now={now} />);
    const glow = screen.getByTestId('compare-now-glow').props.className as string;
    expect(glow).toContain('absolute');
    expect(glow).toContain('inset-0');
    expect(glow).toContain('bg-accent-soft');
  });

  it('uses injected GlowComponent with the NOW_GLOW_COLORS constant when provided', () => {
    const Glow = (props: GlowComponentProps) => <></>;
    let received: GlowComponentProps | undefined;
    const Spy = (props: GlowComponentProps) => {
      received = props;
      return <Glow {...props} />;
    };
    render(<CompareCard current={current} now={now} GlowComponent={Spy} />);
    expect(received?.colors).toEqual(NOW_GLOW_COLORS);
    expect(received?.start).toEqual({ x: 1, y: 0 });
  });

  it('omits the sub line when a column has no sub', () => {
    render(
      <CompareCard
        current={{ label: '대기', value: '24h' }}
        now={{ label: '즉시', value: 'now' }}
      />,
    );
    expect(screen.queryByTestId('compare-cur-sub')).toBeNull();
    expect(screen.queryByTestId('compare-now-sub')).toBeNull();
  });

  it('exposes an accessible summary label', () => {
    render(<CompareCard testID="cc" current={current} now={now} />);
    expect(screen.getByTestId('cc').props.accessibilityLabel).toBe(
      '그냥 기다리기 23시간 32분 대 바로 매치 지금 즉시',
    );
  });
});
