import { View } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { BottomActionBar } from '../BottomActionBar';
import { Button } from '../../primitives/Button';

/** RNTL 노드에서 className 에 `needle` 이 포함된 조상 View 를 찾는다. */
function findAncestorWithClass(node: any, needle: string): string | undefined {
  let cur = node;
  while (cur != null) {
    const cls = cur.props?.className as string | undefined;
    if (typeof cls === 'string' && cls.includes(needle)) return cls;
    cur = cur.parent;
  }
  return undefined;
}

describe('BottomActionBar (X2)', () => {
  it('renders children (Button) on a paper surface with .cta-bottom padding', () => {
    render(
      <BottomActionBar testID="bar">
        <Button onPress={() => {}}>다음 (2/3)</Button>
      </BottomActionBar>,
    );
    expect(screen.getByText('다음 (2/3)')).toBeTruthy();
    const bar = screen.getByTestId('bar');
    const cls = bar.props.className as string;
    // .cta-bottom: background var(--paper) + padding 14px 24px 32px
    expect(cls).toContain('bg-paper');
    expect(cls).toContain('px-[24px]');
    expect(cls).toContain('pb-[32px]');
    expect(cls).toContain('pt-[14px]');
  });

  it('layout=single is the default and stacks vertically (flex-col)', () => {
    render(
      <BottomActionBar testID="bar">
        <Button onPress={() => {}}>dei 시작하기</Button>
      </BottomActionBar>,
    );
    expect((screen.getByTestId('bar').props.className as string)).toContain('flex-col');
  });

  it('layout=row arranges two CTAs side by side with gap and flex-1 wrappers', () => {
    render(
      <BottomActionBar testID="bar" layout="row">
        <Button variant="secondary" onPress={() => {}}>취소</Button>
        <Button variant="ink" onPress={() => {}}>유지</Button>
      </BottomActionBar>,
    );
    // 바 자체는 flex-row + gap (.sCC .row / .s11b .bottom-ctas)
    const cls = screen.getByTestId('bar').props.className as string;
    expect(cls).toContain('flex-row');
    expect(cls).toContain('gap-[12px]');
    // 각 CTA 는 flex-1 래퍼로 균등 분할
    expect(findAncestorWithClass(screen.getByText('취소'), 'flex-1')).toBeTruthy();
    expect(findAncestorWithClass(screen.getByText('유지'), 'flex-1')).toBeTruthy();
  });

  it('layout=stacked stacks primary above secondary with gap-10 (.ctas)', () => {
    render(
      <BottomActionBar testID="bar" layout="stacked">
        <Button variant="ink" onPress={() => {}}>설정에서 알림 켜기</Button>
        <Button variant="secondary" onPress={() => {}}>나중에 하기</Button>
      </BottomActionBar>,
    );
    const cls = screen.getByTestId('bar').props.className as string;
    expect(cls).toContain('flex-col');
    expect(cls).toContain('gap-[10px]');
  });

  it('borderTop adds a 1px line top border; default has none', () => {
    const { rerender } = render(
      <BottomActionBar testID="bar">
        <Button onPress={() => {}}>다음</Button>
      </BottomActionBar>,
    );
    expect((screen.getByTestId('bar').props.className as string)).not.toContain('border-line');

    rerender(
      <BottomActionBar testID="bar" borderTop>
        <Button onPress={() => {}}>다음</Button>
      </BottomActionBar>,
    );
    const cls = screen.getByTestId('bar').props.className as string;
    expect(cls).toContain('border-t');
    expect(cls).toContain('border-line');
  });

  it('fixed pins the bar to the bottom (absolute inset-x-0 bottom-0)', () => {
    render(
      <BottomActionBar testID="bar" fixed>
        <Button onPress={() => {}}>신고 제출</Button>
      </BottomActionBar>,
    );
    const cls = screen.getByTestId('bar').props.className as string;
    expect(cls).toContain('absolute');
    expect(cls).toContain('inset-x-0');
    expect(cls).toContain('bottom-0');
  });

  it('forwards ref to the underlying View container', () => {
    const ref = { current: null as View | null };
    render(
      <BottomActionBar ref={ref}>
        <Button onPress={() => {}}>다음</Button>
      </BottomActionBar>,
    );
    expect(ref.current).not.toBeNull();
  });
});
