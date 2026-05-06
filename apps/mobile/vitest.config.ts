import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Vitest is used here for non-RN-component code (lib utilities, sentry transport,
// supabase client glue). RN component tests live in jest-expo (see jest.config.js).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    name: 'mobile-lib',
    environment: 'node',
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
