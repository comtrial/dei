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
    // 통합 테스트는 *단일 공유* 로컬 Supabase 를 두드린다. 파일 간 병렬로 돌면
    // 같은 DB·Edge(leave-room cold start ~3s)에 동시 부하가 걸려 비결정적
    // 400/타임아웃이 난다(단독 통과, 전체 간헐 실패). 파일 순차 실행으로 격리 —
    // 실DB 공유 테스트의 정석.
    fileParallelism: false,
  },
});
