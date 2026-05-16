/**
 * auth-provider shim — Playwright web harness only.
 * Returns a fixed signed-in user so the chat screens render their data path
 * (real screens read `user.id` from this hook).
 */
export function useAuth() {
  return {
    isLoading: false,
    session: { user: { id: 'me-user-id' } } as unknown,
    user: { id: 'me-user-id' } as unknown,
    ensureAnonymousSession: async () => ({}) as unknown,
    signOut: async () => {},
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return children as React.ReactElement;
}
