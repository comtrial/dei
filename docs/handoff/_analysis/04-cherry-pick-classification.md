I now have a complete picture. Let me compile the classification. The analysis is complete — I have read the load-bearing files and can classify the rest by category from the file tree, since their nature (config, domain route, domain component, migration) is unambiguous.

---

# main → release/dei-ver2 파일 분류 (KEEP / ZERO / PLACEHOLDER)

분류 원칙: 도메인색(영상로그/매칭/좋아요/채팅/큐레이션/결제/본인확인/알림)이 묻은 것은 ZERO, 도메인 무지(infra/build/test-harness/순수유틸/transport SSOT)인 것만 KEEP. 알림·portone·영상은 "이식 안 함 + 인터페이스 placeholder만".

## 1. 모노레포 뼈대 / 빌드·테스트 셋업 — 전부 KEEP (단, 도메인 의존 끊기)

| 파일 | 판정 | 근거 |
|---|---|---|
| `package.json` (root) | KEEP | turbo/pnpm 스크립트. `register-flags` 줄만 제거(도메인) |
| `turbo.json` | KEEP | 파이프라인 구조, 도메인 무지 |
| `pnpm-workspace.yaml`, `.npmrc`, `pnpm-lock.yaml` | KEEP | 워크스페이스 정의. lock 은 의존 정리 후 재생성 권장 |
| `vitest.workspace.ts` | KEEP | 테스트 워크스페이스 루트 |
| `scripts/verify.mjs` | KEEP | `pnpm verify` 게이트 러너, 도메인 무지 |
| `.gitignore`, `.env.example` | KEEP | 인프라 |
| `apps/mobile/babel.config.js`, `metro.config.js`, `jest.config.js`, `jest.setup.ts`, `vitest.config.ts`, `vitest.integration.config.ts`, `vitest.setup.ts`, `playwright.config.ts`, `eslint.config.js` | KEEP | 빌드/테스트 셋업. `jest.setup.ts`/`vitest.setup.ts`의 Sentry·PostHog 글로벌 mock 은 그대로 가치 있음 |
| `apps/mobile/nativewind-env.d.ts` | KEEP | NativeWind 타입 shim |
| `apps/mobile/tsconfig.json`, `tsconfig.e2e.json` | KEEP | `@/*` alias 포함 |
| `apps/mobile/components.json` | KEEP | RNR CLI 설정 (컴포넌트 추가 경로). 토큰값은 새 디자인에 맞게 갱신 |
| `apps/mobile/.vscode/*`, `apps/mobile/.gitignore` | KEEP | 인프라 |
| `apps/mobile/scripts/reset-project.js` | KEEP | Expo 보일러플레이트 유틸, 도메인 무지 |
| `apps/mobile/scripts/smoke-sentry.ts` | KEEP | Sentry 연동 확인용, 도메인 무지 |

## 2. EAS / 배포 — KEEP

| 파일 | 판정 | 근거 |
|---|---|---|
| `apps/mobile/eas.json` | KEEP | 빌드 프로파일 |
| `apps/mobile/app.json` | KEEP(편집) | 뼈대는 유지하되 도메인 plugin(`@portone/react-native-sdk/plugin`, expo-camera 권한 문구, BILLING 권한) 은 제거/placeholder. `scheme:"dei"`, bundleId 유지 |
| `app.json` (루트, untracked `{"expo":{}}`) | ZERO | 빈 stub, 의미 없음. 추적 안 됨 |
| `apps/mobile/EAS-QA.md` | KEEP | 배포 QA 절차 문서, 도메인 약함 |

## 3. @dei/shared (logger + analytics transport SSOT) — 전부 KEEP

| 파일 | 판정 | 근거 |
|---|---|---|
| `packages/shared/src/logger.ts` | KEEP | transport 패턴 SSOT, 도메인 무지 |
| `packages/shared/src/analytics.ts` | KEEP | PostHog transport 추상화, 도메인 무지 (이벤트명만 도메인이지 transport는 아님) |
| `packages/shared/src/index.ts` | KEEP | re-export |
| `packages/shared/__tests__/logger.test.ts`, `analytics.test.ts` | KEEP | 위 둘의 단위테스트 |
| `packages/shared/package.json`, `tsconfig.json`, `vitest.config.ts` | KEEP | 패키지 셋업 |

## 4. @dei/api — 분리 판정 (client glue=KEEP, 도메인 타입/스키마=ZERO)

