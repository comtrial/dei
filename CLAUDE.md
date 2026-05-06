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

## Testing (CRITICAL)

테스트는 **계층별로 도구가 다릅니다.** 새 코드를 짤 때 어느 계층에 테스트를
넣어야 할지 먼저 정하고 시작하세요.

| 계층 | 대상 | 도구 | 위치 | 실행 |
|---|---|---|---|---|
| Unit | 순수 로직 (logger, utils, supabase client glue) | **Vitest** | `__tests__/*.test.ts` 코드 옆 | `pnpm test` |
| Component | RN 컴포넌트 / screen | **Jest + jest-expo + RNTL** | `components/**/__tests__/*.test.tsx` | `pnpm test` |
| Integration | 실제 Supabase 쿼리, RLS, auth flow | **Vitest** + 로컬 supabase | `apps/mobile/__tests__/integration/` | `pnpm test:integration` |
| Contract | admin ↔ mobile API 스키마 | **Vitest + MSW + zod** | `packages/api/src/__tests__/contract*.test.ts` | `pnpm test` |
| E2E | 사용자 시나리오 (회원가입~신고 등) | **Maestro** | `apps/mobile/.maestro/flows/` | `pnpm test:e2e` |

### 반드시 지켜야 할 규칙

1. **Vitest 와 Jest 영역을 섞지 말 것.** Vitest = `lib/`, `packages/*`. Jest = RN
   컴포넌트만. `apps/mobile/jest.config.js` 의 `testPathIgnorePatterns` 가
   이미 `lib/` 를 제외하도록 잡혀있음 — 이걸 깨뜨리지 마세요.
2. **로깅 / Sentry 테스트는 항상 mock.** 자동 테스트가 실제 Sentry 로 이벤트를
   보내면 dashboard 가 더러워집니다. `apps/mobile/jest.setup.ts` 에서 글로벌
   mock 처리 + Vitest 쪽은 `vi.mock('@sentry/react-native', ...)`.
3. **Integration 테스트는 `it.skipIf` 로 docker 없는 환경에서 자동 스킵.** 패턴은
   `apps/mobile/__tests__/integration/setup.ts` 의 `isSupabaseReachable` 참고.
4. **Contract 테스트는 zod schema 를 단일 source of truth 로.** 새 admin
   엔드포인트가 생기면 `packages/api/src/schemas/` 에 zod 추가 → mobile 도
   동일 schema import. 스키마 없이 응답 파싱 금지.
5. **E2E 셀렉터는 `testID` 우선.** 텍스트만으로 찾으면 i18n / copy 변경에 깨짐.

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
