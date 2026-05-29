import { forwardRef, useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { cn } from '../lib/cn';

/**
 * Textarea — multiline 입력 primitive (P3).
 *
 * SSOT: all-screens 와이어프레임 `.s04 .field textarea` / `.s23 .field textarea`
 * (S04b 자기소개, S21 신고 기타, S23 문의 내용).
 *
 *   .field textarea{
 *     width:100%; padding:14px; background:var(--bg-2); border:0;
 *     border-radius:var(--r-md); font-size:14px; color:var(--ink);
 *     outline:0; resize:none; min-height:80px; line-height:1.45
 *   }
 *   .charcount{ font-size:10.5px; color:var(--ink-4); text-align:right; margin-top:4px }
 *
 * 색은 토큰 className 으로만 (bg-2 / ink / ink-4 / r-md). HTML 의 px 고정값
 * (14px·10.5px·min-height 80px) 은 토큰 스케일에 없는 1회성 수치라 NativeWind
 * arbitrary value 로 HTML 값 그대로 옮긴다 (inline style / StyleSheet 금지).
 */

export interface TextareaProps
  extends Omit<TextInputProps, 'multiline' | 'style'> {
  /** 최대 입력 글자 수. showCount 가 켜지면 'N / max' 로 표시된다. */
  maxLength?: number;
  /** true 면 우하단에 'N / maxLength' 글자 수를 표시한다 (S04b/S23). */
  showCount?: boolean;
  /** 컨테이너 className 머지 (field 단위 여백 등을 caller 가 제어). */
  className?: string;
  /** TextInput 자체 className 머지. */
  inputClassName?: string;
}

/** HTML `.field textarea` — bg-2 / ink / r-md, 14px / line-height 1.45 / min-height 80px. */
const inputBaseClassName =
  'w-full rounded-md bg-bg-2 px-[14px] py-[14px] text-base text-ink ' +
  'min-h-[80px] leading-[20px]';

/** HTML `.charcount` — 10.5px / ink-4 / 우측 정렬 / margin-top 4px. */
const countClassName = 'mt-1 text-right text-[10.5px] text-ink-4';

export const Textarea = forwardRef<TextInput, TextareaProps>(
  (
    {
      maxLength,
      showCount = false,
      className,
      inputClassName,
      value,
      defaultValue,
      onChangeText,
      placeholderTextColor,
      accessibilityRole = 'text',
      ...rest
    },
    ref,
  ) => {
    // controlled / uncontrolled 둘 다에서 글자 수를 셀 수 있게 내부 상태를 둔다.
    const [internalValue, setInternalValue] = useState(defaultValue ?? '');
    const text = value ?? internalValue;

    const handleChangeText = (next: string) => {
      if (value === undefined) {
        setInternalValue(next);
      }
      onChangeText?.(next);
    };

    return (
      <View className={cn(className)}>
        <TextInput
          ref={ref}
          multiline
          value={value}
          defaultValue={value === undefined ? defaultValue : undefined}
          onChangeText={handleChangeText}
          maxLength={maxLength}
          textAlignVertical="top"
          accessibilityRole={accessibilityRole}
          placeholderTextColor={placeholderTextColor}
          className={cn(inputBaseClassName, inputClassName)}
          {...rest}
        />
        {showCount ? (
          <Text className={countClassName}>
            {`${text.length} / ${maxLength ?? ''}`.trim()}
          </Text>
        ) : null}
      </View>
    );
  },
);

Textarea.displayName = 'Textarea';