| 파일 | 판정 | 근거 |
|---|---|---|
| `packages/api/src/client.ts` | KEEP | `createSupabaseClient()` 순수 glue, 도메인 무지 |
| `packages/api/src/index.ts` | KEEP(편집) | re-export. `schemas`/`types` 도메인 export 줄은 정리 |
| `packages/api/src/database.types.ts` | ZERO | 2058줄 도메인 스키마(profiles/likes/matches/logs…) 생성물. `pnpm db:gen-types`로 새로 생성 |
| `packages/api/src/types.ts` | ZERO | Profile/Report/ModerationCase 등 도메인 타입 |
| `packages/api/src/schemas/index.ts`, `schemas/report.ts`, `schemas/__tests__/report.test.ts` | ZERO | report 도메인 zod 계약 |
| `packages/api/src/__tests__/client.test.ts` | KEEP | client glue 테스트 |
| `packages/api/src/__tests__/contract.test.ts` | ZERO | 도메인 API 계약 테스트 |
| `packages/api/package.json`, `tsconfig.json`, `vitest.config.ts`, `vitest.setup.ts` | KEEP | 패키지 껍데기 (의존 정리) |

## 5. Supabase glue / config — 분리

| 파일 | 판정 | 근거 |
|---|---|---|
| `apps/mobile/lib/supabase.ts` | KEEP | env→client 생성 glue, android URL rewrite. 도메인 무지 |
| `apps/mobile/lib/sentry.ts` | KEEP | Sentry transport 등록 진입점. CLAUDE.md가 명시한 SSOT |
| `apps/mobile/lib/posthog.ts` | KEEP | PostHog transport 등록 진입점, 도메인 무지 |
| `supabase/config.toml` | KEEP(편집) | 로컬 인프라. `[edge_runtime.secrets]`의 PORTONE_*/PHONE_HASH_SALT(도메인) 줄만 제거 |
| `supabase/.gitignore` | KEEP | 인프라 |
| `supabase/seed.sql`, `seed_h2_test.sql` | ZERO | 도메인 시드 데이터 |
| `supabase/migrations/*` (전부, ~50개) | ZERO | likes/matches/chat/curation/feature_flags/identity/iap 도메인 스키마. zero에서 새로 |
| `supabase/migrations_legacy/*` | ZERO | 폐기된 도메인 마이그레이션 |

## 6. CI / 워크플로우

| 파일 | 판정 | 근거 |
|---|---|---|
| `.github/workflows/ci.yml` | KEEP | install→typecheck→test 구조, 도메인 무지 |
| `.github/pull_request_template.md` | KEEP | 인프라 |
| `.github/workflows/chat-verify.yml` | ZERO(구조 참고) | 채팅 6단계 게이트. 구조 패턴만 참고, 새 도메인용으로 재작성 |
| `.github/workflows/e2e.yml`, `integration.yml` | ZERO(구조 참고) | Maestro/통합 실행 셸 구조만 참고. 호출 대상이 도메인 |

## 7. `apps/mobile/lib/` 파일별 판정 (도메인색 정밀 분류)

순수유틸 = KEEP / 도메인 = ZERO / 외부SDK 어댑터 = ZERO(참고).

| 파일 | 판정 | 근거 |
|---|---|---|
| `lib/utils.ts` | **KEEP** | `cn()` clsx+twMerge, 순수 |
| `lib/dateHelpers.ts` | **KEEP** | getToday/getYesterday 로컬날짜, 순수 |
| `lib/formatDuration.ts` | **KEEP** | ms→mm:ss 순수 포맷 |
| `lib/formatters.ts` | **KEEP** | 상대시간/한국어 날짜 포맷, 순수 (도메인 무관) |
| `lib/timeOfDay.ts` | KEEP/경계 | hour→'오전/낮' 순수. 일반유틸로 보존 가능. "데일리로그 슬롯" 전제면 도메인 — 새 도메인 없으면 보류 가능. **유틸로 KEEP 권장** |
| `lib/dailyLog.ts` | ZERO | 데일리 영상로그 슬롯(24/TimeSlot) 도메인 |
| `lib/profileLogs.ts` | ZERO | 프로필 영상로그 매핑 도메인 |
| `lib/recordingStore.ts` | ZERO | 영상 촬영 result 플로우 상태 |
| `lib/videoCache.ts` | ZERO(참고) | 영상 LRU 디스크캐시. 영상모듈 미이식 → placeholder만 |
| `lib/videoThumbnail.ts` | ZERO | 영상 썸네일(이미 no-op stub) |
| `lib/videoUrls.ts` | ZERO | logs/thumbnails 버킷 path 변환 도메인 |
| `lib/dev-auth.ts` | KEEP/경계 | localhost:54321 감지 순수 boolean. identity bypass env가 도메인색. **dev 헬퍼로 KEEP 가능, env키만 정리** |
| `lib/dev-payment.ts` | ZERO | `complete_local_dev_consumable_purchase` 결제 RPC |
| `lib/refresh-purchase.ts` | ZERO | RevenueCat refresh/heart IAP 도메인 |
| `lib/revenuecat.ts` | ZERO(참고) | RevenueCat SDK 어댑터. 결제 미이식 → placeholder |
| `lib/feature-flags.ts` | ZERO | home_top_layout 등 도메인 flag |
| `lib/feature-flags-catalog.ts` | ZERO | 도메인 flag 카탈로그 |
| `lib/identity-verification.ts` | ZERO(참고) | PortOne 본인확인. 미이식 → placeholder |
| `lib/notifications.ts` | ZERO(참고) | 알림 타입/푸시토큰. 미이식 → placeholder (아래 §9) |
| `lib/theme.ts` | ZERO | THEME 토큰값(특정 HSL 팔레트)/NAV_THEME. 새 디자인 토큰으로. 구조 참고만 |
| `lib/routes.ts` | ZERO | welcome/likes/matched/chat… 도메인 라우트 + Eligibility 타입 |
| `lib/chat/*` (service/enter/message/opponent-profile/push-deeplink/route-gate/types + __tests__) | ZERO | 채팅 도메인 전부 |

