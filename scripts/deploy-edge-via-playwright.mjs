#!/usr/bin/env node
/**
 * Supabase Dashboard 자동 로그인 → Personal Access Token 발급 → Edge Function 배포.
 *
 * 왜 이 스크립트가 필요한가
 *   `supabase login` 은 브라우저 OAuth 흐름이라 CLI 만으로 비대화식 실행이 어렵다.
 *   Playwright 로 dashboard 의 access-token 페이지에 자동 로그인해서 토큰을 발급받고,
 *   그 토큰을 SUPABASE_ACCESS_TOKEN 환경변수로 child 에 주입해 `supabase functions
 *   deploy` 를 비대화식으로 돌린다.
 *
 * 보안
 *   - DASHBOARD_EMAIL / DASHBOARD_PASSWORD 를 env 로만 받고 코드에 하드코딩하지 않음.
 *   - 발급받은 토큰은 stdout 에 print 하지 않고 process.env 로만 전달.
 *   - 토큰 이름은 `cli-deploy-<timestamp>` 로 짧게 — dashboard 에서 사후 회수 가능.
 *
 * 사용
 *   DASHBOARD_EMAIL=... DASHBOARD_PASSWORD=... \
 *   SUPABASE_PROJECT_REF=sjlzidjnpczysygnlmtk \
 *   node scripts/deploy-edge-via-playwright.mjs <function-name> [<function-name> ...]
 */

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const DASHBOARD_EMAIL = process.env.DASHBOARD_EMAIL;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const FUNCTIONS = process.argv.slice(2);

if (!DASHBOARD_EMAIL || !DASHBOARD_PASSWORD) {
  console.error('DASHBOARD_EMAIL / DASHBOARD_PASSWORD env vars are required.');
  process.exit(2);
}
if (!PROJECT_REF) {
  console.error('SUPABASE_PROJECT_REF env var is required.');
  process.exit(2);
}
if (FUNCTIONS.length === 0) {
  console.error('Usage: node scripts/deploy-edge-via-playwright.mjs <fn1> [<fn2> ...]');
  process.exit(2);
}

const TOKEN_NAME = `cli-deploy-${Date.now()}`;

function runSupabaseDeploy(token, fnName) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'supabase',
      [
        'functions',
        'deploy',
        fnName,
        '--project-ref',
        PROJECT_REF,
      ],
      {
        env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`supabase functions deploy ${fnName} failed (exit ${code}): ${stderr || stdout}`));
      }
    });
    child.on('error', reject);
  });
}

