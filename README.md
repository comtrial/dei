# dei

Expo + Supabase monorepo.

## Prerequisites
- Node 20+, pnpm 9+
- Docker Desktop
- Supabase CLI: `brew install supabase/tap/supabase`

## Setup
```bash
pnpm install
cp apps/mobile/.env.example apps/mobile/.env
# apps/mobile/.env 의 ANON_KEY는 `pnpm db:start` 후 콘솔 출력에서 복사
pnpm db:start
pnpm db:gen-types
pnpm dev
```

## Stack
- `apps/mobile`: Expo (expo-router)
- `packages/api`: Supabase client + generated types
- `packages/shared`: 공통 유틸/타입
- `supabase/`: migrations, edge functions

## 환경 분리 전략
- 현재: 로컬 Supabase 1개
- 추후: remote dev 프로젝트 추가, 이후 prod 분리 (별도 계획서)
