import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { cn } from '../lib/cn';
import { Button } from '../primitives/Button';
import { Spinner } from '../primitives/Spinner';
import { Text } from '../primitives/Text';

/**
 * StateView (X6) — 화면 중앙 상태 표시 패턴 (로딩 / 빈 상태 / 오류).
 *
 * SSOT: all-screens 와이어프레임의 중앙 정렬 body 들
 *  - `.s01 .body` (loading)  : 세로 중앙 정렬 + 36px Spinner + logo/copy  (CenteredStatusBody)
 *  - `.s07 .body` (empty)    : `align-items:center;justify-content:center` + 아이콘 + h2 + desc (CenteredHeroBody)
 *  - `.s09 .body` (empty/잠금): 동일 중앙 정렬 빈 상태 (EmptyStateLayout)
 *  - `.s03f .body`(error)    : `.ic` danger-soft 원형 64×64 + h2 + desc + CTA (CenteredErrorBody)
 *
 * 커버리지 매트릭스 §X6: Spinner/Badge(icon) + Text + Button 합성. 6화면
 * (S01,S03,S03f,S07,S09,S13 blob). 모든 표면·간격·색은 @dei/ui 토큰 className
 * 으로만 표현한다 (raw hex / inline style 금지, DS D-04).
 *
 * 레이아웃(공통):
 *  - 컨테이너: `flex-1`, 세로/가로 중앙 정렬(`items-center justify-center`), text-center,
 *    좌우 패딩 32px (HTML body padding 32px).
 *  - icon: error → `.ic` danger-soft 원형 64×64 + 글리프 32px / 그 외 → 64px 글리프 (`.s07 .core` 류).
 *  - title: `.h2` 22/800 ink (가운데 정렬).
 *  - desc : `.desc` 13.5/ink-3, leading 1.55.
 *  - action: 단일 CTA. error=ink(검정) primary, 그 외=accent (S09 잠금 해제 CTA).
 */
export type StateViewKind = 'loading' | 'empty' | 'error';

export interface StateViewProps extends Omit<ViewProps, 'children'> {
  /**
   * 상태 종류.
   *  - `loading` : 진행 중 — 36px Spinner 표시(icon 무시).
   *  - `empty`   : 빈 상태 — 중립 아이콘 글리프 + 카피.
   *  - `error`   : 오류 — danger-soft 원형 아이콘 배지 + 카피 + 복구 CTA.
   */
  kind?: StateViewKind;
  /** 아이콘 글리프(이모지/문자/노드). loading 상태에서는 무시되고 Spinner 가 표시된다. */
  icon?: React.ReactNode;
  /** 제목 (예: '아직 매칭 상대가 없어요'). */
  title?: React.ReactNode;
  /** 보조 설명 (예: '잠시 후 다시 시도해 주세요.'). */
  desc?: React.ReactNode;
  /** 복구/진입 CTA. 라벨 + 핸들러. 없으면 미표시. */
  action?: { label: React.ReactNode; onPress?: () => void };
  className?: string;
}

export const StateView = React.forwardRef<View, StateViewProps>(function StateView(
  { kind = 'loading', icon, title, desc, action, className, ...rest },
  ref,
) {
  const isLoading = kind === 'loading';
  const isError = kind === 'error';

  return (
    <View
      ref={ref}
      // 공통 중앙 정렬 body: flex-1 + 세로/가로 중앙 + 좌우 패딩 32 (HTML .body padding)
      className={cn('flex-1 items-center justify-center bg-bg px-[32px]', className)}
      {...rest}
    >
      {/* icon 영역 */}
      {isLoading ? (
        // .s01 .pulse: 36px Spinner (loading 은 icon prop 무시)
        <View className="mb-[24px]">
          <Spinner size={36} />
        </View>
      ) : isError ? (
        // .s03f .ic: danger-soft 원형 64×64 + 글리프 32px/800
        <View
          accessibilityRole="image"
          className="mb-[24px] h-[64px] w-[64px] items-center justify-center rounded-full bg-danger-soft"
        >
          <Text className="text-[32px] font-extrabold text-danger">{icon}</Text>
        </View>
      ) : icon != null ? (
        // empty: 중립 아이콘 글리프 (.s07/.s09 류 64px 중앙 글리프)
        <View accessibilityRole="image" className="mb-[20px] items-center justify-center">
          <Text className="text-[64px] leading-none">{icon}</Text>
        </View>
      ) : null}

      {/* title: .h2 22/800 ink, 가운데 정렬 */}
      {title != null ? (
        <Text variant="h2" tone="ink" className="text-center text-[22px] font-extrabold">
          {title}
        </Text>
      ) : null}

      {/* desc: .desc 13.5/ink-3, leading 1.55 */}
      {desc != null ? (
        <Text
          variant="caption"
          tone="ink-3"
          className="mt-[10px] text-center text-[13.5px] leading-[1.55]"
        >
          {desc}
        </Text>
      ) : null}

      {/* action: 단일 CTA. error=ink primary / 그 외=accent (S09 잠금 해제 CTA) */}
      {action != null ? (
        <View className="mt-[24px] w-full">
          <Button
            variant={isError ? 'ink' : 'accent'}
            fullWidth
            onPress={action.onPress}
          >
            {action.label}
          </Button>
        </View>
      ) : null}
    </View>
  );
});

StateView.displayName = 'StateView';
