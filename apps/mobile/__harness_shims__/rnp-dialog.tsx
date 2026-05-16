/**
 * @rn-primitives/dialog stub — Playwright web harness only.
 *
 * Faithful enough for CH5 (LeaveChatDialog): Root holds `open` state, and
 * Overlay/Content/Title/Description/Close only render when open. Close + the
 * overlay backdrop call onOpenChange(false) so the "취소" path works.
 */
import { createContext, useContext } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';

type Ctx = { open: boolean; onOpenChange?: (next: boolean) => void };
const DialogCtx = createContext<Ctx>({ open: false });

export function Root({
  open = false,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return <DialogCtx.Provider value={{ open, onOpenChange }}>{children}</DialogCtx.Provider>;
}

export function Trigger({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export function Portal({ children }: { children?: React.ReactNode }) {
  const { open } = useContext(DialogCtx);
  return open ? <>{children}</> : null;
}

export function Overlay({
  children,
  ...props
}: { children?: React.ReactNode } & Record<string, unknown>) {
  const { open } = useContext(DialogCtx);
  if (!open) return null;
  return <View {...props}>{children}</View>;
}

export function Content({
  children,
  ...props
}: { children?: React.ReactNode } & Record<string, unknown>) {
  return <View {...props}>{children}</View>;
}

export function Close({
  children,
  ...props
}: { children?: React.ReactNode } & Record<string, unknown>) {
  const { onOpenChange } = useContext(DialogCtx);
  return (
    <Pressable {...props} onPress={() => onOpenChange?.(false)}>
      {children}
    </Pressable>
  );
}

export function Title({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) {
  return <RNText {...props}>{children}</RNText>;
}

export function Description({
  children,
  ...props
}: Record<string, unknown> & { children?: React.ReactNode }) {
  return <RNText {...props}>{children}</RNText>;
}

export const useRootContext = () => useContext(DialogCtx);
