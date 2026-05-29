# dei "과팅/방" — 개발자 핸드오프 (release/dei-ver2)

> **이 문서 하나로 시작한다.** A(최승원)가 1차 셋팅한 *토대 + 디자인 시스템 +
> 스키마 골격 + 아키텍처 + 빈 화면 스캐폴딩 + 공통 규약* 을 B(변경규)·C(손승태)에게
> 넘긴다. 디자인·화면의 단일 원천(SSOT)은 와이어프레임 `all-screens (3).html`.
>
> 상세 설계는 `docs/superpowers/specs/2026-05-29-dei-1차-셋팅-핸드오프-design.md`,
> 구현 계획은 `docs/superpowers/plans/2026-05-29-dei-1차-셋팅-핸드오프.md`,
> 분석 산출물은 `docs/handoff/_analysis/`.

---

## 0. 한 줄 요약

main 의 검증된 플랫폼 인프라만 가져오고(cherry-pick), 도메인·디자인은 백지에서
재구성했다. v4 디자인 시스템 `@dei/ui` 가 토큰+모든 화면 시각요소를 담고, 화면은
**거기서만** 가져다 쓴다(ESLint 강제). Supabase 새 스키마 골격은 원격에 반영 완료.

---

## 1. 작업자 모델

| 코드 | 이름 | 담당 |
|---|---|---|
| **A** | 최승원 | 공통 플랫폼·디자인 시스템·스키마 거버넌스·배포·매칭 엔진·방 내부 채팅·Admin |
| **B** | 변경규 | 온보딩·매칭 화면·결제·셀프서비스 설정·신고 접수 |
| **C** | 손승태 | 영상·방 |
| PM | — | 신고·안전 운영 판정/집행 (Admin) |

화면별 담당은 각 파일 헤더 주석의 `담당자:` + `docs/handoff/screens/S*.md`.

---

## 2. 절대 뒤집지 말 결정 (사용자 합의 완료)

- **디자인 SSOT = `all-screens (3).html`.** main 옛 디자인 참조 금지.
- **화면은 무조건 `@dei/ui` 토큰·컴포넌트만 import.** raw 스타일(inline style /
  raw hex / StyleSheet.create) 금지 — **ESLint 가 error 로 막고 CI(`rooms-verify`)가 머지 차단.**
- **DM(1:1 채팅) 완전 제거.** 단체 채팅 + `message.whisper_to_user_id` @멘션 귓속말만.
  DM 은 나중에 *별도 화면*(이번 미구현, 스키마에 `direct_message` 없음).
- **알림·PortOne·영상 = 이식 안 함.** 인터페이스 경계 + placeholder stub 만(아래 §7).
- **Admin 이번 제외.** service_role Edge/RPC 골격 + 핸드오프 마커만.

---

## 3. cherry-pick vs zero 경계

**KEEP(인프라, 도메인 무관):** turborepo/pnpm 뼈대, mobile 빌드·테스트 설정
(babel/metro/jest/vitest/playwright/eslint), `@dei/shared`(logger/analytics/policy),
`@dei/api` glue(client + Database 타입), supabase glue(lib/supabase·sentry·posthog),
순수 유틸(utils/dateHelpers/timeOfDay), eas.json/app.json, ci.yml.

**ZERO(삭제·재생성, 도메인색):** 옛 도메인 `lib/*`·`components/*`·`app/*`·hooks,
옛 디자인(global.css/tailwind/components/ui/constants/theme), 옛 마이그레이션·Edge
Functions, 옛 도메인 통합테스트·워크플로우.

> ⚠️ `apps/mobile/e2e/` 의 Playwright 하네스는 **옛 채팅 도메인 참고용**으로만
> 남아있다(현재 컴파일 안 됨, 메인 typecheck/verify 제외). C 가 방/채팅 화면을
> 구현하며 하네스를 재구성할 때 패턴 참고. 자세히는 `apps/mobile/e2e/README.md` 상단 경고.

---

## 4. 디자인 시스템 `@dei/ui` (CRITICAL)

`packages/ui` — 토큰 + 37개 컴포넌트(primitives 21 + patterns 16). HTML 값 그대로 코드화.

```
packages/ui/src/
├── tokens/      color · radius · shadow · typography · spacing · preset(NativeWind)
├── primitives/  Avatar Badge Button Card Checkbox Chip EmptyBlob IconButton Input
│                PhotoUpload Popover ProgressBar PulseRing Radio Select SheetHandle
│                SlideToConfirm Spinner Text Textarea Toggle
└── patterns/    AlertDialog Banner BottomActionBar BottomSheet BrandTransitionFrame
                 ChatBubble ChoiceList CompareCard FullscreenVideo GridRoom InputBar
                 PermissionGate ProfileHero SettingsRow StateView TopNav
```

