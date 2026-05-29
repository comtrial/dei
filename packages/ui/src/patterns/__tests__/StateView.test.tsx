import { View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { StateView } from '../StateView';

/** RNTL 노드에서 className 에 `needle` 이 포함된 조상 View 를 찾는다(Text 래퍼 중첩 흡수). */
function findAncestorWithClass(node: any, needle: string): string | undefined {
  let cur = node;
  while (cur != null) {
    const cls = cur.props?.className as string | undefined;
    if (typeof cls === 'string' && cls.includes(needle)) return cls;
    cur = cur.parent;
  }
  return undefined;
}

describe('StateView (X6)', () => {
  it('kind=loading shows a Spinner (progressbar) and ignores icon (S01 splash)', () => {
    render(<StateView kind="loading" icon="🙈" title="불러오는 중" desc="잠시만요" />);
    // Spinner = accessibilityRole progressbar + 라벨 '로딩 중'
    expect(screen.getByLabelText('로딩 중')).toBeTruthy();
    expect(screen.getByText('불러오는 중')).toBeTruthy();
    expect(screen.getByText('잠시만요')).toBeTruthy();
    // loading 은 icon prop 무시
    expect(screen.queryByText('🙈')).toBeNull();
  });

  it('kind=empty renders neutral icon glyph + title + desc (S07/S09 빈 상태)', () => {
    render(
      <StateView
        kind="empty"
        icon="🔍"
        title="아직 매칭 상대가 없어요"
        desc="조금만 기다려 주세요."
      />,
    );
    expect(screen.getByText('🔍')).toBeTruthy();
    expect(screen.getByText('아직 매칭 상대가 없어요')).toBeTruthy();
    expect(screen.getByText('조금만 기다려 주세요.')).toBeTruthy();
    // empty 는 Spinner 미표시
    expect(screen.queryByLabelText('로딩 중')).toBeNull();
  });

  it('kind=error maps icon circle to danger-soft bg + danger glyph (S03f)', () => {
    render(<StateView kind="error" icon="!" title="실패했어요" desc="다시 시도" />);
    // 아이콘 원형: danger-soft 배경 + rounded-full (글리프 Text 의 조상 View)
    expect(findAncestorWithClass(screen.getByText('!'), 'bg-danger-soft')).toContain(
      'rounded-full',
    );
    // 글리프 전경 = danger 토큰
    expect(screen.getByText('!').props.className as string).toContain('text-danger');
  });

  it('error action is ink-filled CTA; non-error action is accent — both fire handler', () => {
    const onError = jest.fn();
    const { rerender } = render(
      <StateView
        kind="error"
        icon="!"
        title="실패"
        action={{ label: '다시 시도', onPress: onError }}
      />,
    );
    const errorCta = screen.getByText('다시 시도');
    expect(findAncestorWithClass(errorCta, 'bg-ink')).toBeTruthy();
    fireEvent.press(errorCta);
    expect(onError).toHaveBeenCalledTimes(1);

    const onUnlock = jest.fn();
    rerender(
      <StateView
        kind="empty"
        icon="🔒"
        title="잠겨 있어요"
        action={{ label: '잠금 해제', onPress: onUnlock }}
      />,
    );
    const unlockCta = screen.getByText('잠금 해제');
    expect(findAncestorWithClass(unlockCta, 'bg-accent')).toBeTruthy();
    fireEvent.press(unlockCta);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('omits action CTA when not provided', () => {
    render(<StateView kind="empty" icon="🔍" title="빈 상태" />);
    expect(screen.queryByText('잠금 해제')).toBeNull();
  });

  it('forwards ref to the underlying View container', () => {
    const ref = { current: null as View | null };
    render(<StateView ref={ref} kind="loading" title="로딩" />);
    expect(ref.current).not.toBeNull();
  });
});
