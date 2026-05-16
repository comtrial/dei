/**
 * @rn-primitives/slot stub — Playwright web harness only.
 * ui/text.tsx uses Slot.Text when asChild; the chat screens never pass asChild,
 * but the import must resolve. Provide passthrough primitives.
 */
import { Children, cloneElement, isValidElement } from 'react';

function makeSlot(name: string) {
  function Slot(props: Record<string, unknown> & { children?: React.ReactNode }) {
    const { children, ...rest } = props;
    if (isValidElement(children)) {
      return cloneElement(children, rest as Record<string, unknown>);
    }
    return <>{Children.toArray(children)}</>;
  }
  Slot.displayName = `Slot.${name}`;
  return Slot;
}

export const Text = makeSlot('Text');
export const View = makeSlot('View');
export const Pressable = makeSlot('Pressable');
export const Image = makeSlot('Image');
export default { Text, View, Pressable, Image };
