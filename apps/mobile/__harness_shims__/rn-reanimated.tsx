/**
 * react-native-reanimated stub — Playwright web harness only.
 *
 * ui/dialog.tsx (rendered by CH5 LeaveChatDialog) chains animation builders
 * like `FadeIn.duration(200)` and `FadeIn.delay(50)`. NativeOnlyAnimatedView
 * discards these on web, but the builder methods must still exist and be
 * chainable or the render throws. Use a self-returning Proxy so ANY method
 * call (`.delay`, `.duration`, `.springify`, `.build`, …) returns the entry.
 */
const entry: Record<string, unknown> = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'build') return () => ({});
      // Any builder method → return the same chainable entry.
      return () => entry;
    },
  },
);

export const FadeIn = entry;
export const FadeOut = entry;
export const FadeInDown = entry;
export const FadeOutDown = entry;
export const SlideInDown = entry;
export const SlideOutDown = entry;

// Spinner(StateView 의 loading) hook/worklet API — 웹 하네스는 애니메이션이
// load-bearing 이 아니므로 전부 no-op 으로 둔다(존재 + 안전 호출만 보장).
export const useSharedValue = <T,>(initial: T) => ({ value: initial });
export const useAnimatedStyle = (_fn: () => Record<string, unknown>) => ({});
export const withTiming = <T,>(toValue: T) => toValue;
export const withRepeat = <T,>(animation: T) => animation;
export const withDelay = <T,>(_delay: number, animation: T) => animation;
export const withSequence = <T,>(...animations: T[]) => animations[animations.length - 1];
export const withSpring = <T,>(toValue: T) => toValue;
export const cancelAnimation = (_sv: unknown) => {};
export const interpolate = (x: number) => x;
export const useDerivedValue = <T,>(fn: () => T) => ({ value: fn() });

// GridRoom(@dei/ui, RoomChatView 가 배럴로 끌어옴)이 `runOnJS(cb)(args)` 로
// worklet→JS 콜백을 브릿지한다. 웹 하네스엔 worklet 이 없으므로 콜백을 그대로
// 반환해 동기 호출되게 둔다(존재 + 호출 안전만 보장 — 애니메이션 non-load-bearing).
export const runOnJS =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  (...args: A): R =>
    fn(...args);
export const runOnUI =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  (...args: A): R =>
    fn(...args);
export const Easing = new Proxy(
  {},
  { get: () => (..._args: unknown[]) => (x: number) => x },
) as Record<string, unknown>;

const Reanimated = {
  View: 'div',
  Text: 'span',
  createAnimatedComponent: <T,>(c: T) => c,
};

export default Reanimated;
