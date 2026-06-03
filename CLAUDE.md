# dei -- Expo + Supabase Monorepo

## Project Overview

개인 프로젝트 "dei". Turborepo + pnpm 모노레포 구조로 Expo 모바일 앱과 Supabase 백엔드를 관리한다.

## Structure

```
dei/
├── apps/
│   └── mobile/          # Expo app (expo-router, NativeWind)
│       ├── app/         # expo-router 페이지 (파일 기반 라우팅)
│       ├── components/  # 컴포넌트
│       │   └── ui/      # RNR 기반 UI 컴포넌트 (Button, Card, Dialog, Input, Text 등)
│       ├── hooks/       # 커스텀 훅
│       ├── lib/         # 유틸리티 (supabase client, cn() 등)
│       ├── constants/   # 테마 등 상수
│       └── global.css   # 디자인 토큰 (CSS 변수)
├── packages/
│   ├── api/             # @dei/api — Supabase client + DB types
│   └── shared/          # @dei/shared — 공용 유틸리티
├── supabase/            # Supabase 로컬 설정 (config.toml, migrations/)
└── turbo.json
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | 전체 워크스페이스 dev 서버 |
| `pnpm build` | 전체 빌드 |
| `pnpm lint` | 전체 린트 |
| `pnpm test` | 단위 + 컴포넌트 테스트 (Vitest + Jest) |
| `pnpm test:integration` | 로컬 Supabase 띄우고 통합 테스트 |
| `pnpm test:e2e` | Maestro E2E 시나리오 |
| `pnpm smoke:sentry` | Sentry 연동 확인용 1회성 이벤트 발송 |
| `pnpm db:start` | Supabase 로컬 시작 |
| `pnpm db:stop` | Supabase 로컬 중지 |
| `pnpm db:reset` | Supabase DB 리셋 |
| `pnpm db:gen-types` | DB 타입 생성 → `packages/api/src/database.types.ts` |
| `cd apps/mobile && pnpm start` | Expo dev server |
| `cd apps/mobile && pnpm ios` | iOS 시뮬레이터 실행 |

## Branch / Commit / PR 규약 (CRITICAL)

> AI agent 가 개발·충돌 해결을 많이 담당하는 환경에서, **사람이 변경 맥락을
> 놓치지 않도록** 브랜치 기준·PR 기록·검증 결과·사람 승인 지점을 남기는 규약.
> 협업 agent 도 이 규약을 따른다 — `.local/` 외 모든 변경에 적용. PR #40
> 이후의 baseline 부터 이 규약이 강제다.

### 1. 브랜치 관리

- **새 작업은 항상 `git fetch` 후 최신 `origin/main` 기준에서** 새 브랜치 생성.
- 브랜치명: **`feature/{담당자}/{YYYYMMDD}-{작업범위}`** 형태로 통일.
  - 예: `feature/b/20260530-portone-verify`
  - 예: `feature/c/20260530-room-grid`
- **PR #40 이후 기존 브랜치는 그대로 merge X — 참고용**으로만.
- 기존 브랜치에서 필요한 코드가 있으면 **전체 merge 가 아니라 diff 확인 후
  새 브랜치에 선별 이식**.
- 브랜치는 작게 유지 — 가능하면 **1~2 일 안에 PR**.
- **3 일 이상 열린 브랜치는 PR 전 `origin/main` 과 차이를 재확인**.
- 충돌이 큰 브랜치는 억지 rebase/merge 보다 **최신 `origin/main` 에서 새
  브랜치를 다시 따는 것** 우선.

### 2. 커밋 / PR

- **커밋은 작은 단위로 나누고, 한 커밋에는 한 의도만 담는다.**
- PR 본문에는 **변경 내용 + 영향 범위 + 검증 결과** 필수.
- PR 본문에 추가로 박을 항목: **AI 가 변경한 파일 / 변경 이유 / 사람이
  확인해야 할 부분**.

PR 본문 최소 템플릿:

```md
## 변경 내용
- ...