### 화면을 만들 때 (강제 규약)

1. **UI 는 `@dei/ui` 에서 import.** `import { Button, Text, Card } from '@dei/ui';`
2. **스타일은 NativeWind className 토큰만.** `bg-bg` `bg-paper` `text-ink-3`
   `text-accent` `rounded-md` 등. **raw hex·inline style·StyleSheet 금지.**
3. **조건부 클래스 병합은 `cn()`** — `@dei/ui` 가 export. (커스텀 토큰
   `text-display`/`text-md`/`text-2xs` 충돌 방지 처리 포함.)
4. DS 에 없는 시각요소가 있으면 → **직접 스타일링 말고** A 에게 `@dei/ui` 추가 요청.
   (전수 추출로 미커버 0 을 목표했으니 거의 없어야 정상. 근거:
   `_analysis/06-ds-element-coverage.md` 31화면 × 167별칭 → 37컴포넌트.)

위반 시 `pnpm ds-enforce`(= `eslint app --max-warnings=0`)가 막고 CI 가 머지 차단.

---

## 5. 데이터 스키마 골격 (A 선제 고정 — 원격 반영 완료)

ref `sjlzidjnpczysygnlmtk` 에 **21테이블** 적용됨. 타입은 `import type { Database } from '@dei/api'`.

```
profile · auth_verification · team · team_invite · team_member · match_queue
group_match · match_member · room · room_member · room_lifecycle · video
message · message_mention · block · report · payment · pass
notification_setting · refund_ticket · audit
```

### 거버넌스 규칙

- PK 전부 `id uuid default gen_random_uuid()` (1:1 테이블은 `user_id` PK).
- 방 도메인 RLS = `public.room_is_member(room_id, auth.uid())` security-definer **단일 게이트**.
- status = 자유 text 아닌 `check` 제약. realtime = `room`/`room_member`/`message` 만 publication.
- 상태 전이는 Edge Function/RPC(security definer) **단일 경로**, RLS 는 방어선.

### 충돌 핫스팟 (🔴 — 변경 전 A 협의)

`profile`(새 컬럼 멱등, A 승인) · `group_match`(C 단독) · `room`/`room_member`
(A 가 `room_is_member`·RLS 선고정) · `message`(방 채팅=A, @멘션 귓속말 경로).
전체 R/W·충돌 매트릭스: `_analysis/02-schema-skeleton.md`.

> **스키마 변경 후 반드시 `pnpm db:gen-types`** → `packages/api/src/database.types.ts` 동기화.
> **DM 미구현(D-08): `direct_message` 없음.** 단체 채팅 + @멘션 귓속말만.

---

## 6. 화면 인벤토리 + 라우팅

23개 화면(변형 포함 31, S01 splash 포함). expo-router 파일 기반 라우팅 + typedRoutes.
라우트 상수 = `apps/mobile/lib/routes.ts`(`ROUTES`/`roomRoutes`). 라우트↔파일 맵 =
`_analysis/screen-route-map.json`. 화면별 상세 = `docs/handoff/screens/S*.md`.

```
app/
├── _layout.tsx              루트 + providers(Auth/RootGate/SafeArea/Gesture) + Sentry/PostHog init
├── index.tsx                S01 splash — 5분기 라우팅 부트스트랩(비로그인/프로필미완성/매칭전/매칭중/방있음)
├── (auth)/                  terms(S02) · verify(S03) · verify-failed(S03f)            [B]
├── (onboarding)/profile/    step1(S04) · step2(S04b) · step3(S04c)                    [B]
└── (app)/
    ├── home(S05) queue(S07) team/new(S06) permission/notification(S07a)              [B]
    ├── match/cancel-confirm(S08) match/failed(S09) booster(S17) booster-failed(S18)  [B]
    ├── my-profile(S19) settings/{notifications(S22),withdraw(S20)} support(S23)      [B]
    ├── report/{[targetId](S21),block-report(S15)}                                    [B]
    ├── permission/camera(S11a)                                                       [C]
    └── room/[roomId]/
        ├── index(S13 8셀 ★) preview(S10) members(S14) capture-failed(S12)            [C]
        ├── upload(S11) upload-preview(S11b) video/[videoId](S13b)                    [C]
        ├── chat(S13a 방 내부 채팅)                                                   [A]
        └── leave-confirm(S16)                                                        [B]
```

> (app) 그룹은 **탭이 아닌 Stack** — SSOT 동선상 영구 하단 탭바가 없다(근거: `(app)/_layout.tsx` 주석).
> 딥링크: `dei://room/[roomId]`.

### 화면 개발 시작하는 법

