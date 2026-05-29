import { fireEvent, render, screen } from '@testing-library/react-native';

import { AlertDialog } from '../AlertDialog';

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

describe('AlertDialog (X4)', () => {
  it('renders title + description + actions when visible (lg)', () => {
    render(
      <AlertDialog
        visible
        size="lg"
        tone="danger"
        icon="!"
        title="결제에 실패했어요"
        description="카드 정보를 확인해 주세요."
        actions={[
          { label: '다시 시도', variant: 'ink' },
          { label: '닫기', variant: 'secondary' },
        ]}
      />,
    );
    expect(screen.getByText('결제에 실패했어요')).toBeTruthy();
    expect(screen.getByText('카드 정보를 확인해 주세요.')).toBeTruthy();
    expect(screen.getByText('다시 시도')).toBeTruthy();
    expect(screen.getByText('닫기')).toBeTruthy();
  });

  it('does not render content when visible=false', () => {
    render(<AlertDialog visible={false} title="숨김" />);
    // RN Modal 은 visible=false 면 children 을 렌더하지 않는다.
    expect(screen.queryByText('숨김')).toBeNull();
  });

  it('lg tone=danger maps icon circle to danger-soft bg + danger glyph (.sPF .icn)', () => {
    render(<AlertDialog visible size="lg" tone="danger" icon="!" title="실패" />);
    // Badge(icon) 원형: danger-soft 배경 + rounded-full
    expect(findAncestorWithClass(screen.getByText('!'), 'bg-danger-soft')).toContain(
      'rounded-full',
    );
    // 글리프 전경 = danger 토큰
    expect(screen.getByText('!').props.className as string).toContain('text-danger');
  });

  it('lg tone=info maps icon circle to info-soft bg + info glyph', () => {
    render(<AlertDialog visible size="lg" tone="info" icon="i" title="안내" />);
    expect(findAncestorWithClass(screen.getByText('i'), 'bg-info-soft')).toContain(
      'rounded-full',
    );
    expect(screen.getByText('i').props.className as string).toContain('text-info');
  });

  it('mini renders eyebrow + title + 2-CTA row (.sCF .mini)', () => {
    render(
      <AlertDialog
        visible
        size="mini"
        tone="warn"
        eyebrow="PERMISSION"
        title="카메라 권한이 필요해요"
        description="설정에서 권한을 켜주세요."
        actions={[
          { label: '설정 열기', variant: 'ink' },
          { label: '취소', variant: 'secondary' },
        ]}
      />,
    );
    expect(screen.getByText('PERMISSION')).toBeTruthy();
    expect(screen.getByText('카메라 권한이 필요해요')).toBeTruthy();
    expect(screen.getByText('설정 열기')).toBeTruthy();
    expect(screen.getByText('취소')).toBeTruthy();
  });

  it('severityTopBorder=true applies 3px top border in tone color (.mini.permission)', () => {
    render(
      <AlertDialog
        visible
        size="mini"
        tone="warn"
        severityTopBorder
        title="권한 경고"
      />,
    );
    const cls = findAncestorWithClass(screen.getByText('권한 경고'), 'border-t-warn');
    expect(cls).toContain('border-t-[3px]');
  });

  it('fires action onPress', () => {
    const onPress = jest.fn();
    render(
      <AlertDialog
        visible
        size="lg"
        title="확인"
        actions={[{ label: '확인', variant: 'ink', testID: 'alert-confirm', onPress }]}
      />,
    );
    fireEvent.press(screen.getByTestId('alert-confirm'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
