import * as React from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { Search } from 'lucide-react-native';

import { cn } from '../lib/cn';
import { color } from '../tokens';

/**
 * Input — single-line text 입력 primitive (P2).
 *
 * SSOT: all-screens 와이어프레임 (S04 닉네임/생년월일, S06 검색, S16 기타 사유,
 * S20 conditional, S23 분류/이메일).
 *
 *   .field input{
 *     width:100%; padding:14px; background:var(--bg-2); border:0;
 *     border-radius:var(--r-md); font-size:15px; color:var(--ink); font-weight:600
 *   }
 *   .field.locked input{ color:var(--ink-3); background:var(--bg-3) }   ← locked
 *   .field .lbl{ font-size:12px; font-weight:700; color:var(--ink-2); margin-bottom:6px;
 *     display:flex; align-items:center; gap:6px }                       ← label 슬롯
 *   .field .lbl .lock{ color:var(--ink-4); font-size:11px }             ← label 끝 보조
 *   .field .helper{ font-size:11.5px; color:var(--ink-3); margin-top:6px; font-weight:600 } ← helper 슬롯
 *   .s06 .search{ background:var(--bg-2); border-radius:var(--r-md);
 *     padding:12px 14px 12px 40px } .s06 .search .ic{ left:14px; color:var(--ink-3) } ← prefixIcon
 *
 * HTML 의 base 는 `border:0` 이라 default/focus 는 보더가 없다. 매트릭스 P2 명세상
 *  - focus → accent 보더(키보드 포커스 시 강조; HTML 에 명시 CSS 없어 accent ring 으로 표현)
 *  - error → danger 보더(매트릭스 "error=border-danger")
 * 색·크기·굵기는 전부 @dei/ui 토큰 className 으로만 (bg-2 / bg-3 / ink / ink-3 / r-md /
 * danger / accent). HTML 의 px 고정값(14px·15px·11.5px 등)은 토큰 스케일에 없는 1회성
 * 수치라 NativeWind arbitrary value 로 HTML 값 그대로 옮긴다 (inline style / StyleSheet 금지).
 */

export type InputState = 'default' | 'focus' | 'locked' | 'error';

export interface InputProps extends Omit<TextInputProps, 'editable' | 'style'> {
  /**
   * 시각 상태. 기본 `default`.
   *  - `default` bg-2 + 보더 없음
   *  - `focus`   accent 보더(키보드 포커스 강조)
   *  - `locked`  bg-3 + ink-3 + 입력 불가 (HTML `.field.locked`)
   *  - `error`   danger 보더 (매트릭스 P2 "error=border-danger")
   */
  state?: InputState;
  /** true 면 prefix 로 검색 아이콘(magnifier)을 깔고 좌측 패딩을 확보한다 (S06 search). */
  prefixIcon?: boolean;
  /** 읽기 전용. 입력은 막되 잠금 표면색(bg-3)은 입히지 않는다 (S23 분류, S04 생년월일). */
  readonly?: boolean;
  /** 라벨 슬롯 (HTML `.field .lbl`). 입력 위에 ink-2 / 12px / 700 으로 렌더. */
  label?: React.ReactNode;
  /** 라벨 우측 보조 슬롯 (HTML `.lbl .lock` — '🔒 본인인증 자동', 'N / 10' 등). ink-4 / 11px. */
  labelAccessory?: React.ReactNode;
  /** 헬퍼 슬롯 (HTML `.field .helper`). 입력 아래 ink-3 / 11.5px / 600 으로 렌더. */
  helper?: React.ReactNode;
  /** field 컨테이너 className 머지 (field 단위 여백 등을 caller 가 제어). */
  className?: string;
  /** TextInput 자체 className 머지. */
  inputClassName?: string;
  /**
   * TextInput style 머지 — **동적 치수 전용 escape**(예: multiline 자동높이).
   * NativeWind 는 런타임 계산 높이를 className 으로 못 받으므로 DS 내부 컴포저
   * (InputBar 등)에서만 측정 높이를 주입한다. 색/StyleSheet 용도 금지.
   */
  inputStyle?: TextInputProps['style'];
  /** helper 텍스트 className 머지 (예: 성공 시 success 색 — HTML `.helper{color:var(--success)}`). */
  helperClassName?: string;
}

/** HTML `.field input` base — bg-2 / ink / r-md, 14px padding / 15px / weight 600. */
const inputBaseClassName =
  'w-full rounded-md bg-bg-2 px-[14px] py-[14px] text-[17px] font-semibold text-ink';

/** state → 표면/보더 토큰 className (base 위에 머지, tailwind-merge last-wins). */
const STATE_CLASS: Record<InputState, string> = {
  // border:0 — 추가 장식 없음
  default: '',
  // 키보드 포커스 강조: accent 보더 (HTML 명시 없음 → P2 명세상 accent ring)
  focus: 'border border-accent',
  // .field.locked input: bg-3 + ink-3
  locked: 'bg-bg-3 text-ink-3',
  // 매트릭스 P2: error=border-danger
  error: 'border border-danger',
};

/**
 * HTML `.field .lbl` — flex row, gap 6px, margin-bottom 6px (라벨 줄 레이아웃).
 * 타이포(12px / 700 / ink-2)는 내부 Text 에 둔다.
 */
const labelRowClassName = 'mb-[6px] flex-row items-center gap-[6px]';

/** HTML `.lbl .lock` — 11px / ink-4. */
const labelAccessoryClassName = 'text-[13px] text-ink-4';

/** HTML `.field .helper` — 11.5px / 600 / ink-3 / margin-top 6px. */
const helperClassName = 'mt-[6px] text-[13.5px] font-semibold text-ink-3';

/** HTML `.s06 .search`: prefixIcon 시 좌측 패딩 40px 확보 (아이콘 자리). */
const prefixPaddingClassName = 'pl-[40px]';

export const Input = React.forwardRef<TextInput, InputProps>(function Input(
  {
    state = 'default',
    prefixIcon = false,
    readonly = false,
    label,
    labelAccessory,
    helper,
    className,
    inputClassName,
    inputStyle,
    helperClassName: helperClassNameProp,
    placeholderTextColor,
    accessibilityRole = 'text',
    accessibilityState,
    ...rest
  },
  ref,
) {
  const isLocked = state === 'locked';
  // locked 면 입력 불가. readonly 는 입력만 막고 표면은 default 유지(S23 분류).
  const editable = !isLocked && !readonly;

  return (
    <View className={cn(className)}>
      {label != null ? (
        <View className={labelRowClassName}>
          <Text className="text-[14px] font-bold text-ink-2">{label}</Text>
          {labelAccessory != null ? (
            <Text className={labelAccessoryClassName}>{labelAccessory}</Text>
          ) : null}
        </View>
      ) : null}

      <View className="relative justify-center">
        {prefixIcon ? (
          <View
            className="absolute left-[14px] z-10"
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Search size={16} color={color['ink-3']} />
          </View>
        ) : null}
        <TextInput
          ref={ref}
          editable={editable}
          accessibilityRole={accessibilityRole}
          accessibilityState={{ disabled: !editable, ...accessibilityState }}
          placeholderTextColor={placeholderTextColor ?? color['ink-4']}
          className={cn(
            inputBaseClassName,
            STATE_CLASS[state],
            prefixIcon && prefixPaddingClassName,
            inputClassName,
          )}
          style={inputStyle}
          {...rest}
        />
      </View>

      {helper != null ? (
        <Text className={cn(helperClassName, helperClassNameProp)}>{helper}</Text>
      ) : null}
    </View>
  );
});