## 영향 범위
- 화면: ...
- DB / RPC: ...
- Edge Function: ...
- 정책 / 상수 (POLICY · taxonomy): ...

## 검증
- [ ] typecheck (`pnpm -F mobile exec tsc --noEmit` 등)
- [ ] lint (`pnpm lint`)
- [ ] test (`pnpm test`)
- [ ] integration / e2e-web (해당 시 `pnpm verify`)
- [ ] 실DB e2e (DB·realtime·Edge Function 변경 시 — Testing 규칙 7·8·9)

## AI 변경
- AI 가 건드린 파일:
- 변경 이유:
- 사람이 확인해야 할 부분 (임의 판단 / 임시 가정 / 외부 의존):
```

### 3. AI 작업물 관리

- **AI 에게 바로 수정시키기 전에** → 건드릴 파일과 위험 포인트를 먼저 보고
  받는다 (plan 단계 분리). `/task` 슬래시 커맨드(`.opencode/commands/task.md`
  + `docs/c-tasks/`) 가 이 패턴을 강제한다: **planner → implementer →
  verifier** 순차 호출, 각 단계마다 보고.
- 수정 후에는 **변경 파일별 요약 / 검증 결과 / AI 가 임의 판단한 부분** 확인.
- **충돌 해결도 AI 에게 바로 맡기지 않는다** — 먼저 충돌 리포트(어느 파일 ·
  어느 hunk · 어느 의도가 부딪쳤는지)를 받은 뒤 사람이 승인.

### 4. 검증 관리

- **"작업 완료" 와 "검증 완료" 를 분리한다** — 서로 다른 단계로 보고.
- **작업 완료** = 코드 구현 + 화면 연결 + placeholder 제거.
- **검증 완료** = typecheck + lint + test + 필요 시 실제 경로 확인 (실기 ·
  실DB · 실 Edge Function).
- **DB / Auth / Edge Function / 결제 / 알림 / Realtime 변경은 별도
  체크리스트** — 자세한 배포 산출물 체크리스트는 본 문서 Testing 규칙 8 ·
  9 참조 (`supabase functions deploy <name>` 누락, ES256 토큰 검증, 빌드타임
  env 임베드 등 실제로 놓쳤던 항목들).

### 5. 사람 승인 게이트 (NEVER 위반)

- 사용자 명시 지시 없이 **`git push` · `git push --force` · `git reset
  --hard` · `gh pr create` · `gh pr merge` 금지**.
- 협업 agent 가 충돌 자동 해소 시도 시 **사람 승인 전까지 push X**.
- 본 규약의 핸드오프 산출물(변경 파일 요약 · AI 임의 판단 · 검증 결과)이
  PR 본문에 박혀있지 않으면 **머지 차단 사유**.

## UI: RNR (React Native Reusables) + NativeWind (CRITICAL)

이 프로젝트는 RNR(React Native Reusables) + NativeWind 사용.

### 반드시 지켜야 할 규칙

1. **모든 UI는 `components/ui/`에서 먼저 찾아서 import. 없으면 `components/ui/`에 먼저 추가 후 사용.**
2. **새 RNR 컴포넌트 추가**: `npx @react-native-reusables/cli add <component-name>` (apps/mobile 디렉토리에서 실행)
3. **스타일링은 NativeWind `className` 사용. inline `StyleSheet` 금지.**
4. **디자인 토큰은 `global.css` CSS 변수로 관리. 하드코딩 금지.** (예: `bg-primary`, `text-muted-foreground`)
5. **`cn()` 유틸**: 조건부 클래스 병합 시 `lib/utils.ts`의 `cn()` 사용 (clsx + tailwind-merge)

### 현재 사용 가능한 UI 컴포넌트

`apps/mobile/components/ui/`: button, card, dialog, input, text, icon, collapsible, native-only-animated-view, icon-symbol

### 디자인 토큰 컬러 (tailwind.config.js에 매핑)

`background`, `foreground`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `popover`, `card`, `border`, `input`, `ring` -- 각각 `*-foreground` 변형 포함. 다크 모드 자동 지원.

## Error Logging: Sentry (`@dei/shared` logger) (CRITICAL)

이 프로젝트는 **Sentry** 를 통해 런타임 에러를 수집한다. **모든 에러 로깅은
`@dei/shared` 가 노출하는 `logger` 를 통해서만 한다.** Sentry SDK
(`@sentry/react-native`) 를 직접 import 해서 `captureException` / `captureMessage`
등을 호출하면 안 된다 — transport 는 mobile 진입점(`apps/mobile/lib/sentry.ts`)
에서 한 번만 등록한다.

### 반드시 지켜야 할 규칙

1. **에러 로깅 import 는 항상**: `import { logger } from '@dei/shared'`.
   `@sentry/react-native` 직접 import 금지 (단, `apps/mobile/lib/sentry.ts` 제외).
2. **`catch` 블록에서 단순 `console.error` 만 두면 안 된다.** 사용자에게 영향
   가는 실패는 반드시 `logger.captureException(err, { tags, extra })` 로 보고한다.
   회복 가능한 예상된 흐름(예: 사용자 입력 검증 실패) 은 캡처하지 않는다.
3. **비동기 경계 (이벤트 핸들러, route action, useEffect 안의 async 호출 등)
   에서는 `logger.withErrorCapture(name, fn, ctx)` 로 감싸 미캐치 예외를 방지한다.**
4. **로그인 성공 시 `logger.setUser({ id })`, 로그아웃 시 `logger.setUser(null)`**
   을 호출해 Sentry 이벤트와 사용자를 연결한다 (PII 인 email 은 가능하면 빼기).
5. **새 transport 가 필요하면 `registerLoggerTransport` 를 통해 교체한다.**
   (테스트 환경에서 in-memory transport 등)

### 사용 예시

```ts
import { logger } from '@dei/shared';