## 8. app/ 라우트 · components · hooks · providers · constants — 전부 ZERO

| 그룹 | 판정 | 근거 |
|---|---|---|
| `apps/mobile/app/**` (모든 라우트/레이아웃/__tests__) | ZERO | expo-router 도메인 화면. zero에서 새 라우트 트리 |
| `apps/mobile/components/ui/*` 전부 | ZERO | RNR 컴포넌트지만 현 토큰/variant에 묶임. `components.json` 두고 `npx @react-native-reusables/cli add`로 새로 추가 (CLAUDE.md 규칙). 구버전 RNR(button/card/dialog/input/text/icon 등) 참고 가능하나 가져오지 않음 |
| `components/home,chat,likes,log-detail,profile,navigation,app/*` | ZERO | 도메인 컴포넌트 |
| `components/themed-*, parallax-scroll-view, hello-wave, external-link` | ZERO | Expo 템플릿 잔재. 새로 |
| `hooks/use*` 전부 (useHomeScreen, useChat*, useLike*, useMatches, useNotifications, useTodayLogs, useCachedVideoSource 등) | ZERO | 도메인 데이터훅 |
| `hooks/use-color-scheme*.ts`, `use-theme-color.ts` | ZERO/경계 | 색상 스킴 훅 — RNR 표준 보일러. RNR 재설치 시 함께 생성됨. 가져올 필요 X |
| `providers/*` (auth/account-gate/root-gate/feature-flags) | ZERO | 도메인 인증·게이트·플래그 프로바이더 |
| `constants/theme.ts`, `constants/profile-options.ts` | ZERO | 도메인 토큰/옵션 |
| `apps/mobile/global.css`, `tailwind.config.js` | ZERO | 현 디자인 토큰. 새 디자인 시스템으로 재작성 |

## 9. 알림 / PortOne / 영상 — 인터페이스 경계 placeholder (이식 안 함)

해당 구현·테스트·Edge·마이그레이션은 전부 ZERO. 단, 앱 진입점·provider·router가 깨지지 않도록 **타입 시그니처만 남기는 placeholder 경계**가 필요:

- **알림 경계** (`lib/notifications.ts` 대체 placeholder):
  - `RegisterPushTokenInput` 타입 + `registerPushToken(input): Promise<void>` no-op stub
  - `NotificationType`/`AppNotification` 타입은 일반화 또는 제거. 딥링크 라우팅 훅(`useNotifications`)은 미구현 stub
  - 경계 위치: 푸시토큰 등록 1지점, 알림→route 매핑 1지점
- **PortOne(본인확인) 경계** (`lib/identity-verification.ts` 대체 placeholder):
  - `startIdentityVerification(): Promise<never>`(`throw new Error('not implemented')`) + `confirmIdentityVerification(...)` stub
  - `@portone/browser-sdk`/`@portone/react-native-sdk` 의존 제거, `app.json` plugin 제거, `config.toml` PORTONE_* secrets 제거
  - 경계 위치: 인증 플로우의 본인확인 단계 1지점(인터페이스만)
- **영상 경계** (`videoCache`/`videoUrls`/`videoThumbnail`/`useCachedVideoSource` 대체):
  - `resolveVideoUrl(path): string` + `getOrCreatePoster(): Promise<null>`(현재도 no-op) + `prefetchVideo(): Promise<void>` no-op stub
  - `expo-video`/`expo-camera`/`expo-video-thumbnails` 의존 및 권한 문구는 도메인 확정 후 재도입
  - 경계 위치: 영상 URL 해석 1지점, 캐시 prefetch 1지점

> 공통: 이 셋은 `@dei/shared` logger/analytics transport처럼 "transport/adapter 경계" 1개씩만 두고, 실제 SDK 연결은 도메인 재설계 후. RevenueCat/IAP(`revenuecat.ts`/`refresh-purchase.ts`)도 동일하게 결제 placeholder 경계로 취급 권장.