1. `docs/handoff/screens/S{NN}.md` + 화면 파일 헤더 주석을 읽는다(의존 DS/데이터/이벤트/서버/정책 다 적혀있음).
2. 헤더의 "의존 DS 컴포넌트" 를 `@dei/ui` 에서 import (전부 이미 존재함이 보장).
3. 데이터는 `@dei/api` supabase client + 스키마 타입. 이벤트는 `lib/analytics-taxonomy.ts` 상수.
4. raw 스타일 0 으로 구현 → `pnpm -F mobile typecheck` + `pnpm ds-enforce` 통과 확인.

---

## 7. 공통 아키텍처 골격

| 영역 | 위치 | 규약 |
|---|---|---|
| 라우팅 | `app/_layout.tsx` + 그룹 layout | (auth)/(onboarding)/(app) + splash 5분기 |
| 인증 | `providers/auth-provider.tsx` | Supabase Auth 익명 → PortOne 승격(placeholder) + `logger.setUser` |
| 세션 가드 | `providers/root-gate.tsx` | 세션 없이 보호 그룹 진입 시 splash 로 |
| 데이터페칭 | (컨벤션) TanStack Query | 스캐폴딩 단계라 Provider 미설치 — 첫 데이터 화면 담당이 도입 |
| Realtime | `lib/realtime.ts` | 채널 = `room:{roomId}` 규약. `roomChannel()`·`subscribeRoomMessages()` 만 사용 |
| 권한 | `lib/permissions.ts` + `@dei/ui` PermissionGate | camera 실동작 / notification stub + 시스템설정 deeplink |
| 이벤트 | `lib/analytics-taxonomy.ts` | 31개 이벤트 상수(raw 문자열 capture 금지) |
| 에러 로깅 | `@dei/shared` `logger` | `@sentry/react-native` 직접 import 금지(CLAUDE.md) |
| 정책 | `@dei/shared` `POLICY` | 매칭/방/안전/결제/알림 L2 값 SSOT (`packages/shared/src/policy.ts`) |

### placeholder stub (D-12 — 다른 담당이 채움)

- `lib/notifications.stub.ts` — 푸시/로컬 알림 (A 인프라 / B 설정표면). 조회는
  안전 placeholder, 발송/등록은 `throw`.
- `lib/portone.stub.ts` — 본인인증/결제 (B). 전부 `throw`.
- `lib/video.stub.ts` — 촬영/업로드/블러게이트 (C). 전부 `throw`.

`@portone/react-native-sdk`·`react-native-purchases` 는 package.json 에 *참고용* 으로만
남아있다(앱 코드는 stub 만 import). 담당이 붙일 때 실제 호출부 연결.

---

## 8. 정책 (L2)

`@dei/shared` `POLICY` + `REPORT_CATEGORIES`. 근거 = dei-ver2 `decisions.md` D1~D11.
핵심: 팀 최대 5명 · 방 수명 7일 · 큐 만료 24h · 블러게이트 24h · 새벽 알림 0~7 KST 차단
· auto-kick `ceil((n-1)/2)` · 신고 6카테고리 · 19+ 게이트 · 가격 하드코딩 금지(product id 만).
> 이 값들은 본래 서버 config 로 빼는 게 목표 — 현재는 타입 고정 기본값/폴백.

---

## 9. 검증 게이트 (수동 폰 확인 대체 근거)

`.github/workflows/rooms-verify.yml` — 직렬 `needs:` 체인, 집계 잡 `rooms-verify` 가
branch protection required check.

```
ds-enforce(DS 강제 lint) → typecheck → unit(vitest) → component(jest) → integration(실 Supabase)
```

- **ds-enforce** = 사용자 요구 "DS 안 쓰면 PR 튕기기". `eslint app --max-warnings=0`.
- 로컬 재현: `pnpm -F mobile typecheck` · `pnpm ds-enforce` · `pnpm -F @dei/ui test`(vitest+jest) · `pnpm -F @dei/shared test`.
- e2e-web 은 이번 제외(화면 스캐폴딩 단계, spec §9) — C 가 방/채팅 화면 구현 시 추가.

### 백엔드 변경 시 (CLAUDE.md 규칙 8·9 — 반드시)

마이그레이션 적용 ≠ Edge Function 배포 (`supabase functions deploy` 별도). DB/Edge/auth
변경 PR 은 **앱과 동일 경로**(발급 JWT ES256 → 원격 배포 Edge → `functions.invoke`)로
실DB e2e 검증. service_role 우회·RPC 직접 호출로 대체하면 배포/토큰/env 문제를 못 잡는다.

---

## 10. 환경·배포

- 식별자·시크릿 전달 = `docs/handoff/SECRETS.md` (값 0).
- OTA: app.json `updates`+`runtimeVersion` / eas.json `channel`(development/preview/production).
- `EXPO_PUBLIC_*` 는 빌드타임 임베드 → 변경 시 **재빌드 필수**.
- Sentry 연동 확인: `pnpm smoke:sentry`.