// 1) 단순 캡처
try {
  await dangerousOp();
} catch (err) {
  logger.captureException(err, {
    tags: { feature: 'report-submit' },
    extra: { reportId },
  });
  throw err; // 호출자에게도 전파
}

// 2) 비동기 경계 wrap
const onSubmit = () =>
  logger.withErrorCapture('report.submit', async () => {
    await submitReport(payload);
  }, { tags: { screen: 'report-form' } });

// 3) breadcrumb / 메시지
logger.addBreadcrumb({ message: 'navigate', category: 'nav', data: { to } });
logger.captureMessage('soft-fail: stale cache', 'warning');

// 4) 사용자 컨텍스트
logger.setUser({ id: session.user.id });
```

### 환경 변수 (`.env`)

| 변수 | 위치 | 설명 |
|------|------|------|
| `EXPO_PUBLIC_SENTRY_DSN` | apps/mobile | Sentry DSN. 미설정 시 SDK 비활성화 (콘솔 fallback). |
| `EXPO_PUBLIC_SENTRY_ENV` | apps/mobile | 환경 라벨 (development/staging/production). |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | CI 전용 | sentry-cli 소스맵 업로드용. 절대 커밋 금지. |

> 참고: `SENTRY_CLIENT_ID` / `SENTRY_CLIENT_SECRET` 은 OAuth/Internal Integration
> 자격이며 SDK 의 DSN 과 다르다. SDK 초기화에는 사용하지 않는다.

## 협업·브랜치 거버넌스 (CRITICAL — AI 가 개발·충돌해결을 많이 담당하므로)

> 목적: AI 가 속도를 높이더라도 **최종 판단은 사람**이 가져가고, 모든 변경이
> **최신 main 기준 브랜치·PR 기록·검증 결과**로 추적 가능하게. 사람이 소스를
> 한 줄씩 검수하지 않아도 변경 맥락을 놓치지 않는 최소 규율. (강제는 이 규칙 +
> 기존 CI `verify` 게이트로 충분 — 별도 git hook 안 둠. 더 강제하면 속도만 느려짐.)

### 1. 브랜치 관리

1. **새 작업은 항상 `git fetch` 후 최신 `origin/main` 기준에서 새 브랜치 생성.**
   (release 라인 작업이면 그 기준 브랜치 최신본에서. 어느 기준인지 PR 에 명시.)
2. **브랜치명 = `feature/{담당자}/{YYYYMMDD}-{작업범위}`.**
   예: `feature/b/20260530-portone-verify` · `feature/c/20260530-room-grid`.
3. **PR #40 이후 기존 브랜치는 그대로 merge 하지 않고 참고용으로만** 본다.
   필요한 코드가 있으면 **전체 merge 금지 → diff 확인 후 새 브랜치에 선별 이식.**
4. 브랜치는 작게 유지하고 **1~2일 안에 PR**. 3일 이상 열린 브랜치는 PR 전
   `origin/main` 과 차이를 다시 확인한다.
5. **충돌이 큰 브랜치는 억지 rebase/merge 보다 최신 `origin/main` 에서 새 브랜치를
   다시 따는 것을 우선**한다.

### 2. 커밋 / PR 관리

1. 커밋은 작은 단위, **한 커밋에 한 의도**.
2. PR 본문에는 변경 내용 + **영향 범위 + 검증 결과**를 반드시 적는다.
3. PR 본문에 **다음 3가지를 항상 남긴다**(사람이 검수 없이 맥락 잡게):
   - **AI 가 변경한 파일** (목록)
   - **변경 이유**
   - **사람이 확인해야 할 부분** (AI 가 임의 판단한 지점·위험 포인트)

### 3. AI 작업물 관리 (사람 승인 지점 — ★AI 가 반드시 지킬 것)

1. **수정 착수 전:** 건드릴 파일과 위험 포인트를 **먼저 사람에게 보고**한다.
   (대규모·공유파일·🔴 테이블·Edge/Auth/결제/Realtime 변경은 특히.)
   사소한 단일 파일·로컬 유틸은 보고 생략 가능하나, 애매하면 보고한다.
2. **수정 후:** 변경 파일별 요약 + 검증 결과 + **AI 가 임의 판단한 부분**을 보고한다.
3. **충돌 해결은 AI 에게 바로 맡기지 않는다.** AI 는 먼저 **충돌 리포트**(무엇이
   왜 충돌, 해소안 후보)를 내고 **사람 승인 후** 해결한다. 자동 해결 금지.
4. **outward-facing 액션**(main 직접 push, 머지, 외부 전송, 배포)은 durable 승인이
   없는 한 사람 확인 후 진행. 한 맥락의 승인이 다음으로 자동 연장되지 않는다.

### 4. 검증 관리 — "작업 완료" ≠ "검증 완료"

1. **작업 완료** = 코드 구현 / 화면 연결 / placeholder 제거까지.
2. **검증 완료** = typecheck + lint + test (+ 필요 시 실제 경로 확인)까지.
   둘을 분리해 보고한다. "작업 다 했다" 를 "검증됐다" 로 보고하지 말 것.
3. **DB / Auth / Edge Function / 결제 / 알림 / Realtime 변경은 별도 체크리스트**
   (이 문서 Testing §8·9 의 배포 산출물·실DB e2e 체크리스트) 를 빠짐없이 적용.

> 한 줄 요약: AI 가 빠르게 만들되 — **최신 main 기준 브랜치 / 추적되는 PR 기록 /
> 검증 결과 / 사람 승인 지점**을 남긴다. 충돌·위험 변경은 보고→승인 후.

## Testing (CRITICAL)

테스트는 **계층별로 도구가 다릅니다.** 새 코드를 짤 때 어느 계층에 테스트를
넣어야 할지 먼저 정하고 시작하세요.

| 계층 | 대상 | 도구 | 위치 | 실행 |
|---|---|---|---|---|
| Unit | 순수 로직 (logger, utils, supabase client glue) | **Vitest** | `__tests__/*.test.ts` 코드 옆 | `pnpm test` |
| Component | RN 컴포넌트 / screen | **Jest + jest-expo + RNTL** | `components/**/__tests__/*.test.tsx` | `pnpm test` |
| Integration | 실제 Supabase 쿼리, RLS, auth flow | **Vitest** + 로컬 supabase | `apps/mobile/__tests__/integration/` | `pnpm test:integration` |
| Contract | admin ↔ mobile API 스키마 | **Vitest + MSW + zod** | `packages/api/src/__tests__/contract*.test.ts` | `pnpm test` |
| E2E-web | 화면 단위 사용자 흐름 (DOM 레벨) | **Playwright + RN-web 하네스** | `apps/mobile/e2e/playwright/specs/` | `pnpm test:e2e:web` |
| E2E-native | 실기기 시나리오 (회원가입~신고 등) | **Maestro** | `apps/mobile/.maestro/flows/` | `pnpm test:e2e` |

### 반드시 지켜야 할 규칙

1. **Vitest 와 Jest 영역을 섞지 말 것.** Vitest = `lib/`, `packages/*`. Jest = RN
   컴포넌트만. `apps/mobile/jest.config.js` 의 `testPathIgnorePatterns` 가
   이미 `lib/` 를 제외하도록 잡혀있음 — 이걸 깨뜨리지 마세요.
2. **로깅 / Sentry 테스트는 항상 mock.** 자동 테스트가 실제 Sentry 로 이벤트를
   보내면 dashboard 가 더러워집니다. `apps/mobile/jest.setup.ts` 에서 글로벌
   mock 처리 + Vitest 쪽은 `vi.mock('@sentry/react-native', ...)`.
3. **Integration 테스트는 로컬에선 `skipIf` 로 자동 스킵하되, CI 에서는
   반드시 실제 실행된다.** 로컬 무도커 스킵 패턴은
   `apps/mobile/__tests__/integration/setup.ts` 의 `isSupabaseReachable`.
   CI(`chat-verify.yml`)는 `supabase start` + `supabase status` 로
   service-role 키를 주입해 *실제 실행* 하며, 실행 케이스 0건이면 게이트를
   **FAIL** 시킨다. "skip 됐으니 통과"는 금지 — 그건 서버 0검증이다.
4. **Contract 테스트는 zod schema 를 단일 source of truth 로.** 새 admin
   엔드포인트가 생기면 `packages/api/src/schemas/` 에 zod 추가 → mobile 도
   동일 schema import. 스키마 없이 응답 파싱 금지.
5. **E2E 셀렉터는 `testID` 우선.** 텍스트만으로 찾으면 i18n / copy 변경에 깨짐.
   네이밍 `<feature>-<역할>` (예: `chat-composer-send`).
6. **E2E-web 하네스는 화면을 재구현하지 않는다.** `apps/mobile/e2e/harness`
   가 *프로덕션 스크린* 을 RN-web 으로 마운트하고 Supabase/router/auth
   경계만 모킹. 새 화면 추가 시 하네스가 깨지면 화면 코드가 잘못된 것.
7. **DB·realtime 연동 기능은 push 전 실DB e2e 로 관통 검증한다 (CRITICAL).**
   unit/component/e2e-web 은 전부 mock 이라 "통과해도 실제 동작 보장 안 됨".
   특히 **realtime 메시지 왕복, 매칭→대화방→메시지 전체 사용자 여정, RLS
   실제 가시성** 은 mock 으로는 절대 못 잡는다 (실제로 채팅 시스템에서
   realtime 왕복 미검증·RLS status 갭이 mock 게이트 전부 통과한 뒤에야
   실DB e2e 에서 발견됨). 패턴: 전용 테스트 유저(이메일 prefix
   `e2e-*@example.test`)만 생성·사용 → 원격/로컬 Supabase 에 실제 RPC·
   realtime 구독으로 흐름 관통 → `try/finally` 로 테스트 데이터 전량
   cleanup (기존 실데이터 무접촉, 시작=끝 카운트 동일 확인). 기준 구현·
   리포트: 채팅 시스템 실DB e2e 패턴(`feat/chat-system` 브랜치 / git
   history 참조 — rooms-pivot zero-base 후 rooms 모듈 e2e 로 재정립
   예정). **"단위/통합 테스트 다 통과" 를 실DB 동작 검증으로 보고하지 말 것**
   — 통과율 ≠ 실제 동작. 협업 agent 는 DB/realtime 변경 PR 을 올리기 전
   해당 흐름의 실DB e2e 를 추가·실행하고 그 결과를 근거로 보고한다.
8. **백엔드 변경은 "배포 산출물 체크리스트" 를 빠짐없이 — DB 마이그레이션과
   Edge Function 배포는 별개 경로다 (CRITICAL, 실제로 놓쳤던 항목).**
   `supabase db push`/마이그레이션 적용은 테이블·RLS·RPC 만 반영하고
   **Edge Function 은 배포되지 않는다** (`supabase functions deploy <name>`
   별도 필수). 실제로 채팅에서 마이그레이션만 적용하고 `send-message`/
   `leave-conversation` Edge Function 을 안 올려, 앱이 "전송에 실패했어요"
   로 죽었다 — 실DB e2e 가 RPC 를 직접 호출(앱과 다른 경로)해 통과했기에
   못 잡았다. 그래서:
   - **백엔드 기능 완료 정의 = (a) 마이그레이션 적용 + (b) 관련 Edge
     Function 전부 배포 + (c) 클라가 실제 타는 경로(Edge Function 우선,
     RPC 폴백)로 e2e 검증.** (a)만 하고 "DB 반영 완료" 라 보고 금지.
   - **실DB e2e 는 앱과 동일 경로로 호출하라.** RPC 직접 호출만 하면
     Edge Function 미배포·Edge 로직 버그를 통째로 못 잡는다. `supabase
     .functions.invoke(...)` 경로를 최소 1개 핵심 flow 에 포함.
   - 배포 산출물 체크리스트(백엔드 PR 자가점검): 마이그레이션 적용 ✅ /
     `supabase functions list` 에 신규/변경 함수 존재 ✅ / 클라가 의존하는
     env(.env / Edge secrets) 존재 ✅ / 앱 경로 e2e 통과 ✅. 하나라도
     비면 "기능 완료" 아님.
9. **e2e 의 정의 = "실제 클라이언트의 전체 스택을 그대로 재현". 사용자가
   지적 안 해도 아래를 사전 검증하라 (CRITICAL — 이번에 3겹으로 놓침).**
   "DB 행이 생긴다" 는 e2e 가 아니다. 실제 앱이 겪는 것: ① **배포 상태**
   (Edge Function 이 원격에 떠 있나 — 미배포면 앱은 닿지도 못함) ② **환경
   변수 주입 시점** (Expo `EXPO_PUBLIC_*` 는 빌드타임 임베드 — .env 를
   빌드 후 바꾸면 실행 중 앱은 옛 백엔드를 봄. 변경 시 재빌드 필수)
   ③ **인증 토큰 형식 호환** (이 프로젝트 JWT 는 **ES256/JWKS(비대칭)**.
   Edge Function 의 `_shared/auth.ts` 가 토큰을 실제로 검증할 수 있는
   라이브러리 버전인가 — 구버전 supabase-js 는 ES256 거부). 이 셋은
   mock·RPC직접·단위 어디서도 안 잡히고 **앱이 쓰는 그대로의 토큰·URL·
   배포본으로 호출해야만** 드러난다.
   - **DB/Edge/auth 변경 PR 의 e2e 는 반드시**: 전용 테스트 유저의 **실제
     발급 JWT**(password grant 등, 프로젝트 실제 alg)로 → **원격 배포된**
     Edge Function 을 → **앱과 동일한 `functions.invoke` 경로**로 호출 →
     DB 반영까지 확인. 토큰을 service_role 로 우회하거나 RPC 직접 호출로
     대체하면 ①②③ 전부 못 잡는다 (그게 이번 누락의 원인).
   - **자가 사전검증 의무**: 협업 agent 는 이 항목들을 사용자가 명시
     요청하지 않아도 PR 전 스스로 점검·실행하고, 결과를 근거로 보고한다.
     "통과했다" 가 아니라 "앱과 동일 경로 e2e 로 ①②③ 포함 검증함" 이라고
     보고. 못 한 항목은 못 했다고 명시.

## 채팅 검증 게이트 (CRITICAL — "수동 폰 확인 불필요" 의 근거)

채팅 모듈은 **개발자가 폰으로 안 눌러봐도** 머지 가능하다는 확신을
`.github/workflows/chat-verify.yml` 의 6단계 게이트가 보장한다. 단계는
직렬 `needs:` 체인이고 하나라도 실패하면 머지 차단이며, 집계 잡
`chat-verify` 가 branch protection required check 다.

```
lint → typecheck → unit → component → integration(실제 Supabase) → e2e-web(Playwright)
```

로컬 단일 재현: **`pnpm verify`** (Docker 없으면 integration 만
`NOT-RUN-LOCALLY` 로 정직 표기, CI 가 강제).

### 스펙 flow → 보장 계층 매핑 (수동 검증 대체 근거)

| 스펙 (DEV-SPEC) | 커버 계층 | 검증 위치 |
|---|---|---|
| CH0 게이트 (ENTERED/BLOCKED/ENDED/NOT_FOUND) | Unit + Integration + E2E-native | `lib/chat/__tests__/route-gate.test.ts`, `chat-conversations-rls.test.ts`, `.maestro/chat-10a` |
| CH1 목록 / 10-B | Component + E2E-web | `ChatListRow.test.tsx`, `ch1-list.spec.ts`, `.maestro/chat-10b` |
| CH2 컴포저 글자수/전송/10-E retry | Unit + Component + E2E-web | `message.test.ts`, `ChatComposer.test.tsx`, `ch2-room.spec.ts` |
| CH3 빈 상태 / 10-I | Component + E2E-web | `ChatEmptyState.test.tsx`, `ch1-list.spec.ts` |
| CH4 더보기 / CH5 나가기 / 10-F | Component + E2E-web + Integration | `ChatMoreSheet/LeaveChatDialog.test.tsx`, `ch4-ch5-leave.spec.ts`, `leave_conversation` it |
| CH-API1/2 서버 계약·RLS·차단·소프트삭제 | Integration (실제 Supabase) | `chat-conversations-rls.test.ts` |
| CH-RT 무음 정리 / 10-H | E2E-web | `ch2-room.spec.ts` (room-ended-incoming) |

> 상세 결정 트리 / testID 규칙 / 협력자 절차: `apps/mobile/e2e/README.md`.

### Sentry 가 실제로 붙었는지 확인하는 법

```bash
pnpm smoke:sentry
```

→ `environment=smoke-test` 로 1건 발송. 결과는
`https://deai-13.sentry.io/projects/react-native/?environment=smoke-test`
에서 즉시 확인.

## Supabase

- `@dei/api` 패키지의 `createSupabaseClient()` 사용
- `apps/mobile/lib/supabase.ts`에서 클라이언트 생성 (env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`)
- DB 스키마 변경 후 반드시 `pnpm db:gen-types` 실행하여 타입 동기화
- 타입: `import type { Database } from '@dei/api'`

## Path Alias

`apps/mobile` 내에서 `@/*` -> `./*` 매핑 (tsconfig.json).

```ts
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useColorScheme } from '@/hooks/use-color-scheme';
```

## Key Dependencies

- **Expo SDK 54** (expo-router v6)
- **React 19.1**, React Native 0.81
- **NativeWind 4** (Tailwind CSS 3 기반)
- **@supabase/supabase-js 2**
- **lucide-react-native** -- 아이콘
- **@rn-primitives/** -- RNR 내부 프리미티브 (dialog, portal, slot)
- **@sentry/react-native** -- 런타임 에러 로깅 (직접 사용 금지, `@dei/shared` logger 경유)

## Learnings

(아직 없음 -- 작업 중 발견한 패턴, 버그, 주의사항을 여기에 추가)
