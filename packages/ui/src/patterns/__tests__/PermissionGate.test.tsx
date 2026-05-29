import { View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { PermissionGate } from '../PermissionGate';

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

describe('PermissionGate (X7)', () => {
  it('renders heading, description and why-box reasons (S07a 알림 권한)', () => {
    render(
      <PermissionGate
        status="info"
        icon="🔔"
        heading="알림이 꺼져 있어요"
        description="매칭 결과를 알려드리려면 알림이 필요해요."
        reasons={[
          { text: '매칭이 성사되면 바로 알려드려요' },
          { text: '매시간 일상 업로드 시간 안내' },
        ]}
        primaryLabel="설정에서 알림 켜기"
        secondaryLabel="나중에 하기"
      />,
    );
    expect(screen.getByText('알림이 꺼져 있어요')).toBeTruthy();
    expect(screen.getByText('매칭 결과를 알려드리려면 알림이 필요해요.')).toBeTruthy();
    // why-box 기본 제목 + 불릿 항목
    expect(screen.getByText('왜 필요한가요?')).toBeTruthy();
    expect(screen.getByText('매칭이 성사되면 바로 알려드려요')).toBeTruthy();
  });

  it('status=info maps icon circle to info-soft bg + info glyph (S07a/S11a)', () => {
    render(
      <PermissionGate
        testID="gate"
        status="info"
        icon="📷"
        heading="카메라 권한이 필요해요"
      />,
    );
    // 아이콘 원형: info-soft 배경 + rounded-full (글리프 Text 의 조상 View)
    expect(findAncestorWithClass(screen.getByText('📷'), 'bg-info-soft')).toContain('rounded-full');
    // 글리프 전경 = info 토큰
    expect(screen.getByText('📷').props.className as string).toContain('text-info');
  });

  it('status=danger maps icon circle to danger-soft bg + danger glyph', () => {
    render(<PermissionGate status="danger" icon="!" heading="실패했어요" />);
    expect(findAncestorWithClass(screen.getByText('!'), 'bg-danger-soft')).toContain('rounded-full');
    expect(screen.getByText('!').props.className as string).toContain('text-danger');
  });

  it('status=spinner shows a Spinner (progressbar) and hides why-box / CTAs (S03)', () => {
    render(
      <PermissionGate
        status="spinner"
        heading="본인 인증 중"
        description="잠시만 기다려 주세요."
        reasons={[{ text: '무시되어야 함' }]}
        primaryLabel="무시되어야 함"
      />,
    );
    // Spinner = accessibilityRole progressbar + 라벨 '로딩 중'
    expect(screen.getByLabelText('로딩 중')).toBeTruthy();
    expect(screen.getByText('본인 인증 중')).toBeTruthy();
    // spinner 상태에서는 why-box / CTA 미표시
    expect(screen.queryByText('왜 필요한가요?')).toBeNull();
    expect(screen.queryByText('무시되어야 함')).toBeNull();
  });

  it('why-box uses bg-2 + rounded-md surface with ink-2 reason text', () => {
    render(
      <PermissionGate
        testID="gate"
        status="info"
        icon="🔔"
        heading="알림"
        reasons={[{ text: '바로 알려드려요' }]}
      />,
    );
    const reason = screen.getByText('바로 알려드려요');
    expect(reason.props.className as string).toContain('text-ink-2');
    // why-box 컨테이너(불릿 텍스트의 조상 View)가 bg-2/rounded-md 표면
    const cls = findAncestorWithClass(reason, 'bg-bg-2') ?? '';
    expect(cls).toContain('bg-bg-2');
    expect(cls).toContain('rounded-md');
  });

  it('primary CTA is ink-filled, secondary is bg-2 fill; both fire handlers', () => {
    const onPrimary = jest.fn();
    const onSecondary = jest.fn();
    render(
      <PermissionGate
        status="info"
        icon="🔔"
        heading="알림"
        primaryLabel="설정에서 알림 켜기"
        onPrimary={onPrimary}
        secondaryLabel="나중에 하기"
        onSecondary={onSecondary}
      />,
    );
    const primary = screen.getByText('설정에서 알림 켜기');
    const secondary = screen.getByText('나중에 하기');
    // primary 라벨 흰색, 버튼 표면 ink
    expect(primary.props.className as string).toContain('text-white');
    expect(findAncestorWithClass(primary, 'bg-ink')).toContain('rounded-md');
    // secondary 라벨 ink-2, 버튼 표면 bg-2
    expect(secondary.props.className as string).toContain('text-ink-2');
    expect(findAncestorWithClass(secondary, 'bg-bg-2')).toContain('rounded-md');

    fireEvent.press(primary);
    fireEvent.press(secondary);
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('renders close button only when onClose is provided and fires it', () => {
    const onClose = jest.fn();
    const { rerender } = render(
      <PermissionGate status="info" icon="🔔" heading="알림" />,
    );
    expect(screen.queryByLabelText('닫기')).toBeNull();

    rerender(
      <PermissionGate status="info" icon="🔔" heading="알림" onClose={onClose} />,
    );
    const close = screen.getByLabelText('닫기');
    fireEvent.press(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('forwards ref to the underlying View container', () => {
    const ref = { current: null as View | null };
    render(<PermissionGate ref={ref} status="info" icon="🔔" heading="알림" />);
    expect(ref.current).not.toBeNull();
  });
});
