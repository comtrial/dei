/**
 * Sentry smoke test.
 *
 *   pnpm smoke:sentry
 *
 * Sends ONE captured exception + ONE message to the configured Sentry project,
 * tagged `environment=smoke-test` so they are easy to filter out from real
 * issues. Use this to confirm that:
 *   1. EXPO_PUBLIC_SENTRY_DSN in apps/mobile/.env (or your shell) is correct
 *   2. Network egress from your machine reaches sentry.io
 *   3. The deai-13/react-native project is receiving events
 *
 * Verify in the dashboard:
 *   https://deai-13.sentry.io/projects/react-native/?environment=smoke-test
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as Sentry from '@sentry/node';

function loadDotEnv(path: string): void {
  try {
    const text = readFileSync(path, 'utf8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // file missing is fine — env vars may already be set by the shell.
  }
}

function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

const repoRoot = join(__dirname, '..', '..', '..');
loadDotEnv(join(repoRoot, 'apps', 'mobile', '.env'));
loadDotEnv(join(repoRoot, '.env'));

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

if (!dsn) {
  console.error(
    '\n[smoke:sentry] EXPO_PUBLIC_SENTRY_DSN 가 설정되지 않았습니다.\n' +
      '  apps/mobile/.env 에 DSN 을 넣거나, 환경변수로 직접 주입한 뒤 다시 실행해주세요.\n',
  );
  process.exit(1);
}

const sha = gitSha();
const release = `smoke-${sha}`;

Sentry.init({
  dsn,
  environment: 'smoke-test',
  release,
  tracesSampleRate: 0,
  sendDefaultPii: false,
});

const eventId = Sentry.captureException(
  new Error(`[smoke] connectivity check (${new Date().toISOString()})`),
  {
    tags: { source: 'smoke-script', sha },
    extra: { node: process.version, platform: process.platform },
  },
);

Sentry.captureMessage('[smoke] hello from smoke:sentry', 'info');

(async () => {
  await Sentry.flush(5_000);
  console.log('\n[smoke:sentry] sent.');
  console.log(`  event_id : ${eventId}`);
  console.log(`  release  : ${release}`);
  console.log(`  env      : smoke-test`);
  console.log(
    '  view     : https://deai-13.sentry.io/projects/react-native/?environment=smoke-test\n',
  );
  process.exit(0);
})();
