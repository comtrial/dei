import * as React from 'react';
import {
  Pressable,
  Text,
  View,
  type ViewProps,
} from 'react-native';

import { cn } from '../lib/cn';
import { shadow } from '../tokens/shadow';

/**
 * Popover / Menu — P17 primitive (커버리지 매트릭스 §P17).
 *
 * SSOT: all-screens 와이어프레임 `.s16 .menu` CSS (S14/S16 의 overflow 메뉴).
 *   .menu       position:absolute; top:42px; right:8px; background:var(--paper);
 *               border-radius:var(--r-md); box-shadow:0 8px 24px rgba(0,0,0,.16);
 *               padding:6px; width:120px; z-index:5; border:1px solid var(--line)
 *   .menu .it   padding:9px 12px; font-size:12.5px; font-weight:600;
 *               color:var(--ink-2); border-radius:var(--r-sm)
 *   .menu .it.danger  color:var(--danger)
 *
 * IconButton 의 OverflowMenu(트리거) 가 이 팝오버를 연다 (S14 멤버 프로필,
 * S16 더보기). trigger 를 누르면 self-anchored absolute overlay 로 메뉴가 뜬다.
 *
 * 규칙(DS 강제 D-04):
 *  - 색/라운드/패딩은 전부 @dei/ui 토큰 className 으로만 표현(raw hex/inline style 금지).
 *  - 단 box-shadow 는 RN 이 className 으로 표현하지 못하므로(`tokens/preset` 미노출),
 *    `shadow.pop` 토큰(= --shadow-pop, HTML `0 8px 24px rgba(0,0,0,.16)`)의
 *    RN shadow* 객체를 `style` 로 적용한다. raw 값이 아닌 토큰 경유라 SSOT 유지.
 */

export interface PopoverItem {
  /** 메뉴 항목 라벨. */
  label: string;
  /** 항목 선택 핸들러. 선택 시 메뉴는 자동으로 닫힌다. */
  onPress: () => void;
  /** 위험 동작(나가기/삭제 등) → danger 색. `.it.danger`. */
  danger?: boolean;
}

export interface PopoverProps extends Omit<ViewProps, 'children'> {
  /** 메뉴 항목 목록. */
  items: PopoverItem[];
  /**
   * 트리거 요소. `(open) => ReactNode` 형태로 받아 열림 토글 핸들러를 주입한다.
   * 보통 IconButton(OverflowMenu) 을 넘긴다.
   */
  trigger: (open: () => void) => React.ReactNode;
  /** 메뉴 컨테이너에 머지할 className (위치 오프셋 등 미세조정용). */
  menuClassName?: string;
}

// .menu: paper 표면 + 1px line 보더 + r-md, padding 6px, width 120px,
// self-anchored absolute (top:42px right:8px → 트리거 우하단). z 는 RN 에서
// 형제 순서로 보장되므로 zIndex 만 토큰 외 레이아웃 값으로 둔다.
const MENU_CLASS =
  'absolute right-[8px] top-[42px] z-50 w-[120px] rounded-md border border-line bg-paper p-[6px]';

// .menu .it: padding 9px/12px, 12.5px/600, ink-2, r-sm. danger → danger.
const ITEM_CLASS = 'rounded-sm px-[12px] py-[9px]';
const ITEM_LABEL_CLASS = 'text-[12.5px] font-semibold';

/**
 * Popover primitive. trigger 를 누르면 absolute overlay 로 메뉴를 띄우고,
 * 항목 선택·바깥 영역 탭 시 닫는다.
 */
export const Popover = React.forwardRef<View, PopoverProps>(function Popover(
  { items, trigger, menuClassName, className, ...rest },
  ref,
) {
  const [open, setOpen] = React.useState(false);

  const handleSelect = React.useCallback((item: PopoverItem) => {
    setOpen(false);
    item.onPress();
  }, []);

  return (
    // relative anchor 로 트리거 우하단에 메뉴를 고정한다.
    <View ref={ref} className={cn('relative', className)} {...rest}>
      {trigger(() => setOpen((v) => !v))}

      {open ? (
        <>
          {/* 바깥 영역 탭 → 닫힘 (full-bleed 투명 backdrop) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="메뉴 닫기"
            onPress={() => setOpen(false)}
            className="absolute -bottom-[1000px] -left-[1000px] -right-[1000px] -top-[1000px] z-40"
          />
          <View
            testID="popover-menu"
            accessibilityRole="menu"
            className={cn(MENU_CLASS, menuClassName)}
            // shadow-pop 토큰(--shadow-pop) — RN 은 className 으로 box-shadow 미표현.
            style={shadow.pop.rn}
          >
            {items.map((item, i) => (
              <Pressable
                key={`${item.label}-${i}`}
                accessibilityRole="menuitem"
                onPress={() => handleSelect(item)}
                className={ITEM_CLASS}
              >
                <Text
                  className={cn(
                    ITEM_LABEL_CLASS,
                    item.danger ? 'text-danger' : 'text-ink-2',
                  )}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
});
