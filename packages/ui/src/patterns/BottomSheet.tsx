import { forwardRef, type ReactNode } from 'react';
import { Modal, Pressable, View, type ViewProps } from 'react-native';

import { cn } from '../lib/cn';
import { SheetHandle } from '../primitives/SheetHandle';

/**
 * BottomSheet (X3) — 하단에서 슬라이드업하는 시트 컨테이너.
 *
 * SSOT: all-screens 와이어프레임 `.s13a` 시트 CSS(S08/S13a/S15/S16 공통 변형) +
 * 커버리지 매트릭스 X3.
 *   `.s13a{background:rgba(0,0,0,.55)}`                         ← scrim
 *   `.s13a .sheet{position:absolute;left:0;right:0;bottom:0;
 *      background:var(--paper);border-radius:24px 24px 0 0;
 *      height:78%;display:flex;flex-direction:column;overflow:hidden}` ← 시트 표면
 *   `.s13a .handle{...}`                                        ← SheetHandle(P19)
 *
 * 이 패턴은 **시트 셸(scrim + paper 표면 + handle)** 만 담당한다. 헤더/바디/
 * 컴포저 등 내용은 화면(스크린) 책임 — `children` 으로 주입한다.
 *
 * 동작: RN `Modal`(`animationType="slide"`, `transparent`) 로 하단 슬라이드업을
 * 구현한다. scrim 탭 또는 하드웨어 뒤로가기 시 `onClose` 호출.
 *
 * 색 규칙(DS D-04):
 *  - scrim `rgba(0,0,0,.55)` → `bg-black/55` 불투명도 유틸(매트릭스 §3:
 *    `--scrim` 승격 후보지만 토큰 미존재 → FullscreenVideo 와 동일하게
 *    불투명도 유틸로 표현. raw hex / inline style 금지).
 *  - 시트 표면 `var(--paper)` → `bg-paper`.
 *  - `border-radius:24px 24px 0 0`(=r-xl 상단만) → `rounded-t-xl`.
 *  - handle 은 SheetHandle(P19) 그대로 사용. HTML 의 `margin:12px auto` 세로
 *    여백은 시트 표면 상단 패딩(`pt-[12px] pb-[8px]`)으로 재현한다.
 *
 * height: HTML 은 `height:78%`(S13a). 화면마다 시트 높이가 달라 `heightPct`
 * prop 으로 노출한다(0~100, 기본 78). 토큰 스케일 밖 1회성 비율 →
 * NativeWind arbitrary 높이(`h-[NN%]`)로 표기.
 */
export interface BottomSheetProps extends Omit<ViewProps, 'children'> {
  /** 시트 표시 여부(RN Modal `visible`). */
  visible: boolean;
  /** scrim 탭 / 뒤로가기 등 닫기 요청 핸들러. */
  onClose: () => void;
  /** 시트 높이(뷰포트 대비 %). 0~100, 기본 78(S13a). */
  heightPct?: number;
  /** 시트 본문(헤더/바디/컴포저 등 — 화면이 주입). */
  children?: ReactNode;
  /** scrim 접근성 라벨(닫기). 기본 '닫기'. */
  closeLabel?: string;
}

// heightPct 는 임의 비율 → NativeWind arbitrary 높이로 매핑.
function heightClass(pct: number): string {
  // 0~100 클램프(잘못된 입력 방어).
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return `h-[${clamped}%]`;
}

export const BottomSheet = forwardRef<View, BottomSheetProps>(function BottomSheet(
  { visible, onClose, heightPct = 78, children, className, closeLabel = '닫기', ...rest },
  ref,
) {
  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
      transparent
    >
      {/* scrim: rgba(0,0,0,.55) — 탭하면 닫힘. flex-1 + justify-end 로 시트를 하단에 배치. */}
      <Pressable
        testID="bottom-sheet-scrim"
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={onClose}
        className="flex-1 justify-end bg-black/55"
      >
        {/* 시트 표면 — scrim 탭이 시트 내부로 전파되지 않도록 onStartShouldSetResponder 로 차단. */}
        <View
          ref={ref}
          testID="bottom-sheet-surface"
          onStartShouldSetResponder={() => true}
          className={cn(
            'overflow-hidden rounded-t-xl bg-paper pt-[12px] pb-[8px]',
            heightClass(heightPct),
            className,
          )}
          {...rest}
        >
          <SheetHandle />
          {children}
        </View>
      </Pressable>
    </Modal>
  );
});
