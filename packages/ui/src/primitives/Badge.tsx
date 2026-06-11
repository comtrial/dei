import * as React from 'react';
import { View, Text, type ViewProps } from 'react-native';

import { cn } from '../lib/cn';

/**
 * Badge — P7 (커버리지 매트릭스 §P7).
 *
 * SSOT: all-screens 와이어프레임 `.age-tag`/`.req`/`.lock-pill`/`.count`/
 * `.av-me .badge`/`.price .badge`/`IconBadge` CSS + ds-elements-extracted.json.
 *
 * 작은 상태/메타 표시용 pill·dot·원형 아이콘 컨테이너. 모든 시각 토큰은
 * `@dei/ui` preset 의 className 으로만 표현한다 (raw hex / inline style 금지).
 *
 * variant
 *  - `age`      합성 칩: ink pill + 내부 accent inner pill (S02 19+ 이용불가)
 *  - `required` 인라인 라벨 '필수'(accent) / '선택'(tone=info→ink-3 muted)
 *  - `lock`     pill (🔒 메타). on-dark 표면에서 사용 (S09/S10 blur 게이트)
 *  - `count`    bg-2 카운트 pill 'N / 5' (S06 nav)
 *  - `dot`      11px 원형 상태 점 (paper 링) — 프로필 미완료 등
 *  - `discount` accent 텍스트 + accent 12% 배경 pill '12% 할인' (S17)
 *  - `icon`     원형 *-soft 배경 + 중앙 글리프 (IconBadge: 알림/경고/성공 등)
 *
 * tone (variant=icon|required 등 색을 가르는 변형에 적용)
 *  - `accent` | `warn` | `danger` | `info`
 */
export type BadgeVariant =
  | 'age'
  | 'required'
  | 'lock'
  | 'count'
  | 'dot'
  | 'discount'
  | 'icon';

export type BadgeTone = 'accent' | 'warn' | 'danger' | 'info';

/** tone → icon 변형의 *-soft 배경 + 전경 색 토큰 className */
const ICON_TONE: Record<BadgeTone, string> = {
  accent: 'bg-accent-soft',
  warn: 'bg-warn-soft',
  danger: 'bg-danger-soft',
  info: 'bg-info-soft',
};

const ICON_TONE_FG: Record<BadgeTone, string> = {
  accent: 'text-accent',
  warn: 'text-warn',
  danger: 'text-danger',
  info: 'text-info',
};

/**
 * discount 배경은 accent 12% (HTML `rgba(255,45,111,.12)`).
 * §3: 1회성 국소색 → 토큰 폭발 방지 위해 컴포넌트 상수(불투명도 유틸)로 처리.
 */
const DISCOUNT_BG = 'bg-accent/[0.12]';

export interface BadgeProps extends ViewProps {
  variant?: BadgeVariant;
  /** icon/required 등 색 변형. 기본 accent. */
  tone?: BadgeTone;
  /** pill/icon/discount 라벨 또는 글리프. dot 변형은 무시. */
  children?: React.ReactNode;
  className?: string;
  /** 라벨 Text 에 머지할 className (글리프 색/크기 미세조정용). */
  textClassName?: string;
}

