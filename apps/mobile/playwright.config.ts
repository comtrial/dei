/**
 * Playwright — PC(웹) 화면 검증.
 *
 * Expo Web 의 chat 화면을 실제 Chromium 에서 렌더해 DOM 레벨로 검증한다.
 * 풀 앱 부팅(루트 layout → auth/onboarding gate → Supabase 세션)은 Docker
 * 부재 환경에서 비결정적이라, 대신 e2e/harness 가 *실제* chat 스크린/컴포넌트를
 * react-native-web 으로 마운트하고 데이터 계층만 모킹한다 (vite.config.ts).
 * 검증 대상: CH1 목록(빈상태/에러 포함)·CH2 컴포저(글자수/전송/실패 retry)·
 * CH4 더보기·CH5 나가기 다이얼로그·B-CH6 무음 정리. 셀렉터는 testID 우선.
 *
 * 실행: pnpm --filter mobile test:e2e:web
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4317;

export default defineConfig({
  testDir: './e2e/playwright/specs',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite --config e2e/playwright/vite.config.ts --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
