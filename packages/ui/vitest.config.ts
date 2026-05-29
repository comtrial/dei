import { defineConfig } from 'vitest/config';

// 토큰(순수 로직)은 node 환경 .test.ts 로, primitives/patterns(RN 컴포넌트)는
// RNTL + react-native-web(jsdom) 로 검증한다. react-native → react-native-web
// 별칭은 e2e-web 하네스(apps/mobile/e2e/playwright/vite.config.ts)와 동일 전략 —
// Metro 없이 RN 컴포넌트를 렌더해 className(토큰) 적용을 단언한다.
export default defineConfig({
  resolve: {
    alias: [{ find: /^react-native$/, replacement: 'react-native-web' }],
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    server: {
      deps: {
        // react-native-web 내부는 ESM 변환 경유시켜 transform 안정화.
        inline: ['react-native-web'],
      },
    },
  },
});
