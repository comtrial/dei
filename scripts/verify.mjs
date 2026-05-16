#!/usr/bin/env node
/**
 * `pnpm verify` — local reproduction of the Chat Verify CI gate.
 *
 * Runs the exact same ordered stages as .github/workflows/chat-verify.yml so a
 * developer can reproduce the merge gate before pushing. Fail-fast: a failing
 * stage stops the run and exits non-zero (same as the CI `needs:` chain).
 *
 * The integration stage is the one that needs a real Supabase stack. If a
 * local stack is reachable AND a service-role key is available it runs FOR
 * REAL and a skip is treated as a FAILURE (same contract as CI). If no stack
 * is reachable it is reported as NOT-RUN-LOCALLY with an explicit note that
 * CI enforces it — we never pretend it passed.
 *
 * No external deps — Node stdlib only.
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function header(text) {
  console.log(`\n${C.bold}${C.cyan}━━ ${text} ━━${C.reset}`);
}

function run(cmd, args, opts = {}) {
  console.log(`${C.dim}$ ${cmd} ${args.join(' ')}${C.reset}`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  return res.status === 0;
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

async function supabaseReachable() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      signal: ctrl.signal,
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

const results = [];
function record(name, status, note = '') {
  results.push({ name, status, note });
}

function gate(name, ok) {
  if (ok) {
    record(name, 'PASS');
    console.log(`${C.green}✓ ${name} 통과${C.reset}`);
  } else {
    record(name, 'FAIL');
    console.log(`${C.red}✗ ${name} 실패 — 게이트 중단${C.reset}`);
    summary();
    process.exit(1);
  }
}

function summary() {
  header('verify 결과 요약');
  for (const r of results) {
    const color =
      r.status === 'PASS' ? C.green : r.status === 'FAIL' ? C.red : C.yellow;
    console.log(
      `  ${color}${r.status.padEnd(8)}${C.reset} ${r.name}${r.note ? `  ${C.dim}(${r.note})${C.reset}` : ''}`,
    );
  }
}

async function main() {
  console.log(
    `${C.bold}dei chat verify${C.reset} — CI 게이트(.github/workflows/chat-verify.yml) 로컬 재현`,
  );

  header('1/6 lint');
  gate('lint', run('pnpm', ['lint']));

  header('2/6 typecheck (RN 앱 + e2e 하네스)');
  gate('typecheck', run('pnpm', ['typecheck']));

  header('3/6 unit (Vitest — shared / api / mobile lib)');
  gate(
    'unit',
    run('pnpm', ['--filter', '@dei/shared', 'test']) &&
      run('pnpm', ['--filter', '@dei/api', 'test']) &&
      run('pnpm', ['--filter', 'mobile', 'test:unit']),
  );

  header('4/6 component (Jest + RNTL)');
  gate('component', run('pnpm', ['--filter', 'mobile', 'test:component']));

  header('5/6 integration (실제 Supabase — skip 은 실패로 취급)');
  const reachable = await supabaseReachable();
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!reachable || !hasServiceKey) {
    const why = !reachable
      ? '로컬 Supabase 미기동 (pnpm db:start 필요, Docker)'
      : 'SUPABASE_SERVICE_ROLE_KEY 미설정';
    console.log(
      `${C.yellow}⚠ integration 로컬 미실행 — ${why}.${C.reset}`,
    );
    console.log(
      `${C.yellow}  → CI(Chat Verify)는 supabase service container 로 *실제* 실행하며,${C.reset}`,
    );
    console.log(
      `${C.yellow}    0건 실행 시 게이트를 FAIL 시킨다 (PM 검증서 '서버 0검증' 해소).${C.reset}`,
    );
    record(
      'integration',
      'NOT-RUN-LOCALLY',
      `${why}; CI 에서 강제 실행`,
    );
  } else {
    const env = {
      ...process.env,
      RUN_INTEGRATION: '1',
      EXPO_PUBLIC_SUPABASE_URL: SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
    };
    const reportPath = new URL('../integration-report.json', import.meta.url)
      .pathname;
    const ok = run(
      'pnpm',
      [
        '--filter',
        'mobile',
        'exec',
        'vitest',
        'run',
        '--config',
        'vitest.integration.config.ts',
        '--reporter=default',
        '--reporter=json',
        `--outputFile=${reportPath}`,
      ],
      { env },
    );
    let reallyRan = false;
    try {
      const { readFileSync } = await import('node:fs');
      const r = JSON.parse(readFileSync(reportPath, 'utf8'));
      reallyRan = (r.numPassedTests ?? 0) > 0 && (r.numFailedTests ?? 0) === 0;
      console.log(
        `${C.dim}integration: total=${r.numTotalTests} passed=${r.numPassedTests} failed=${r.numFailedTests} pending=${r.numPendingTests}${C.reset}`,
      );
    } catch {
      reallyRan = false;
    }
    if (ok && !reallyRan) {
      console.log(
        `${C.red}✗ integration 이 실제로 케이스를 실행하지 않음 (전부 skip) — 서버 0검증.${C.reset}`,
      );
    }
    gate('integration', ok && reallyRan);
  }

  header('6/6 e2e-web (Playwright — 실제 채팅 스크린)');
  const installed = run('pnpm', [
    '--filter',
    'mobile',
    'exec',
    'playwright',
    'install',
    'chromium',
  ]);
  if (!installed) {
    record('e2e-web', 'FAIL', 'playwright chromium 설치 실패');
    console.log(`${C.red}✗ e2e-web — Chromium 설치 실패${C.reset}`);
    summary();
    process.exit(1);
  }
  gate('e2e-web', run('pnpm', ['--filter', 'mobile', 'test:e2e:web']));

  summary();
  const blocked = results.some((r) => r.status === 'FAIL');
  if (blocked) {
    console.log(`\n${C.red}${C.bold}게이트 실패 — 머지 차단${C.reset}`);
    process.exit(1);
  }
  console.log(
    `\n${C.green}${C.bold}모든 채팅 검증 게이트 통과.${C.reset} ` +
      `${C.dim}(integration 로컬 미실행 시 CI 가 최종 강제)${C.reset}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
