import * as React from 'react';
import { Pressable, Text, View, type PressableProps } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { cn } from '../lib/cn';
import { color } from '../tokens';

/**
 * Select (P4) — display-only picker trigger.
 *
 * SSOT: all-screens 와이어프레임 `.s04 .field .select`
 *   width:100%; padding:14px; background:var(--bg-2); border-radius:var(--r-md);
 *   font-size:15px; font-weight:600; color:var(--ink);
 *   display:flex; align-items:center; justify-content:space-between;
 *   .field.locked → color:var(--ink-3); background:var(--bg-3);
 *   placeholder span → color:var(--ink-4); .chev → color:var(--ink-4).
 *
 * 실제 picker(바텀시트/모달) 연결은 화면 담당. 여기서는 선택값/placeholder/
 * locked 상태를 표시하고, `onPress` 로 트리거만 노출하는 표시 컴포넌트다.
 */
export interface SelectProps extends Omit<PressableProps, 'children' | 'style'> {
  /** 현재 선택된 값. 없으면 `placeholder` 를 ink-4 로 표시한다. */
  value?: string;
  /** 미선택 시 표시할 안내 문구 (ink-4). */
  placeholder?: string;
  /**
   * 잠금 상태. 배경 bg-3 + 텍스트 ink-3 으로 표시하고 입력을 막는다.
   * (HTML `.field.locked`)
   */
  locked?: boolean;
  /** Pressable 컨테이너 className 머지. */
  className?: string;
}

export const Select = React.forwardRef<View, SelectProps>(function Select(
  { value, placeholder, locked = false, className, disabled, accessibilityState, ...rest },
  ref,
) {
  const hasValue = value != null && value !== '';
  const isDisabled = disabled || locked;

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, ...accessibilityState }}
      accessibilityValue={hasValue ? { text: value } : undefined}
      disabled={isDisabled}
      className={cn(
        'w-full flex-row items-center justify-between rounded-md p-[14px]',
        locked ? 'bg-bg-3' : 'bg-bg-2',
        className,
      )}
      {...rest}
    >
      <Text
        numberOfLines={1}
        className={cn(
          'flex-1 text-md font-semibold',
          locked ? 'text-ink-3' : hasValue ? 'text-ink' : 'text-ink-4',
        )}
      >
        {hasValue ? value : placeholder}
      </Text>
      <ChevronDown size={18} color={color['ink-4']} accessibilityElementsHidden />
    </Pressable>
  );
});
