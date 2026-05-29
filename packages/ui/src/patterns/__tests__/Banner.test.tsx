import { fireEvent, render, screen } from '@testing-library/react-native';

import { Banner } from '../Banner';

/** RNTL 노드에서 className 에 `needle` 이 포함된 조상 View 를 찾는다(Badge/Text 래퍼 중첩 흡수). */
function findAncestorWithClass(node: any, needle: string): string | undefined {
  let cur = node;
  while (cur != null) {
    const cls = cur.props?.className as string | undefined;
    if (typeof cls === 'string' && cls.includes(needle)) return cls;
    cur = cur.parent;
  }
  return undefined;
}

describe('Banner (X5)', () => {
  it('renders title, body and icon (S05 restrict-banner)', () => {
    render(
      <Banner
        testID="banner"
        tone="accent"
        icon="🔒"
        title="재매칭이 제한됐어요"
        cta="확인"
        countdown="23:59:01 후 가능"
      >
        지금은 새 매칭을 시작할 수 없어요.
      </Banner>,
    );
    expect(screen.getByTestId('banner')).toBeTruthy();
    expect(screen.getByText('재매칭이 제한됐어요')).toBeTruthy();
    expect(screen.getByText('지금은 새 매칭을 시작할 수 없어요.')).toBeTruthy();
    expect(screen.getByText('23:59:01 후 가능')).toBeTruthy();
    expect(screen.getByText('🔒')).toBeTruthy();
  });

  it('container uses r-md + p-3 + flex row (base layout)', () => {
    render(
      <Banner testID="banner" tone="info">
        안내 본문
      </Banner>,
    );
    const cls = screen.getByTestId('banner').props.className as string;
    expect(cls).toContain('rounded-md');
    expect(cls).toContain('p-3');
    expect(cls).toContain('flex-row');
  });

  it('tone=accent → accent-soft bg + #f0c4d6 border + accent-deep title (S05)', () => {
    render(
      <Banner testID="banner" tone="accent" title="제한">
        본문
      </Banner>,
    );
    const cls = screen.getByTestId('banner').props.className as string;
    expect(cls).toContain('bg-accent-soft');
    expect(cls).toContain('border-[#f0c4d6]');
    // 제목은 accent-deep 토큰
    expect((screen.getByText('제한').props.className as string)).toContain('text-accent-deep');
  });

  it('tone=warn → warn-soft bg, no border, ink-2 body (S06 warn-bar)', () => {
    render(
      <Banner testID="banner" tone="warn">
        주의가 필요해요
      </Banner>,
    );
    const cls = screen.getByTestId('banner').props.className as string;
    expect(cls).toContain('bg-warn-soft');
    expect(cls).not.toContain('border-[#f0c4d6]');
    expect((screen.getByText('주의가 필요해요').props.className as string)).toContain('text-ink-2');
  });

  it('tone=danger → danger-soft bg + #7a1818 body (S15/S20 danger)', () => {
    render(
      <Banner testID="banner" tone="danger">
        위험 안내
      </Banner>,
    );
    expect((screen.getByTestId('banner').props.className as string)).toContain('bg-danger-soft');
    expect((screen.getByText('위험 안내').props.className as string)).toContain('text-[#7a1818]');
  });

  it('tone=info → info-soft bg + #1f4380 body (S21/S23 info-note/reply-note)', () => {
    render(
      <Banner testID="banner" tone="info">
        중립 안내
      </Banner>,
    );
    expect((screen.getByTestId('banner').props.className as string)).toContain('bg-info-soft');
    expect((screen.getByText('중립 안내').props.className as string)).toContain('text-[#1f4380]');
  });

  it('icon renders inside an icon Badge with tone-matched *-soft circle', () => {
    render(
      <Banner tone="warn" icon="⚠">
        본문
      </Banner>,
    );
    // 아이콘 글리프의 조상 = Badge(icon) 의 warn-soft 원형 컨테이너
    expect(findAncestorWithClass(screen.getByText('⚠'), 'bg-warn-soft')).toContain('rounded-full');
  });

  it('countdown text is tabular-nums', () => {
    render(
      <Banner tone="accent" countdown="00:42:10">
        본문
      </Banner>,
    );
    expect((screen.getByText('00:42:10').props.className as string)).toContain('tabular-nums');
  });

  it('fires onCtaPress when the mini CTA is pressed', () => {
    const onCtaPress = jest.fn();
    render(
      <Banner tone="accent" cta="확인" onCtaPress={onCtaPress}>
        본문
      </Banner>,
    );
    fireEvent.press(screen.getByText('확인'));
    expect(onCtaPress).toHaveBeenCalledTimes(1);
  });

  it('omits icon / cta / countdown areas when not provided', () => {
    render(
      <Banner tone="info">
        본문만 있는 배너
      </Banner>,
    );
    expect(screen.getByText('본문만 있는 배너')).toBeTruthy();
    expect(screen.queryByText('확인')).toBeNull();
  });
});
