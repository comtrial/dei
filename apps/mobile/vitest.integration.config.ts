import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Integration tests hit a real local Supabase (`pnpm db:start`). They are
// SKIPPED automatically when supabase is unreachable, so this config can run
// in environments without docker without failing.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    name: 'mobile-integration',
    environment: 'node',
    include: ['__tests__/integration/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