/** 변형별 컨테이너 className (HTML CSS 값 그대로) */
function containerClass(variant: BadgeVariant, tone: BadgeTone): string {
  switch (variant) {
    // .age-tag: bg ink, white, r-full, padding 5px 12px, gap 6px
    case 'age':
      return 'flex-row items-center gap-[6px] self-start rounded-full bg-ink px-[12px] py-[5px]';
    // .req: 인라인 라벨 — 컨테이너 장식 없음 (텍스트만)
    case 'required':
      return 'flex-row items-center';
    // .lock-pill: on-dark, white@10% bg, r-full, padding 5px 12px, gap 6px
    case 'lock':
      return 'flex-row items-center gap-[6px] self-center rounded-full bg-white/10 px-[12px] py-[5px]';
    // .count: bg-2, r-full, padding 4px 10px
    case 'count':
      return 'flex-row items-center rounded-full bg-bg-2 px-[10px] py-[4px]';
    // .av-me .badge: 11x11 accent circle + 2px paper border
    case 'dot':
      return 'h-[11px] w-[11px] rounded-full border-2 border-paper bg-accent';
    // .price .badge: accent 12% bg, r-full, padding 2px 6px
    case 'discount':
      return cn('flex-row items-center rounded-full px-[6px] py-[2px]', DISCOUNT_BG);
    // IconBadge: 원형 *-soft 배경 + 중앙 글리프 (28x28 기본 — IconCircleBg)
    case 'icon':
      return cn('h-[28px] w-[28px] items-center justify-center rounded-full', ICON_TONE[tone]);
  }
}

/** 변형별 라벨 Text className */
function labelClass(variant: BadgeVariant, tone: BadgeTone): string {
  switch (variant) {
    case 'age':
      return 'text-[13px] font-bold text-white';
    // .req: 11px/700 accent; .optional → ink-3 (tone=info 로 muted 표현)
    case 'required':
      return cn('text-[13px] font-bold', tone === 'info' ? 'text-ink-3' : 'text-accent');
    // .lock-pill: 11px/600 white@80%
    case 'lock':
      return 'text-[13px] font-semibold text-white/80';
    // .count: 11px/600 ink-3
    case 'count':
      return 'text-[13px] font-semibold text-ink-3';
    // .price .badge: 9.5px/700 accent, 심사 대응으로 +2px
    case 'discount':
      return 'text-[11.5px] font-bold text-accent';
    // IconBadge glyph: 14px, tone 전경색
    case 'icon':
      return cn('text-[16px]', ICON_TONE_FG[tone]);
    case 'dot':
      return '';
  }
}

/**
 * age 변형 내부 accent inner pill (.age-tag .pill):
 * accent bg, white, padding 1px 6px, r-full, 10px.
 * children 이 [base, inner] 배열이면 두 번째를 inner pill 로 렌더.
 */
const AgeBadge = React.forwardRef<View, BadgeProps>(function AgeBadge(
  { children, className, textClassName, accessibilityRole, ...rest },
  ref,
) {
  const items = React.Children.toArray(children);
  const base = items[0];
  const inner = items[1];
  return (
    <View
      ref={ref}
      className={cn(containerClass('age', 'accent'), className)}
      accessibilityRole={accessibilityRole}
      {...rest}
    >
      {base != null ? (
        <Text className={cn(labelClass('age', 'accent'), textClassName)}>{base}</Text>
      ) : null}
      {inner != null ? (
        <View className="rounded-full bg-accent px-[6px] py-[1px]">
          <Text className="text-[12px] text-white">{inner}</Text>
        </View>
      ) : null}
    </View>
  );
});

/**
 * Badge primitive.
 */
export const Badge = React.forwardRef<View, BadgeProps>(function Badge(
  {
    variant = 'count',
    tone = 'accent',
    children,
    className,
    textClassName,
    accessibilityRole,
    ...rest
  },
  ref,
) {
  if (variant === 'age') {
    return (
      <AgeBadge
        ref={ref}
        tone={tone}
        className={className}
        textClassName={textClassName}
        accessibilityRole={accessibilityRole}
        {...rest}
      >
        {children}
      </AgeBadge>
    );
  }

  // dot 은 라벨 없는 순수 상태 점.
  if (variant === 'dot') {
    return (
      <View
        ref={ref}
        className={cn(containerClass('dot', tone), className)}
        accessibilityRole={accessibilityRole}
        {...rest}
      />
    );
  }

  return (
    <View
      ref={ref}
      className={cn(containerClass(variant, tone), className)}
      accessibilityRole={accessibilityRole}
      {...rest}
    >
      <Text className={cn(labelClass(variant, tone), textClassName)}>{children}</Text>
    </View>
  );
});
