import { defineConfig } from 'vitest/config';

// 영역 분리 (CLAUDE.md Testing 규약): vitest = 순수 로직/토큰(.test.ts, node),
// jest(jest-expo) = RN 컴포넌트(.test.tsx). 확장자로 분리해 충돌 방지.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
