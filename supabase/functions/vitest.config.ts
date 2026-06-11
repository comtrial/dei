import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'supabase-functions',
    environment: 'node',
    include: ['_shared/push.test.ts'],
  },
});
