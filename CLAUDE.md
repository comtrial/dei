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
