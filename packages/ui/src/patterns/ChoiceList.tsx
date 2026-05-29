import { forwardRef, type ReactNode } from 'react';
import { Pressable, View, type ViewProps } from 'react-native';

// 직접 파일 경로로 import — 배럴 등재 순서와 무관하게 안전하게 컴포지션한다
// (각 primitive 의 배럴 등재는 해당 primitive 소유 agent 담당).
import { Radio, type RadioTone } from '../primitives/Radio';
import { Text } from '../primitives/Text';
import { cn } from '../lib/cn';

/**
 * ChoiceList (X13) — 라디오 선택 목록(사유 / 카테고리).
 *
 * SSOT: all-screens 와이어프레임 + 커버리지 매트릭스 §X13. 화면 CSS 원천:
 *  - S16 `.reasons .r`  : 방 이탈 사유(tone=ink). bg-2 표면, 선택 시 paper + ink-2 보더.
 *      `.r{gap:10px; padding:11px 12px; background:var(--bg-2); r-md; 12.5px ink-2 600}`
 *      `.r.sel{background:var(--paper); border:1px solid var(--ink-2)}`
 *      `.r.sel .rd{border-color:var(--ink); background:var(--ink); inset white}`
 *  - S20 `.reasons .r`  : 탈퇴 사유(tone=danger). paper + line 보더, 선택 시 danger 보더.
 *      `.r{gap:11px; padding:13px 14px; border:1px solid var(--line); background:var(--paper); 13px ink-2}`
 *      `.r.sel{border-color:var(--danger); color:var(--ink)}`
 *      `.r.sel .rd{border-color/background:var(--danger); inset white}` + `.etc-input`(조건부 Input)
 *  - S21 `.cats .c`     : 신고 카테고리(tone=accent). paper + line 보더, 선택 시 accent 보더.
 *      `.c{gap:11px; padding:13px 14px; border:1px solid var(--line); background:var(--paper); 13.5px ink-2}`
 *      `.c.sel{border-color:var(--accent); color:var(--ink)}`
 *      `.c.sel .rd{border-color/background:var(--accent); inset white}` + `.etc textarea`(조건부)
 *
 * 두 가지 행 표면이 있다:
 *  - tone=ink (S16) : bg-2 base, 선택 시 paper + ink-2 보더 (배경이 바뀐다).
 *  - tone=danger/accent (S20/S21) : paper + line base, 선택 시 tone 보더 (보더 색만 바뀐다).
 * tone 이 행 표면·라디오 채움·선택 보더를 동시에 가른다 (HTML 의 .sel 분기 그대로).
 *
 * 합성:
 *  - 각 행의 인디케이터는 **Radio**(P10). 선택 시 tone 색 inset-fill 링.
 *  - 라벨은 **Text**. 선택 시 ink 로 진해진다(HTML `.sel{color:var(--ink)}`).
 *  - `conditionalInput` 은 특정 옵션('기타' 등) 선택 시에만 노출되는 입력 슬롯.
 *    Input/Textarea primitive 를 caller 가 ReactNode 로 주입한다(S20 `.etc-input`,
 *    S21 `.etc textarea`). 어떤 옵션에서 노출할지는 `value` 로 결정한다.
 *
 * 규칙(DS 강제 D-04): inline style / raw hex / StyleSheet 금지. 색은 토큰
 * className 으로만. HTML 치수(11/12/13/14px·gap)는 NativeWind 임의값 className.
 */

/** ChoiceList tone — 행 표면·선택 보더·Radio 채움을 동시에 가른다. */
export type ChoiceListTone = RadioTone; // 'ink' | 'accent' | 'danger'

export interface ChoiceOption {
  /** 옵션 식별값(onChange 로 돌려주는 값, conditionalInput 노출 판정 키). */
  value: string;
  /** 행에 표시할 라벨. */
  label: ReactNode;
  /**
   * 이 옵션 선택 시 라벨 아래 노출할 조건부 입력 슬롯(예: '기타' 자유 입력).
   * Input(S20) / Textarea(S21) primitive 를 caller 가 주입. value 가 이 옵션일
   * 때만 렌더된다. 지정하지 않으면 조건부 입력 없음.
   */
  conditionalInput?: ReactNode;
}

