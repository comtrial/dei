export async function getFunctionErrorMessage(
  error: unknown,
  fallback = 'Function request failed',
) {
  if (!error) {
    return fallback;
  }

  if (typeof error === 'object' && error && 'context' in error) {
    try {
      const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
      const payload = await context?.json?.() as { error?: string } | undefined;

      if (payload?.error) {
        return payload.error;
      }
    } catch {
      // Ignore body parsing errors and fall through to generic message.
    }
  }

  return error instanceof Error ? error.message : fallback;
}
