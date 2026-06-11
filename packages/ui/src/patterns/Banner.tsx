import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { cn } from '../lib/cn';
import { Badge } from '../primitives/Badge';
import { Button } from '../primitives/Button';
import { Text } from '../primitives/Text';

/**
 * Banner (X5) — 화면 내 인라인 안내/경고 스트립 패턴.
 *
 * SSOT: all-screens 와이어프레임 — 13화면에 흩어진 톤별 인라인 안내 박스의 전수 통합.
 *  - accent : `.s05 .restrict-banner` — accent-soft bg + 보더 + 아이콘 원형 + 제목/카운트다운 + cta-mini
 *  - warn   : `.s06 .warn-bar`        — warn-soft bg, warn 아이콘, ink-2 본문 (보더 없음)
 *  - danger : `.sLR .danger`(S15) / `.s20 .danger` — danger-soft bg, danger 강조, #7a1818 본문
 *  - info   : `.s21 .info-note` / `.s23 .reply-note` / `.sPF .assure`
 *             — info-soft bg, info 아이콘, #1f4380 본문 (S07/S08/S16/S17/S18/S22 안내 톤 흡수)
 *
 * 커버리지 매트릭스 §X5: Badge(icon) + Text + Button(mini) 합성. 등장 화면
 *  S05,S06,S07a,S08,S09,S15,S16,S17,S18,S20,S21,S22,S23.
 *
 * 규칙(DS 강제 D-04): 표면/간격/반경은 전부 @dei/ui 토큰 className 으로만 표현하며
 * raw hex / inline style / StyleSheet 금지.
 *  - 배경은 톤별 `*-soft` 토큰.
 *  - 톤별 보더·본문 텍스트 색은 매트릭스 §3B 결정에 따라 **패턴 내부 상수**로 격리한다
 *    (semantic 토큰까지 확장하면 토큰 폭발 → accent-deep 류와 통합은 추후 합의 대상).
 *    NativeWind arbitrary-value className(`border-[#…]` / `text-[#…]`)으로 적용하므로
 *    inline style 이 아니며 DS 규칙 위반이 아니다(Badge 의 `bg-accent/[0.12]` 와 동일 방식).
 */
export type BannerTone = 'accent' | 'warn' | 'danger' | 'info';

export interface BannerProps extends Omit<ViewProps, 'children'> {
  /**
   * 시각 톤. 기본 `info`.
   *  - `accent` : 제한/혜택 강조 (S05 재매칭 제한 — 보더 + cta-mini + 카운트다운)
   *  - `warn`   : 주의 안내 (S06 멤버 초대)
   *  - `danger` : 위험/경고 (S15 정책, S20 신고 사유)
   *  - `info`   : 중립 안내 (S21 info-note, S23 reply-note, sPF assure)
   */
  tone?: BannerTone;
  /** 좌측 아이콘 글리프(이모지/문자/⚠/ℹ 등). 없으면 아이콘 영역 미표시. */
  icon?: React.ReactNode;
  /** 제목(굵은 한 줄). accent 톤의 `.restrict-banner .t` 등. 없으면 미표시. */
  title?: React.ReactNode;
  /** 본문/설명. 다중 라인 허용. */
  children?: React.ReactNode;
  /**
   * 우측 mini CTA 라벨 (예: S05 '확인'). 지정 시 Button(mini-pill) 렌더.
   * 본문이 길어도 CTA 는 우측에 밀착 정렬된다.
   */
  cta?: React.ReactNode;
  /** CTA 핸들러. */
  onCtaPress?: () => void;
  /**
   * 카운트다운/시간 문자열 (예: '23:59:01 후 가능'). 본문 아래 tabular-nums 로 렌더.
   * accent 재매칭 제한 배너의 `.d`(`font-variant-numeric:tabular-nums`) 대응.
   */
  countdown?: React.ReactNode;
  className?: string;
}

/**
 * 톤 → 컨테이너 배경 토큰 className (*-soft).
 * (info-note 의 bg-2 변형이 아닌 info-soft 를 정규로 채택 — reply-note/assure 와 통일)
 */
const TONE_BG: Record<BannerTone, string> = {
  accent: 'bg-accent-soft',
  warn: 'bg-warn-soft',
  danger: 'bg-danger-soft',
  info: 'bg-info-soft',
};

/**
 * 톤 → 보더 className. accent 배너만 보더 존재(`.restrict-banner border 1px #f0c4d6`).
 * §3B: `#f0c4d6` 은 accent-soft 의 진한 변형(국소색) → 패턴 내부 상수로 격리.
 */
