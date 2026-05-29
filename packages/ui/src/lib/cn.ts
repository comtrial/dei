import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge 는 표준 Tailwind 스케일만 알고 있어, `@dei/ui` 토큰 preset 이
 * 추가한 **비표준 font-size 토큰**(`text-display`/`text-md`/`text-2xs`)을 모른다.
 * 그래서 `cn('text-display', 'text-ink')` 처럼 size 와 color 가 함께 오면 둘 다
 * `text-*` 라 충돌로 보고 size 클래스를 떨어뜨린다(로고가 기본 크기로 렌더되는 버그).
 *
 * 커스텀 font-size 토큰을 `text-` 그룹에 등록해 size↔color 가 공존하도록 한다.
 * (표준 `text-xs`~`text-4xl` 은 tailwind-merge 가 이미 알고 있으므로 추가만 한다.)
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['2xs', 'md', 'display'] }],
    },
  },
});

/**
 * Merge conditional Tailwind/NativeWind classNames.
 *
 * Combines clsx (conditional class composition) with tailwind-merge
 * (deduplicates conflicting Tailwind utilities, last-wins). Use this
 * whenever a @dei/ui component accepts a `className` prop so callers can
 * override defaults predictably.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
