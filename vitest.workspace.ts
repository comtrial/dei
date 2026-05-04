import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/shared',
  'packages/api',
  'apps/mobile/vitest.config.ts',
]);