const TONE_BORDER: Record<BannerTone, string> = {
  accent: 'border border-[#f0c4d6]',
  warn: '',
  danger: '',
  info: '',
};

/**
 * 톤 → 본문 텍스트 색 className.
 * §3B 결정에 따라 톤별 본문색은 패턴 내부 상수(arbitrary-value)로 격리:
 *  - accent : `.restrict-banner .d` color #7a1d3e
 *  - danger : `.danger`            color #7a1818
 *  - info   : `.reply-note`/`.assure` color #1f4380 (S23/sPF 통일)
 *  - warn   : `.warn-bar`          color var(--ink-2) → 토큰 text-ink-2 사용
 */
const TONE_BODY_TEXT: Record<BannerTone, string> = {
  accent: 'text-[#7a1d3e]',
  warn: 'text-ink-2',
  danger: 'text-[#7a1818]',
  info: 'text-[#1f4380]',
};

/**
 * 톤 → 제목 텍스트 색 className.
 *  - accent : `.restrict-banner .t` color var(--accent-deep) → 토큰
 *  - danger : `.s20 .danger b`       color var(--danger)     → 토큰
 *  - warn   : `.warn-bar b`          color var(--ink)        → 토큰
 *  - info   : `.assure b`            color #0d2d5e (info-deep 국소색)
 */
const TONE_TITLE_TEXT: Record<BannerTone, string> = {
  accent: 'text-accent-deep',
  warn: 'text-ink',
  danger: 'text-danger',
  info: 'text-[#0d2d5e]',
};

/** 톤 → 아이콘 Badge tone (Badge icon variant 의 *-soft 원형 + 전경색). */
const TONE_ICON: Record<BannerTone, BannerTone> = {
  accent: 'accent',
  warn: 'warn',
  danger: 'danger',
  info: 'info',
};

/**
 * X5 Banner.
 *
 * 레이아웃: 가로 flex-row, 좌측 아이콘 → 본문(flex-1) → 우측 CTA.
 * `.restrict-banner`(p 12/14, gap 11) 를 기준 간격으로 채택 — r-md p-3 기조.
 */
export const Banner = React.forwardRef<View, BannerProps>(function Banner(
  {
    tone = 'info',
    icon,
    title,
    children,
    cta,
    onCtaPress,
    countdown,
    className,
    accessibilityRole = 'alert',
    ...rest
  },
  ref,
) {
  const bodyTextClass = TONE_BODY_TEXT[tone];
  return (
    <View
      ref={ref}
      accessibilityRole={accessibilityRole}
      // .restrict-banner: r-md, padding 12/14, 가로 정렬 gap 11
      className={cn(
        'flex-row items-center gap-[11px] rounded-md p-3',
        TONE_BG[tone],
        TONE_BORDER[tone],
        className,
      )}
      {...rest}
    >
      {/* 좌측 아이콘: Badge(icon) 원형 *-soft + 톤 전경 글리프 (.restrict-banner .ic / .ic) */}
      {icon != null ? <Badge variant="icon" tone={TONE_ICON[tone]}>{icon}</Badge> : null}

      {/* 본문 영역(.txt flex:1): 제목 + 설명 + 카운트다운 */}
      <View className="flex-1">
        {title != null ? (
          <Text className={cn('text-[14.5px] font-bold leading-[1.3]', TONE_TITLE_TEXT[tone])}>
            {title}
          </Text>
        ) : null}
        {children != null ? (
          <Text
            className={cn(
              'text-[13.5px] leading-[1.5]',
              bodyTextClass,
              title != null && 'mt-[2px]',
            )}
          >
            {children}
          </Text>
        ) : null}
        {countdown != null ? (
          // .restrict-banner .d: tabular-nums 카운트다운/시간
          <Text
            tabularNums
            className={cn('mt-[2px] text-[13px] leading-[1.3]', bodyTextClass)}
          >
            {countdown}
          </Text>
        ) : null}
      </View>

      {/* 우측 mini CTA(.cta-mini): accent pill. flex-shrink-0 로 본문에 밀리지 않음 */}
      {cta != null ? (
        <View className="shrink-0">
          <Button variant="mini-pill" onPress={onCtaPress}>
            {cta}
          </Button>
        </View>
      ) : null}
    </View>
  );
});

Banner.displayName = 'Banner';