## 10. docs / AGENTS / README

| 파일 | 판정 | 근거 |
|---|---|---|
| `docs/**` (TASK_*, chat-spec, dev1-sign-in-up, plans, posthog-spec, portone-auth-scope 등) | ZERO(참고) | 전부 도메인 스펙/리포트. 새 도메인 스펙으로 |
| `docs/LOCAL_DEV_DB_SETUP.md`, `REMOTE_DB_ACCESS.md`, `tech-stack.md` | KEEP/경계 | DB 셋업·스택 설명은 인프라성 — 갱신해 KEEP 가능 |
| `CLAUDE.md` | KEEP(편집) | 프로젝트 규칙. UI/Sentry/Testing 규칙 골격 유지, 채팅 게이트·도메인 매핑 섹션은 정리 |
| `AGENTS.md`, `README.md`, `apps/mobile/README.md` | KEEP(편집) | 골격 유지, 도메인 서술 정리 |

## 11. E2E 하네스 / Maestro — ZERO(패턴 참고)

| 그룹 | 판정 | 근거 |
|---|---|---|
| `apps/mobile/__harness_shims__/*` | ZERO(패턴 KEEP) | lucide/expo-router/nativewind/rnp-* shim **메커니즘**은 재사용 가치 큼(e2e-web 패턴). 단 내용은 현 컴포넌트 트리에 묶임 → 새로 |
| `apps/mobile/e2e/harness/*`, `e2e/playwright/specs/*`, `e2e/README.md`, `playwright/vite.config.ts` | ZERO | 채팅 도메인 e2e-web |
| `apps/mobile/.maestro/**` | ZERO | sign-in/chat 도메인 시나리오 |
| `apps/mobile/__tests__/integration/*` | ZERO | 전부 도메인 RLS/RPC 통합테스트. `setup.ts`의 `isSupabaseReachable` 패턴만 참고 |

## 12. Edge Functions / assets

| 그룹 | 판정 | 근거 |
|---|---|---|
| `supabase/functions/_shared/auth.ts`, `cors.ts`, `hash.ts` | KEEP/경계 | cors/auth/hash 는 도메인 무지 공용. ES256/JWKS 검증 로직(auth.ts)은 인프라 가치 — KEEP 후보 |
| `supabase/functions/_shared/analytics.ts`, `revenuecat.ts` | ZERO | analytics 이벤트/RevenueCat 도메인 |
| `supabase/functions/{send-message,leave-conversation,get-curation-feed,finalize-log,notify-video-review,*identity*,*refresh*,revenuecat-webhook}/index.ts` | ZERO | 도메인 Edge 전부 |
| `apps/mobile/assets/images/*` | ZERO | react-logo 등 Expo 템플릿 잔재 + 도메인 아이콘. 새 브랜드 에셋으로 |

---

### 요약 KEEP 코어 (최소 이식 세트)
루트: `package.json`(편집)·`turbo.json`·`pnpm-workspace.yaml`·`.npmrc`·`vitest.workspace.ts`·`scripts/verify.mjs`·`.gitignore`·`.env.example` / mobile 셋업: `babel·metro·jest·vitest(×3)·playwright·eslint config`·`nativewind-env.d.ts`·`tsconfig(×2)`·`components.json`·`jest.setup·vitest.setup`(mock 포함)·`eas.json`·`app.json`(편집)·`reset-project.js`·`smoke-sentry.ts` / packages: `shared/*` 전부, `api/{client.ts,index.ts(편집),__tests__/client.test.ts,package.json,tsconfig,vitest*}` / glue: `lib/{supabase,sentry,posthog,utils,dateHelpers,formatDuration,formatters}.ts`(+ 경계로 `timeOfDay.ts`,`dev-auth.ts`) / supabase: `config.toml`(편집)·`.gitignore` / CI: `ci.yml`·`pull_request_template.md` / Edge: `_shared/{auth,cors,hash}.ts`.

**ZERO 핵심**: `app/**`, `components/**`, `hooks/**`, `providers/**`, `constants/**`, `global.css`, `tailwind.config.js`, `lib/theme.ts`·`routes.ts`·`chat/*`·도메인 lib, `packages/api/{database.types,types,schemas}`, `supabase/migrations*/**`·seed, 모든 도메인 Edge, e2e/maestro/integration, `assets/images/*`.

**Placeholder 경계 3종**: 알림(push token 등록·route 매핑), PortOne(본인확인 start/confirm), 영상(URL 해석·poster·prefetch) — 각 transport/adapter 경계 1개씩 no-op stub + 외부 SDK 의존·app.json plugin·config secrets 동시 제거. 결제(RevenueCat/IAP)도 동일 placeholder 권장.