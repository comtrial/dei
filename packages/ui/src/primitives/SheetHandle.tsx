import { forwardRef } from 'react';
import { View, type ViewProps } from 'react-native';

import { cn } from '../lib/cn';

/**
 * SheetHandle — P19 primitive.
 *
 * SSOT: all-screens 와이어프레임의 sheet 그랩 바 CSS (S08/S13a/S15/S16,
 * 그리고 sCC/sLR/sBR 시트 변형). 모든 화면에서 값이 동일하다:
 *   `.handle{width:36px;height:4px;background:var(--ink-4);
 *            border-radius:2px;opacity:.5;margin:auto;flex-shrink:0}`
 * 커버리지 매트릭스 §P19: (36×4) · ink-4 · r2.
 *
 * BottomSheet(X3) 상단에 놓는 단순 드래그 그랩 막대. 시각 토큰은 전부
 * `@dei/ui` className 으로만 표현한다 (raw hex / inline style 금지, DS 강제).
 *
 * - 크기 36×4 는 토큰 스케일에 없는 1회성 치수 → Badge 와 동일하게
 *   arbitrary value(`w-[36px] h-[4px]`)로 표기.
 * - radius: HTML `border-radius:2px` = 높이(4px)의 절반 → `rounded-full`
 *   로 동일한 캡슐 형태를 얻는다(완전 라운드 양끝).
 * - `opacity-50` 은 HTML `opacity:.5` 그대로.
 * - `self-center` 로 BottomSheet 폭 안에서 가로 중앙 정렬(`margin:auto`).
 * - `shrink-0` 으로 시트 레이아웃에서 눌리지 않게.
 */
export interface SheetHandleProps extends ViewProps {
  className?: string;
}

export const SheetHandle = forwardRef<View, SheetHandleProps>(function SheetHandle(
  { className, accessibilityElementsHidden, importantForAccessibility, ...rest },
  ref,
) {
  return (
    <View
      ref={ref}
      // 순수 장식 그랩 — 스크린리더에서 숨김(호출자가 덮어쓸 수 있음).
      accessibilityElementsHidden={accessibilityElementsHidden ?? true}
      importantForAccessibility={importantForAccessibility ?? 'no-hide-descendants'}
      className={cn(
        'h-[4px] w-[36px] shrink-0 self-center rounded-full bg-ink-4 opacity-50',
        className,
      )}
      {...rest}
    />
  );
});
