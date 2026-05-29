import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
