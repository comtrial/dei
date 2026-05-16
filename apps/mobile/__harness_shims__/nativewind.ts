/**
 * nativewind stub — Playwright web harness only.
 *
 * The chat components consume `cssInterop` (icon) and the `className` prop is
 * handled by jsxImportSource in the app build, not here. In the harness the
 * className is simply ignored (assertions are testID/text based), so cssInterop
 * is a pass-through and useColorScheme returns a stable light scheme.
 */
export function cssInterop<T>(component: T): T {
  return component;
}

export function remapProps<T>(component: T): T {
  return component;
}

export function useColorScheme() {
  return { colorScheme: 'light', setColorScheme: () => {}, toggleColorScheme: () => {} };
}

export function verifyInstallation() {}

export const NativeWindStyleSheet = { setOutput: () => {} };