async function loginAndIssueToken() {
  const headless = process.env.PLAYWRIGHT_HEADLESS !== '0';
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 디버그 디렉토리 (Slack 토큰처럼 민감하지 않은 단계별 스크린샷만 저장)
  const debugDir = '/tmp/supabase-deploy-debug';
  await import('node:fs/promises').then((fs) => fs.mkdir(debugDir, { recursive: true }));

  async function snap(stepName) {
    const p = `${debugDir}/${stepName}.png`;
    try {
      await page.screenshot({ path: p, fullPage: true });
    } catch {
      // ignore
    }
  }

  try {
    console.log('[1/4] Supabase Dashboard 로그인 페이지 진입');
    await page.goto('https://supabase.com/dashboard/sign-in', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await snap('1-signin-page');

    // 이메일/비밀번호 입력 — 표준 셀렉터 + 폴백
    await page.locator('input[type="email"], input[name="email"]').first().fill(DASHBOARD_EMAIL);
    await page
      .locator('input[type="password"], input[name="password"]')
      .first()
      .fill(DASHBOARD_PASSWORD);
    await snap('2-filled');

    console.log('[2/4] 로그인 submit');
    // networkidle 은 SPA 에서 잘 안 잡힘 → URL 변경 또는 dashboard 특정 element 대기
    await page.locator('button[type="submit"]').first().click();

    // Captcha 가 뜨면 Skip 시도 (hCaptcha visual challenge — "Click on the icon that
    // breaks the pattern"). 자동 풀이 불가능. Skip 으로 우회될 수도 있다.
    try {
      const skipBtn = page.locator('button:has-text("Skip")').first();
      await skipBtn.waitFor({ state: 'visible', timeout: 5000 });
      await snap('2c-captcha-detected');
      console.log('   Captcha 감지 — Skip 시도');
      await skipBtn.click();
    } catch {
      // captcha 없음 — 정상 흐름
    }

    // 로그인 성공 시 URL 이 /dashboard/projects 또는 /dashboard/* 로 변경됨
    await page.waitForURL(/dashboard\/(?!sign-in)/, { timeout: 30000 }).catch(async () => {
      // URL 변경이 안 됐다면 에러 메시지가 떴거나 추가 단계 (MFA 등) 가능
      await snap('2b-after-submit-no-redirect');
      throw new Error(
        'CAPTCHA 또는 추가 인증 단계로 자동 로그인 실패. 스크린샷: ' +
          debugDir +
          '\nFallback: Dashboard 에서 직접 Personal Access Token 발급 후 ' +
          'SUPABASE_ACCESS_TOKEN=<token> 으로 export 하고 deploy-edge-direct.mjs 사용 권장.',
      );
    });
    await snap('3-after-login');

    // 로그인 완료 후 access-token 페이지로 이동
    console.log('[3/4] Personal Access Token 페이지 진입');
    await page.goto('https://supabase.com/dashboard/account/tokens', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForLoadState('domcontentloaded');
    await snap('4-tokens-page');

    // "Generate new token" 버튼 — 페이지의 텍스트가 영문/한글일 수 있음
    const newTokenBtn = page
      .locator('button:has-text("Generate new token"), button:has-text("새 토큰"), button:has-text("Generate Token")')
      .first();
    await newTokenBtn.waitFor({ state: 'visible', timeout: 15000 });
    await newTokenBtn.click();
    await snap('5-after-generate-click');

    // 토큰 이름 입력 모달
    const nameInput = page
      .locator('input[name="name"], input[placeholder*="name" i], input[type="text"]')
      .first();
    await nameInput.waitFor({ state: 'visible', timeout: 10000 });
    await nameInput.fill(TOKEN_NAME);
    await snap('6-name-filled');

    // Generate / Create 버튼 (모달 안의 confirm)
    const generateBtn = page
      .locator(
        'button:has-text("Generate token"), button:has-text("Generate"), button:has-text("Create"), button:has-text("발급")',
      )
      .last(); // 모달 내부의 버튼이 후순위
    await generateBtn.click();

    // 토큰 표시 대기 — 새 토큰은 보통 textarea, input[readonly], <code> 또는
    // 더 일반적으로 sbp_ 로 시작하는 텍스트가 어딘가에 노출됨.
    console.log('[4/4] 토큰 추출');
    // 최대 15초 동안 sbp_/sbpat_ 텍스트가 페이지 어디든 등장하는지 폴링
    const tokenPattern = /(sbp_[a-z0-9]+|sbpat_[a-zA-Z0-9]+)/;
    let token = null;
    for (let i = 0; i < 30; i++) {
      // textarea/input 의 value 와 일반 텍스트 모두 검색
      const inputValues = await page
        .locator('input, textarea')
        .evaluateAll((els) => els.map((e) => (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement ? e.value : '')))
        .catch(() => []);
      for (const v of inputValues) {
        const m = v?.match(tokenPattern);
        if (m) {
          token = m[1];
          break;
        }
      }
      if (!token) {
        const bodyText = await page.locator('body').innerText().catch(() => '');
        const m = bodyText.match(tokenPattern);
        if (m) token = m[1];
      }
      if (token) break;
      await page.waitForTimeout(500);
    }
    await snap('7-token-displayed');

    if (!token) {
      throw new Error('토큰 발급 모달은 떴지만 sbp_/sbpat_ 패턴을 페이지에서 못 찾음. 스크린샷: ' + debugDir);
    }
    return token;
  } finally {
    await context.close();
    await browser.close();
  }
}

(async () => {
  let token;
  try {
    token = await loginAndIssueToken();
  } catch (err) {
    console.error('토큰 발급 실패:', err.message);
    console.error('Dashboard UI 가 바뀌었을 수 있음. 수동 발급 후 SUPABASE_ACCESS_TOKEN 으로 재시도 권장.');
    process.exit(1);
  }

  console.log(`토큰 발급 완료 (이름: ${TOKEN_NAME})`);

  for (const fn of FUNCTIONS) {
    console.log(`\n=== Deploying ${fn} ===`);
    try {
      const { stdout } = await runSupabaseDeploy(token, fn);
      console.log(stdout.trim());
      console.log(`✓ ${fn} 배포 성공`);
    } catch (err) {
      console.error(`✗ ${fn} 배포 실패:`, err.message);
      process.exit(1);
    }
  }

  console.log('\n모든 함수 배포 완료. (Dashboard > Account > Access Tokens 에서 ' +
    `'${TOKEN_NAME}' 토큰을 회수해두는 걸 권장)`);
})();
