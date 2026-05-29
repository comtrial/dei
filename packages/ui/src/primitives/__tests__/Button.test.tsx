import { fireEvent, render, screen } from '@testing-library/react-native';
import type { View } from 'react-native';

import { Button } from '../Button';

// 렌더 + 핵심 variant 토큰 className 매핑 + 상호작용을 단언한다.
// (NativeWind 가 className → 스타일로 변환하는 건 앱 런타임의 몫; 여기서는 P1 명세대로
//  variant/size/disabled → 토큰 클래스가 정확히 붙는지 검증.)

describe('Button (P1)', () => {
  it('renders label and has button accessibility role', () => {
    render(
      <Button testID="btn" onPress={() => {}}>
        다시 시도
      </Button>,
    );
    const node = screen.getByTestId('btn');
    expect(node).toBeTruthy();
    expect(node.props.accessibilityRole).toBe('button');
    expect(screen.getByText('다시 시도')).toBeTruthy();
  });

  it('default variant=ink → bg-ink (검정), accent 아님', () => {
    render(
      <Button testID="btn">primary</Button>,
    );
    const cls = screen.getByTestId('btn').props.className as string;
    expect(cls).toContain('bg-ink');
    expect(cls).toContain('rounded-md');
    expect(cls).not.toContain('bg-accent');
    // 라벨은 흰색 700
    const labelCls = screen.getByText('primary').props.className as string;
    expect(labelCls).toContain('text-white');
    expect(labelCls).toContain('font-bold');
  });

  it('variant=accent → bg-accent + white 라벨', () => {
    render(
      <Button testID="btn" variant="accent">
        결제
      </Button>,
    );
    expect((screen.getByTestId('btn').props.className as string)).toContain('bg-accent');
    expect((screen.getByText('결제').props.className as string)).toContain('text-white');
  });

  it('variant=secondary → bg-2 배경 + ink-2 라벨 600', () => {
    render(
      <Button testID="btn" variant="secondary">
        취소
      </Button>,
    );
    expect((screen.getByTestId('btn').props.className as string)).toContain('bg-bg-2');
    const labelCls = screen.getByText('취소').props.className as string;
    expect(labelCls).toContain('text-ink-2');
    expect(labelCls).toContain('font-semibold');
  });

  it('variant=mini-pill → rounded-full + 자체 패딩/글자크기', () => {
    render(
      <Button testID="btn" variant="mini-pill">
        업그레이드
      </Button>,
    );
    const cls = screen.getByTestId('btn').props.className as string;
    expect(cls).toContain('rounded-full');
    expect(cls).toContain('bg-accent');
    // mini-pill 자체 패딩(7/12) — md 기본 패딩(16/18) 미적용
    expect(cls).toContain('py-[7px]');
    expect(cls).not.toContain('py-[16px]');
    expect((screen.getByText('업그레이드').props.className as string)).toContain('text-[11.5px]');
  });

  it('fullWidth → w-full', () => {
    render(
      <Button testID="btn" fullWidth>
        넓게
      </Button>,
    );
    expect((screen.getByTestId('btn').props.className as string)).toContain('w-full');
  });

  it('disabled → opacity-40 + accessibilityState disabled + onPress 차단', () => {
    const onPress = jest.fn();
    render(
      <Button testID="btn" disabled onPress={onPress}>
        비활성
      </Button>,
    );
    const node = screen.getByTestId('btn');
    expect((node.props.className as string)).toContain('opacity-40');
    expect(node.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    fireEvent.press(node);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('fires onPress when enabled', () => {
    const onPress = jest.fn();
    render(
      <Button testID="btn" onPress={onPress}>
        탭
      </Button>,
    );
    fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('merges caller className (last wins via cn)', () => {
    render(
      <Button testID="btn" className="bg-accent">
        override
      </Button>,
    );
    const cls = screen.getByTestId('btn').props.className as string;
    // tailwind-merge: 충돌 배경은 caller 가 승리(bg-ink → bg-accent).
    expect(cls).toContain('bg-accent');
    expect(cls).not.toContain('bg-ink');
  });

  it('forwards ref to the underlying pressable', () => {
    const ref = { current: null as View | null };
    render(
      <Button ref={ref} testID="btn">
        ref
      </Button>,
    );
    expect(ref.current).not.toBeNull();
  });
});
