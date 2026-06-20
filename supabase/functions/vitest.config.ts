import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    name: 'supabase-functions',
    environment: 'node',
    include: ['_shared/push.test.ts', '_shared/*.vitest.test.ts'],
  },
});
