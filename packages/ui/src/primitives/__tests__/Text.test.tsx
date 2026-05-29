import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text } from '../Text';

// 렌더 + 핵심 variant + 토큰 className 적용을 단언한다.
// (NativeWind 가 실제로 className 을 스타일로 변환하는 건 앱 런타임/preset 의 몫이고,
//  여기서는 P14 명세의 variant/tone → 토큰 클래스 매핑이 정확한지를 검증한다.)
function classOf(node: ReturnType<typeof screen.getByText>): string {
  return String(node.props.className ?? '');
}

describe('P14 Text', () => {
  it('renders children', () => {
    render(<Text>도이</Text>);
    expect(screen.getByText('도이')).toBeTruthy();
  });

  it('default variant=body → text-base/font-medium, default tone ink-3', () => {
    render(<Text>본문</Text>);
    const cls = classOf(screen.getByText('본문'));
    expect(cls).toContain('text-base');
    expect(cls).toContain('font-medium');
    expect(cls).toContain('text-ink-3');
  });

  it('variant=logo → display 스케일 + black weight + tracking', () => {
    render(<Text variant="logo">dei</Text>);
    const cls = classOf(screen.getByText('dei'));
    expect(cls).toContain('text-display');
    expect(cls).toContain('font-black');
    expect(cls).toContain('tracking-tighter');
    // logo 기본 톤 = ink
    expect(cls).toContain('text-ink');
  });

  it('variant=eyebrow → xs/extrabold/uppercase, 기본 톤 accent', () => {
    render(<Text variant="eyebrow">KICKER</Text>);
    const cls = classOf(screen.getByText('KICKER'));
    expect(cls).toContain('text-xs');
    expect(cls).toContain('font-extrabold');
    expect(cls).toContain('uppercase');
    expect(cls).toContain('text-accent');
  });

  it('tone prop 이 variant 기본 톤을 덮어쓴다', () => {
    render(
      <Text variant="body" tone="accent">
        강조
      </Text>,
    );
    const cls = classOf(screen.getByText('강조'));
    expect(cls).toContain('text-accent');
    expect(cls).not.toContain('text-ink-3');
  });

  it('tabularNums → tabular-nums 클래스 추가', () => {
    render(
      <Text variant="meta" tabularNums>
        23:32
      </Text>,
    );
    const cls = classOf(screen.getByText('23:32'));
    expect(cls).toContain('tabular-nums');
  });

  it('className prop 이 머지된다(cn last-wins 허용)', () => {
    render(<Text className="mt-4">여백</Text>);
    expect(classOf(screen.getByText('여백'))).toContain('mt-4');
  });

  it('heading variant 은 header role', () => {
    render(<Text variant="h1">제목</Text>);
    expect(screen.getByRole('header')).toBeTruthy();
  });
});
