import { forwardRef, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { ChevronLeft, X, type LucideIcon } from 'lucide-react-native';

// 직접 파일 경로로 import — 일부 primitive 가 아직 배럴(`../primitives/index`)에
// 등재되기 전이어도 안전하게 컴포지션한다(배럴 등재는 각 primitive 소유 agent 담당).
import { IconButton } from '../primitives/IconButton';
import { Text } from '../primitives/Text';
import { cn } from '../lib/cn';

/**
 * TopNav (X1) — 화면 상단 네비게이션 바.
 *
 * SSOT: all-screens 와이어프레임의 `.nav` CSS(11화면) + 커버리지 매트릭스 §X1.
 * 화면 CSS 원천(공통 패턴 — 분포에서 표준화):
 *  - `.nav`            : display:flex; align-items:center; padding:14px 16px 6px
 *  - `.nav .back/.close`: 32×32 터치 타깃, color var(--ink) → IconButton `ghost`
 *  - `.nav .title`     : 14~15px / weight 600~700 / var(--ink),
 *                        back 옆이면 margin-left 6~8px (S17/S20/S21/S22/S23)
 *  - right slot        : .count pill(S06)·.more 오버플로(S16)·.save 텍스트(S19) 등
 *                        화면마다 다른 액션 → `rightActions` slot 으로 주입(컴포지션)
 *
 * 합성(매트릭스 X1 ← IconButton, Text, Avatar, Badge):
 *  - 좌측 back|close 는 **IconButton**(`ghost`, ink 글리프, 32×32)로 렌더.
 *    임의 좌측 노드가 필요하면 `leftSlot` 으로 IconButton 기본을 대체.
 *  - 타이틀은 **Text**(`h2` 스케일은 너무 커서 nav 전용 14.5px/700 className 적용).
 *  - 우측 액션(IconButton/Badge(count)/Avatar/Button(save))은 caller 가
 *    `rightActions` 로 조립해 넘긴다 — TopNav 는 정렬·간격만 책임진다.
 *
 * 규칙(DS 강제 D-04): inline style / raw hex / StyleSheet 금지. 색·간격은
 * 토큰 className 으로만. HTML 치수(32px·14.5px·6px 등)는 NativeWind 임의값 className.
 */
export type TopNavLeft = 'back' | 'close' | 'none';

/** left 종류 → IconButton 글리프 + 접근성 기본 라벨 (HTML .back '‹' = chevron, .close 'X') */
const LEFT_GLYPH: Record<Exclude<TopNavLeft, 'none'>, LucideIcon> = {
  back: ChevronLeft,
  close: X,
};
const LEFT_LABEL: Record<Exclude<TopNavLeft, 'none'>, string> = {
  back: '뒤로',
  close: '닫기',
};

/**
 * .nav .title: HTML 분포 14~15px / weight 600~700 / var(--ink).
 * Text 의 표준 variant(h2=20px, body=base)와 어긋나는 nav 전용 스케일 →
 * 토큰 스케일 밖 14.5px 를 NativeWind 임의값 className 으로 명시(§3 국소값).
 * back 버튼 옆일 때 HTML margin-left 6~8px → ml-[6px].
 */
const TITLE_CLASS = 'text-[14.5px] font-bold';

export interface TopNavProps extends ViewProps {
  /** 좌측 컨트롤. 기본 `back`. `none` 이면 좌측 IconButton 미렌더. */
  left?: TopNavLeft;
  /** 좌측 컨트롤 탭 핸들러(back/close 공통). */
  onLeftPress?: () => void;
  /** 좌측 컨트롤 접근성 라벨. 미지정 시 left 종류 기본('뒤로'/'닫기'). */
  leftAccessibilityLabel?: string;
  /**
   * 좌측 커스텀 노드(Avatar 등). 지정 시 back|close IconButton 대신 렌더.
   * (S14 멤버 헤더처럼 좌측에 아바타/제목 조합이 오는 케이스)
   */
  leftSlot?: ReactNode;
  /** 가운데/좌측 타이틀 텍스트. 없으면 타이틀 자리를 비운다. */
  title?: string;
  /**
   * 타이틀 아래(또는 단독) 부제. S13a 처럼 제목 없이 부제만(`멤버 N명`)도 가능.
   * title 과 함께 주면 2단(제목 위 / 부제 아래)으로 렌더한다.
   */
  subtitle?: string;
  /**
   * 좌측 그룹(컨트롤+타이틀) 옆에 붙는 보조 노드 — 예: 참여 멤버 AvatarStack.
   * rightActions(우측 끝)와 달리 타이틀 바로 옆(좌측 정렬)에 온다.
   */
  leftAccessory?: ReactNode;
  /** 우측 액션 slot — IconButton/Badge(count)/Avatar/Button 등을 caller 가 조립. */
  rightActions?: ReactNode;
  className?: string;
}

export const TopNav = forwardRef<View, TopNavProps>(function TopNav(
  {
    left = 'back',
    onLeftPress,
    leftAccessibilityLabel,
    leftSlot,
    title,
    subtitle,
    leftAccessory,
    rightActions,
    className,
    ...rest
  },
  ref,
) {
  // 좌측: 커스텀 slot 우선 → 아니면 back|close IconButton → none 이면 자리 placeholder.
  let leftNode: ReactNode = null;
  if (leftSlot != null) {
    leftNode = leftSlot;
  } else if (left !== 'none') {
    leftNode = (
      <IconButton
        glyph={LEFT_GLYPH[left]}
        variant="ghost"
        size={32}
        accessibilityLabel={leftAccessibilityLabel ?? LEFT_LABEL[left]}
        onPress={onLeftPress}
      />
    );
  }

  // back/close 가 있을 때만 타이틀에 margin-left(HTML 6~8px)를 준다.
  const titleHasLeading = leftNode != null;

  return (
    <View
      ref={ref}
      // .nav: align-items center, padding 14px 16px 6px. surface 는 매트릭스 X1
      // 지정값(bg-paper + border-b border-line). 정렬은 좌측·타이틀 | 우측 분리.
      className={cn(
        'flex-row items-center justify-between bg-paper border-b border-line px-[16px] pt-[14px] pb-[6px]',
        className,
      )}
      accessibilityRole="header"
      {...rest}
    >
      {/* 좌측 그룹: 컨트롤 + (타이틀/부제 2단) (HTML .nav 의 좌측 정렬) */}
      <View className="flex-1 flex-row items-center">
        {leftNode}
        {title != null || subtitle != null ? (
          <View className={cn('min-w-0', titleHasLeading && 'ml-[6px]')}>
            {title != null ? (
              <Text tone="ink" numberOfLines={1} className={TITLE_CLASS}>
                {title}
              </Text>
            ) : null}
            {subtitle != null ? (
              <Text tone="ink-3" numberOfLines={1} className="text-[11px] font-semibold">
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
        {/* 좌측 보조 노드(참여 멤버 아바타 스택 등) — 타이틀 옆. */}
        {leftAccessory != null ? <View className="ml-[10px]">{leftAccessory}</View> : null}
      </View>

      {/* 우측 액션 slot — 간격 8px 로 나열(HTML 우측 액션 gap 분포). */}
      {rightActions != null ? (
        <View className="flex-row items-center gap-[8px]">{rightActions}</View>
      ) : null}
    </View>
  );
});

TopNav.displayName = 'TopNav';