export interface ChoiceListProps extends Omit<ViewProps, 'children'> {
  /** 선택 옵션 목록. */
  options: ChoiceOption[];
  /** 현재 선택된 옵션의 value. 미선택은 undefined/null. */
  value?: string | null;
  /** 옵션 선택 시 콜백(선택된 value 전달). */
  onChange?: (value: string) => void;
  /**
   * 톤. 기본 `ink`.
   *  - `ink`    S16 방 이탈 사유 (bg-2 표면 → 선택 시 paper + ink-2 보더)
   *  - `danger` S20 탈퇴 사유 (paper+line 표면 → 선택 시 danger 보더)
   *  - `accent` S21 신고 카테고리 (paper+line 표면 → 선택 시 accent 보더)
   */
  tone?: ChoiceListTone;
  /** 컨테이너 className 머지(목록 단위 여백 등을 caller 가 제어). */
  className?: string;
}

/**
 * tone=ink(S16) 여부 — bg-2 표면 행. 나머지(danger/accent)는 paper+line 표면 행.
 * HTML 에서 S16 만 .r 의 base 배경이 bg-2 이고 선택 시 paper 로 바뀐다.
 */
function isFilledSurfaceTone(tone: ChoiceListTone): boolean {
  return tone === 'ink';
}

/** 선택 시 행 보더 색 토큰 className (HTML `.sel` 의 border-color). 정적 리터럴 분기. */
const SELECTED_BORDER: Record<ChoiceListTone, string> = {
  // S16 .r.sel: border 1px solid var(--ink-2)
  ink: 'border border-ink-2',
  // S21 .c.sel: border-color var(--accent)
  accent: 'border-accent',
  // S20 .r.sel: border-color var(--danger)
  danger: 'border-danger',
};

/**
 * 행 컨테이너 className.
 *  - ink(S16)    : 비선택 bg-2(보더 없음) → 선택 paper + ink-2 보더.
 *  - danger/accent(S20·S21): paper + line 보더 상시 → 선택 시 tone 보더로 교체.
 * gap/padding 은 S16(10/11·12) 과 S20·S21(11/13·14) 가 다르나, 시각 일관성·
 * 토큰 폭발 방지를 위해 paper-surface 톤군을 13/14·gap-11 로 통일(매트릭스 X13).
 */
function rowClass(tone: ChoiceListTone, selected: boolean): string {
  if (isFilledSurfaceTone(tone)) {
    // S16: bg-2 base, 선택 시 paper + ink-2 보더(배경 전환).
    return cn(
      'flex-row items-center gap-[10px] rounded-md px-[12px] py-[11px]',
      selected ? cn('bg-paper', SELECTED_BORDER.ink) : 'bg-bg-2',
    );
  }
  // S20/S21: paper + line base, 선택 시 tone 보더.
  return cn(
    'flex-row items-center gap-[11px] rounded-md border bg-paper px-[14px] py-[13px]',
    selected ? SELECTED_BORDER[tone] : 'border-line',
  );
}

/**
 * 라벨 Text className. 비선택 ink-2, 선택 시 ink(HTML `.sel{color:var(--ink)}`).
 * 크기는 HTML 12.5~13.5px → 토큰 스케일 caption(sm) 으로 정렬.
 */
function labelClass(selected: boolean): string {
  return cn('flex-1 text-sm font-semibold', selected ? 'text-ink' : 'text-ink-2');
}

export const ChoiceList = forwardRef<View, ChoiceListProps>(function ChoiceList(
  { options, value, onChange, tone = 'ink', className, ...rest },
  ref,
) {
  return (
    <View
      ref={ref}
      accessibilityRole="radiogroup"
      // HTML .reasons/.cats: flex-column, gap 6~8px → 8px 로 정렬.
      className={cn('gap-[8px]', className)}
      {...rest}
    >
      {options.map((option) => {
        const selected = value != null && option.value === value;
        return (
          <View key={option.value}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              onPress={() => onChange?.(option.value)}
              className={rowClass(tone, selected)}
            >
              {/* 인디케이터 — Radio(P10). tone 별 inset-fill 링. 행 Pressable 이
                  이미 radio 역할을 가지므로(중복 a11y 방지) Radio 는 순수 시각
                  요소로 처리: pointerEvents none + 접근성 트리에서 숨김. */}
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Radio selected={selected} tone={tone} />
              </View>
              <Text className={labelClass(selected)}>{option.label}</Text>
            </Pressable>

            {/* 조건부 입력 슬롯('기타' 등) — 해당 옵션 선택 시에만 노출(S20/S21). */}
            {selected && option.conditionalInput != null ? (
              <View className="mt-[8px]">{option.conditionalInput}</View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
});

ChoiceList.displayName = 'ChoiceList';
