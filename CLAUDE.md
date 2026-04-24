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

## Learnings

(아직 없음 -- 작업 중 발견한 패턴, 버그, 주의사항을 여기에 추가)
