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

const Reanimated = {
  View: 'div',
  Text: 'span',
  createAnimatedComponent: <T,>(c: T) => c,
};

export default Reanimated;
