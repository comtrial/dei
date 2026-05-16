/**
 * expo-router shim — Playwright web harness only.
 *
 * The real screens call useRouter / useLocalSearchParams / useFocusEffect.
 * In the harness there is no native navigator, so navigation is recorded on
 * `window.__HARNESS_NAV__` (Playwright asserts against it) and route params
 * come from a value set by the harness App.
 */
import { useCallback, useEffect } from 'react';

type NavEntry = { type: 'push' | 'replace'; target: unknown };

declare global {
  // eslint-disable-next-line no-var
  var __HARNESS_NAV__: NavEntry[] | undefined;
}

let params: Record<string, string> = {};
export function __setHarnessRouteParams(p: Record<string, string>) {
  params = p;
}

function record(type: NavEntry['type'], target: unknown) {
  if (!globalThis.__HARNESS_NAV__) globalThis.__HARNESS_NAV__ = [];
  globalThis.__HARNESS_NAV__.push({ type, target });
}

export function useRouter() {
  return {
    push: (t: unknown) => record('push', t),
    replace: (t: unknown) => record('replace', t),
    back: () => record('replace', 'back'),
  };
}

export function useLocalSearchParams<T = Record<string, string>>(): T {
  return params as unknown as T;
}

export function useFocusEffect(cb: () => void | (() => void)) {
  // Run once on mount, like a focus on first render.
  useEffect(() => {
    const cleanup = cb();
    return typeof cleanup === 'function' ? cleanup : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// expo-router also exports useRouter as part of a Link etc.; harness screens
// only use the above. Provide a no-op Link for safety.
export function Link() {
  return null;
}

export const router = {
  push: (t: unknown) => record('push', t),
  replace: (t: unknown) => record('replace', t),
};

// useCallback re-export not needed but keep import used for tree-shake clarity.
void useCallback;
