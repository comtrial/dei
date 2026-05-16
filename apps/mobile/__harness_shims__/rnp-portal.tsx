/**
 * @rn-primitives/portal stub — Playwright web harness only.
 * Renders portal children inline (good enough for DOM assertions).
 */
export function PortalHost() {
  return null;
}

export function Portal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export default { PortalHost, Portal };
