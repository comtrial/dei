# PostHog rooms/queue 4대 퍼널 계측 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 rooms/queue 제품의 4대 퍼널(Activation/Match/Engagement/Safety·결제)을 잇는 spine 이벤트 8건을 계측하고, 퍼널 정의를 SSOT로 코드화한 뒤 contract+component 테스트로 CI 머지 게이트에 자동 편입한다.

**Architecture:** 모든 spine 이벤트는 `@dei/shared` 의 `analytics.capture(ANALYTICS_EVENTS.<key>, props)` client 경로로 발송(기존 인프라 재사용, 신규 transport·Edge 없음). 4대 퍼널은 `lib/analytics/funnels.ts` 단일 진실원천에 선언하고, vitest contract 테스트가 spine 키 누락을 컴파일+런타임으로 잡는다. 실PostHog 관통 e2e는 온디맨드 스크립트(게이트 밖).

**Tech Stack:** TypeScript, Expo/expo-router, `@dei/shared` analytics, Vitest(unit/contract), Jest+RNTL(component), PostHog(`posthog-react-native` SDK는 `lib/posthog.ts`에서만).

**참조 스펙:** `docs/superpowers/specs/2026-06-07-rooms-funnels-design.md`

---

## File Structure

- `apps/mobile/lib/analytics-taxonomy.ts` — **수정**: spine 이벤트 8건 상수 추가 (`F##:` prefix).
- `apps/mobile/lib/analytics/funnels.ts` — **생성**: 4대 퍼널 SSOT + `FUNNEL_EVENT_KEYS` 파생.
- `apps/mobile/lib/analytics/__tests__/funnel-contract.test.ts` — **생성**: contract 테스트(vitest, CI unit 게이트).
- `apps/mobile/app/_layout.tsx` — **수정**: `app_opened`.
- `apps/mobile/app/(auth)/verify.tsx` — **수정**: `phone_verification_succeeded`.
- `apps/mobile/app/(onboarding)/profile/step3.tsx` — **수정**: `onboarding_completed`.
- `apps/mobile/app/(app)/queue.tsx` — **수정**: `room_matched`.
- `apps/mobile/app/(app)/room/[roomId]/upload-preview.tsx` — **수정**: `video_uploaded`.
- `apps/mobile/app/(app)/booster.tsx` — **수정**: `booster_paywall_shown`/`_purchase_attempted`/`_purchase_succeeded`.
- 각 화면 `__tests__/*.test.tsx` — **수정/생성**: capture assertion (CI component 게이트).
- `apps/mobile/scripts/e2e-posthog-funnels.ts` — **생성**: 실PostHog 관통 e2e(온디맨드).
- `apps/mobile/package.json` / 루트 `package.json` — **수정**: `posthog:e2e` script.

> **사전 주의(모든 구현자에게):** `apps/mobile/app/**` 는 ds-enforce(ESLint, `--max-warnings=0`) 대상이다. inline style/raw hex/StyleSheet.create 금지. 본 작업은 capture 한 줄 추가뿐이라 스타일 변경 없음. import 순서/미사용 import 경고도 0이어야 한다.

---

## Task 1: spine 이벤트 8건 택소노미 추가

**Files:**
- Modify: `apps/mobile/lib/analytics-taxonomy.ts`

- [ ] **Step 1: 신규 상수 8건 추가**

`ANALYTICS_EVENTS` 객체 안, `} as const;` 직전에 아래 블록을 추가한다 (기존 항목은 그대로 둔다):

```ts
  // ── 퍼널 spine (F##:) — rooms/queue 4대 퍼널 (2026-06-07 design) ──
  // A Activation
  app_opened: 'F0:app_opened',
  phone_verification_succeeded: 'F0:phone_verification_succeeded',
  onboarding_completed: 'F0:onboarding_completed',
  // B Match
  room_matched: 'F1:room_matched',
  // C Engagement
  video_uploaded: 'F2:video_uploaded',
  // D Monetization(결제 신호)
  booster_paywall_shown: 'F3:booster_paywall_shown',
  booster_purchase_attempted: 'F3:booster_purchase_attempted',
  booster_purchase_succeeded: 'F3:booster_purchase_succeeded',
```

- [ ] **Step 2: 타입 통과 확인**

Run: `pnpm -F mobile exec tsc --noEmit`
Expected: PASS (에러 없음). 신규 키가 `AnalyticsEventKey` 유니온에 자동 편입된다.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/analytics-taxonomy.ts
git commit -m "feat(analytics): 퍼널 spine 이벤트 8건 택소노미 추가 (F##:)"
```

---

## Task 2: 퍼널 SSOT + contract 테스트 (TDD)

**Files:**
- Create: `apps/mobile/lib/analytics/funnels.ts`
- Create: `apps/mobile/lib/analytics/__tests__/funnel-contract.test.ts`

> 이 테스트는 vitest(unit). `apps/mobile/lib/**` 는 jest 에서 제외돼 있고(vitest 영역), `pnpm -F mobile test:unit` 로 실행된다. CLAUDE.md Testing 규칙 1(영역 분리) 준수.

- [ ] **Step 1: 실패하는 contract 테스트 작성**

Create `apps/mobile/lib/analytics/__tests__/funnel-contract.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { FUNNELS, FUNNEL_EVENT_KEYS } from '@/lib/analytics/funnels';

describe('funnel contract', () => {
  it('4대 퍼널이 정의돼 있고 id 가 유일하다', () => {
    const ids = FUNNELS.map((f) => f.id);
    expect(ids).toEqual(['activation', 'match', 'engagement', 'monetization']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('각 퍼널은 최소 2개 step (퍼널 성립 요건)을 가진다', () => {
    for (const f of FUNNELS) {
      expect(f.steps.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('모든 step 키가 ANALYTICS_EVENTS 에 실존한다', () => {
    for (const f of FUNNELS) {
      for (const key of f.steps) {
        expect(ANALYTICS_EVENTS[key], `${f.id} step "${key}" 미존재`).toBeDefined();
      }
    }
  });

  it('신규 spine 이벤트 8건이 taxonomy 에 등록돼 있다', () => {
    const required = [
      'app_opened',
      'phone_verification_succeeded',
      'onboarding_completed',
      'room_matched',
      'video_uploaded',
      'booster_paywall_shown',
      'booster_purchase_attempted',
      'booster_purchase_succeeded',
    ] as const;
    for (const key of required) {
      expect(ANALYTICS_EVENTS[key], `spine "${key}" 누락`).toBeDefined();
    }
  });

  it('spine 이벤트는 F##: prefix 규칙을 따른다', () => {
    const spine = [
      'app_opened',
      'phone_verification_succeeded',
      'onboarding_completed',
      'room_matched',
      'video_uploaded',
      'booster_paywall_shown',
      'booster_purchase_attempted',
      'booster_purchase_succeeded',
    ] as const;
    for (const key of spine) {
      expect(ANALYTICS_EVENTS[key]).toMatch(/^F\d+:/);
    }
  });

  it('FUNNEL_EVENT_KEYS 는 4대 퍼널의 모든 step 을 중복 없이 포함한다', () => {
    const fromFunnels = new Set(FUNNELS.flatMap((f) => f.steps));
    expect(new Set(FUNNEL_EVENT_KEYS)).toEqual(fromFunnels);
    expect(FUNNEL_EVENT_KEYS.length).toBe(fromFunnels.size); // 중복 없음
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm -F mobile test:unit -- funnel-contract`
Expected: FAIL — `Cannot find module '@/lib/analytics/funnels'` (아직 미생성).

- [ ] **Step 3: funnels.ts SSOT 작성**

Create `apps/mobile/lib/analytics/funnels.ts`:

```ts
/**
 * 4대 퍼널 SSOT (design 2026-06-07).
 * ------------------------------------------------------------------
 * 퍼널 = 순서 있는 step + 동일인(identify) + 시간 창. 각 step 은
 * ANALYTICS_EVENTS 의 "키"(런타임 문자열 아님)를 참조한다 — taxonomy 가 바뀌면
 * 여기 키가 컴파일 에러로 깨져 퍼널 정의 표류를 막는다.
 *
 * 이 파일이 "퍼널이란 무엇인가"의 단일 진실원천이다. contract 테스트
 * (__tests__/funnel-contract.test.ts)·실PostHog e2e·PostHog 대시보드 정의가
 * 모두 이 정의를 따른다.
 */
import { type AnalyticsEventKey } from '@/lib/analytics-taxonomy';

export interface FunnelDef {
  id: 'activation' | 'match' | 'engagement' | 'monetization';
  title: string;
  /** 순서 있는 step. 각 원소는 ANALYTICS_EVENTS 의 키. 위→아래 = 퍼널 위→아래. */
  steps: AnalyticsEventKey[];
}

export const FUNNELS: readonly FunnelDef[] = [
  {
    id: 'activation',
    title: 'Activation (가입→온보딩→첫 진입)',
    steps: [
      'app_opened',
      'terms_agreement_screen_entered',
      'phone_verification_succeeded',
      'onboarding_completed',
      'home_entered_waiting',
    ],
  },
  {
    id: 'match',
    title: 'Match (큐 등록→방 입장)',
    steps: [
      'home_entered_waiting',
      'team_queue_registered',
      'room_matched',
      'room_preview_entered_blurred',
      'room_joined_unblurred',
    ],
  },
  {
    id: 'engagement',
    title: 'Engagement (방 입장→영상/대화) · North Star 후보',
    steps: [
      'room_joined_unblurred',
      'video_capture_entered',
      'video_uploaded',
      'room_chat_opened',
    ],
  },
  {
    id: 'monetization',
    title: 'Monetization (바로 매치 결제 신호)',
    steps: [
      'booster_paywall_shown',
      'booster_purchase_attempted',
      'booster_purchase_succeeded',
    ],
  },
] as const;

/** 4대 퍼널에 등장하는 모든 spine 이벤트 키(중복 제거). contract 테스트가 검증. */
export const FUNNEL_EVENT_KEYS: readonly AnalyticsEventKey[] = Array.from(
  new Set(FUNNELS.flatMap((f) => f.steps)),
);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F mobile test:unit -- funnel-contract`
Expected: PASS (6 tests). 만약 step 키 중 하나라도 ANALYTICS_EVENTS 에 없으면 tsc/테스트가 FAIL — 이게 의도된 가드다.

- [ ] **Step 5: 전체 unit + typecheck 회귀 확인**

Run: `pnpm -F mobile exec tsc --noEmit && pnpm -F mobile test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/analytics/funnels.ts apps/mobile/lib/analytics/__tests__/funnel-contract.test.ts
git commit -m "feat(analytics): 4대 퍼널 SSOT(funnels.ts) + contract 테스트(CI unit 게이트)"
```

---

## Task 3: `app_opened` 계측 (Activation 시작점)

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`

- [ ] **Step 1: import 추가**

`apps/mobile/app/_layout.tsx` 상단 import 블록에 추가 (line 10 `initPostHog` import 옆 그룹):

```ts
import { analytics } from '@dei/shared';

import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';
import { supabase } from '@/lib/supabase';
```

> import 순서 주의: `@dei/shared`(외부 패키지 그룹) → 빈 줄 → `@/...`(로컬 그룹). 기존 `@/lib/posthog` 등 로컬 import 와 같은 그룹에 둔다.

- [ ] **Step 2: useEffect 안에서 app_opened 발송**

`_layout.tsx` 의 `useEffect(() => { initSentry(); initPostHog(); }, [])` 를 아래로 교체:

```ts
  useEffect(() => {
    initSentry();
    initPostHog();
    // app_opened — Activation 퍼널 분모. 토큰 보유 여부는 저장된 세션으로 판정.
    void supabase.auth.getSession().then(({ data }) => {
      analytics.capture(ANALYTICS_EVENTS.app_opened, {
        has_token: Boolean(data.session),
        source: 'cold_start',
      });
    });
  }, []);
```

- [ ] **Step 3: 타입·lint 확인**

Run: `pnpm -F mobile exec tsc --noEmit && pnpm -F mobile exec eslint app/_layout.tsx --max-warnings=0`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/_layout.tsx
git commit -m "feat(analytics): app_opened 계측 (Activation 퍼널 분모)"
```

---

## Task 4: `phone_verification_succeeded` 계측

**Files:**
- Modify: `apps/mobile/app/(auth)/verify.tsx`
- Test: `apps/mobile/app/(auth)/__tests__/verify.test.tsx` (없으면 생성)

- [ ] **Step 1: verify.tsx 의 인증 성공 지점에 capture 추가**

`handleComplete` 안, `await promoteWithIdentity(result);` 바로 다음 줄(현재 line 164~165 사이)에 추가:

```ts
        await promoteWithIdentity(result);
        analytics.capture(ANALYTICS_EVENTS.phone_verification_succeeded, {
          existing_member: Boolean(result.existingMember),
        });
        setVerificationRequest(null);
```

> `analytics` import 가 `verify.tsx` 에 이미 있는지 확인: `import { analytics } from '@dei/shared'` 가 없다면 기존 `@dei/shared` import 에 `analytics` 를 추가한다(이미 `ANALYTICS_EVENTS` 는 import 됨 — line 124 의 `phone_auth_cancelled_by_user` 사용처로 확인).

- [ ] **Step 2: component 테스트 — 인증 성공 시 capture 검증**

`apps/mobile/app/(auth)/__tests__/verify.test.tsx` 가 이미 있으면 아래 케이스를 추가하고, 없으면 파일을 만들되 **기존 `upload-preview.test.tsx` 패턴(jest.mock 으로 의존성 차단 + `mockAnalyticsCapture` 스파이)을 그대로 따른다.** verify.tsx 는 PortOne SDK·auth-provider 등 의존이 많으므로, 신규 작성이 과하면 다음 대안을 쓴다:

**대안(권장):** 인증 성공 지점이 client 함수이므로, 만약 `verify.test.tsx` 신규 작성의 mock 비용이 크면 이 capture 의 검증을 **Task 9 의 실PostHog e2e + Task 2 contract** 로 위임하고, 여기서는 최소한 "capture 호출 라인이 promoteWithIdentity 성공 분기에 있다"를 코드리뷰로 확인한다. (component 테스트 생성 여부는 구현자가 mock 복잡도를 보고 판단하되, 만들면 아래 골격을 쓴다.)

```tsx
// 골격 — 기존 의존성(@portone, auth-provider, identity-verification lib)을 jest.mock 으로 차단한 뒤:
//   const mockAnalyticsCapture = jest.fn();
//   jest.mock('@dei/shared', () => ({
//     analytics: { capture: (...a: unknown[]) => mockAnalyticsCapture(...a), identify: jest.fn(), reset: jest.fn() },
//     logger: { captureException: jest.fn(), withErrorCapture: (_n: string, fn: () => unknown) => fn() },
//   }));
// 인증 성공 시뮬레이션 후:
//   expect(mockAnalyticsCapture).toHaveBeenCalledWith(
//     'F0:phone_verification_succeeded',
//     expect.objectContaining({ existing_member: expect.any(Boolean) }),
//   );
```

- [ ] **Step 3: 검증**

Run: `pnpm -F mobile exec tsc --noEmit && pnpm -F mobile exec eslint "app/(auth)/verify.tsx" --max-warnings=0`
Expected: PASS.
테스트를 추가했으면: `pnpm -F mobile test:component -- verify` → PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/app/(auth)/verify.tsx" "apps/mobile/app/(auth)/__tests__/verify.test.tsx"
git commit -m "feat(analytics): phone_verification_succeeded 계측 (Activation)"
```

---

## Task 5: `onboarding_completed` 계측

**Files:**
- Modify: `apps/mobile/app/(onboarding)/profile/step3.tsx`
- Test: `apps/mobile/app/(onboarding)/profile/__tests__/step3.test.tsx` (없으면 생성, step1.test.tsx 패턴 참조)

- [ ] **Step 1: step3.tsx 의 온보딩 완료 지점에 capture 추가**

`handleFinish` 안, 기존 `analytics.capture(ANALYTICS_EVENTS.profile_step_completed, {...})`(현재 line 150~154) **바로 다음**에 추가:

```ts
        analytics.capture(ANALYTICS_EVENTS.profile_step_completed, {
          mbti: mbti || 'unknown',
          region,
          step: 3,
        });
        analytics.capture(ANALYTICS_EVENTS.onboarding_completed);

        router.replace(ROUTES.home);
```

> `analytics`·`ANALYTICS_EVENTS` 는 step3.tsx 에 이미 import 됨(기존 profile_step_completed 사용).

- [ ] **Step 2: component 테스트**

`step3.test.tsx` 가 있으면 "완료 시 onboarding_completed 발사" 케이스를 추가한다. step1 에는 `__tests__/step1.test.tsx` 가 있으므로 그 패턴(jest.mock supabase/expo-router/@dei/shared + 저장 버튼 press → capture 검증)을 따른다:

```tsx
// 저장(완료) 액션 후:
//   expect(mockAnalyticsCapture).toHaveBeenCalledWith('F0:onboarding_completed');
// (인자 없는 capture 이므로 두 번째 인자 없이 호출됨을 확인)
```

- [ ] **Step 3: 검증**

Run: `pnpm -F mobile exec tsc --noEmit && pnpm -F mobile exec eslint "app/(onboarding)/profile/step3.tsx" --max-warnings=0`
Expected: PASS. 테스트 추가 시: `pnpm -F mobile test:component -- step3` → PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/app/(onboarding)/profile/step3.tsx" "apps/mobile/app/(onboarding)/profile/__tests__/step3.test.tsx"
git commit -m "feat(analytics): onboarding_completed 계측 (Activation 분자 직전)"
```

---

## Task 6: `room_matched` 계측 (Match — 큐→방 전환)

**Files:**
- Modify: `apps/mobile/app/(app)/queue.tsx`
- Test: `apps/mobile/app/(app)/__tests__/queue.test.tsx` (없으면 생성)

- [ ] **Step 1: routeToRoom 단일 지점에 capture 추가**

`queue.tsx` 의 `routeToRoom` 함수(현재 line 122~127)를 아래로 교체. race-check·realtime 두 경로가 모두 이 함수를 거치므로 한 곳만 계측하면 된다. 단, 동일 매칭으로 두 번 호출될 수 있으니 `cancelled` 가드 뒤에 둔다(이미 한 번 라우팅하면 effect cleanup 으로 재호출 방지):

```ts
    const routeToRoom = (roomId: string) => {
      if (cancelled) {
        return;
      }
      analytics.capture(ANALYTICS_EVENTS.room_matched, { room_id: roomId });
      router.replace(roomRoutes.index(roomId));
    };
```

- [ ] **Step 2: import 확인/추가**

`queue.tsx` 상단에 `analytics` 와 `ANALYTICS_EVENTS` 가 import 돼 있는지 확인. 없으면:
- `@dei/shared` import 에 `analytics` 추가 (기존에 `logger` 만 import 중이면 `{ analytics, logger }`).
- 로컬 그룹에 `import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';` 추가.

- [ ] **Step 3: component 테스트**

`queue.test.tsx` 신규 작성(upload-preview.test.tsx 패턴). supabase realtime/from 을 mock 하고, race-check 가 `room_id` 를 반환하도록 만들어 `routeToRoom` 이 타게 한 뒤:

```tsx
//   await waitFor(() => {
//     expect(mockAnalyticsCapture).toHaveBeenCalledWith('F1:room_matched', { room_id: 'room-xyz' });
//     expect(mockReplace).toHaveBeenCalled();
//   });
```

mock 골격(필수 mock 대상): `expo-router`(useRouter/useLocalSearchParams/useFocusEffect), `@/lib/supabase`(channel/from/select/eq/maybeSingle 체인), `@/providers/auth-provider`(useAuth → user), `@dei/shared`(analytics.capture 스파이 + logger.withErrorCapture 는 fn 즉시 실행, captureException jest.fn).

- [ ] **Step 4: 검증**

Run: `pnpm -F mobile exec tsc --noEmit && pnpm -F mobile exec eslint "app/(app)/queue.tsx" --max-warnings=0 && pnpm -F mobile test:component -- queue`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/app/(app)/queue.tsx" "apps/mobile/app/(app)/__tests__/queue.test.tsx"
git commit -m "feat(analytics): room_matched 계측 (Match — 큐→방 전환)"
```

---

## Task 7: `video_uploaded` 계측 (Engagement)

**Files:**
- Modify: `apps/mobile/app/(app)/room/[roomId]/upload-preview.tsx`
- Test: `apps/mobile/app/(app)/room/[roomId]/__tests__/upload-preview.test.tsx` (존재)

- [ ] **Step 1: 실패하는 테스트 먼저 추가 (TDD)**

`__tests__/upload-preview.test.tsx` 의 `'"올리기" 탭 → uploadClip mock 호출 → router.replace 호출'` 테스트(line 59~82)의 `waitFor` 블록 안에 assertion 추가:

```ts
      expect(mockAnalyticsCapture).toHaveBeenCalledWith('F2:video_uploaded', {
        room_id: 'room-123',
        duration_sec: 2.3,
      });
```

(durationMs param 이 '2300' 이므로 duration_sec = 2.3.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm -F mobile test:component -- upload-preview`
Expected: FAIL — `mockAnalyticsCapture` 가 `F2:video_uploaded` 로 불린 적 없음.

- [ ] **Step 3: upload-preview.tsx 성공 분기에 capture 추가**

`handleUpload` 의 `try` 블록, `await uploadClip(...)` 성공 직후 `router.replace` **전**(현재 line 117~118 사이)에 추가:

```ts
      await uploadClip(
        { roomId, localUri, durationMs: safeDurationMs, capturedAtIso, muted },
        { onProgress: setUploadProgress },
      );
      analytics.capture(ANALYTICS_EVENTS.video_uploaded, {
        room_id: roomId,
        duration_sec: safeDurationMs / 1000,
      });
      router.replace({
        pathname: '/(app)/room/[roomId]',
        params: { roomId },
      });
```

> `analytics`·`ANALYTICS_EVENTS` 는 이미 import 됨(line 18, 20).

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm -F mobile test:component -- upload-preview`
Expected: PASS (기존 3 케이스 + assertion 강화 통과).

- [ ] **Step 5: lint 확인**

Run: `pnpm -F mobile exec eslint "app/(app)/room/[roomId]/upload-preview.tsx" --max-warnings=0`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/mobile/app/(app)/room/[roomId]/upload-preview.tsx" "apps/mobile/app/(app)/room/[roomId]/__tests__/upload-preview.test.tsx"
git commit -m "feat(analytics): video_uploaded 계측 (Engagement — North Star 입력)"
```

---

## Task 8: booster 결제 신호 3종 계측 (Monetization)

**Files:**
- Modify: `apps/mobile/app/(app)/booster.tsx`
- Test: `apps/mobile/app/(app)/__tests__/booster.test.tsx` (없으면 생성)

- [ ] **Step 1: import 추가**

`booster.tsx` 상단. 현재 `@dei/shared` 에서 `{ getRematchRestriction, logger, POLICY }` import 중이므로 `analytics` 추가 → `{ analytics, getRematchRestriction, logger, POLICY }` (알파벳 순). 로컬 그룹에 `import { ANALYTICS_EVENTS } from '@/lib/analytics-taxonomy';` 추가.

- [ ] **Step 2: booster_paywall_shown — 마운트 시 1회**

기존 load-state `useEffect`(line 87~117)와 별개로, 컴포넌트 함수 본문에 마운트 1회 effect 를 추가한다. 기존 load-state effect 바로 아래에 삽입:

```ts
  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.booster_paywall_shown, {
      reason: 'rematch_restricted',
    });
  }, []);
```

- [ ] **Step 3: booster_purchase_attempted — handlePay 진입**

`handlePay`(line 119) 의 `void logger.withErrorCapture(` 호출 **직전**에 추가:

```ts
  const handlePay = () => {
    analytics.capture(ANALYTICS_EVENTS.booster_purchase_attempted, {
      product_id: selectedPack.id,
    });
    void logger.withErrorCapture(
```

- [ ] **Step 4: booster_purchase_succeeded — 결제 확정 성공 후**

`handlePaymentComplete` 안, `await confirmInstantRematchPayment(...)`(line 163~166) 성공 직후, `if (!user?.id)` 체크 **전**에 추가:

```ts
        await confirmInstantRematchPayment(
          response,
          paymentProductId ?? selectedPack.id,
        );
        analytics.capture(ANALYTICS_EVENTS.booster_purchase_succeeded, {
          product_id: paymentProductId ?? selectedPack.id,
        });

        if (!user?.id) {
          throw new Error('authentication required');
        }
```

- [ ] **Step 5: component 테스트**

`booster.test.tsx` 신규. mock 대상: `@portone/react-native-sdk`(Payment → 'Payment'), `expo-router`, `@/providers/auth-provider`, `@/lib/supabase`(load-state 쿼리 체인이 빈 결과 반환하도록), `@/lib/portone.stub`(confirm/start), `@/lib/matching`, `@/lib/notifications.stub`, `@/lib/permissions`, `@dei/shared`(analytics.capture 스파이 + getRematchRestriction 반환값 + POLICY + logger). 검증:

```tsx
// (a) 마운트 시:
//   await waitFor(() => expect(mockAnalyticsCapture).toHaveBeenCalledWith(
//     'F3:booster_paywall_shown', { reason: 'rematch_restricted' }));
// (b) 결제 버튼(testID 또는 '바로 매치 시작' 텍스트) press 시:
//   expect(mockAnalyticsCapture).toHaveBeenCalledWith(
//     'F3:booster_purchase_attempted', expect.objectContaining({ product_id: expect.any(String) }));
```

> `booster_purchase_succeeded` 는 PortOne `Payment` onComplete 콜백 경유라 component 에서 시뮬레이트가 어렵다. 그 capture 는 **Task 9 실PostHog e2e** 로 관통 검증하고, component 에서는 (a)(b) 두 신호만 검증한다. 이 한계를 테스트 주석에 명시한다.

- [ ] **Step 6: 검증**

Run: `pnpm -F mobile exec tsc --noEmit && pnpm -F mobile exec eslint "app/(app)/booster.tsx" --max-warnings=0 && pnpm -F mobile test:component -- booster`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "apps/mobile/app/(app)/booster.tsx" "apps/mobile/app/(app)/__tests__/booster.test.tsx"
git commit -m "feat(analytics): booster 결제 신호 3종 계측 (Monetization)"
```

---

## Task 9: 실PostHog 관통 e2e 스크립트 (온디맨드, 게이트 밖)

**Files:**
- Create: `apps/mobile/scripts/e2e-posthog-funnels.ts`
- Modify: `apps/mobile/package.json` (scripts), 루트 `package.json` (scripts)

> 이 스크립트는 CI 머지 게이트가 아니다(외부 PostHog 의존). 수동 실행으로 "이벤트가 실제 PostHog 에 도착하고 4대 퍼널이 산출되는가"를 실증한다. CLAUDE.md Testing 규칙 9 준수: 실제 wire format 으로 발사.

- [ ] **Step 1: 스크립트 작성**

Create `apps/mobile/scripts/e2e-posthog-funnels.ts`:

```ts
/**
 * 실PostHog 관통 e2e (온디맨드 — CI 게이트 아님).
 * ------------------------------------------------------------------
 * 전용 e2e distinct_id 로 4대 퍼널 spine 이벤트를 PostHog 의 실제 /capture/
 * 엔드포인트(앱 transport 와 동일 wire format)로 시간순 발사한다. 그 뒤 사람이
 * PostHog MCP 의 query-funnel 로 4대 퍼널 전환율 산출을 확인한다(= 4가지 질문에
 * 답 가능 실증). 기존 실데이터 무접촉 — 전용 e2e_run_id 로만 식별/필터.
 *
 * 실행: pnpm posthog:e2e
 * 필요 env: EXPO_PUBLIC_POSTHOG_KEY(공개 ingest key), EXPO_PUBLIC_POSTHOG_HOST(선택)
 *   → ~/.dei/secrets.env 를 source 하거나 직접 export.
 *
 * 검증(스크립트 발사 후 사람/MCP 단계):
 *   1) read-data-schema events 에 F0~F3 spine 이벤트가 보이는지
 *   2) query-funnel 로 activation/match/engagement/monetization 4개가 step 인식 + 전환율 산출
 *   3) North Star: engagement 방당 distinct actor >= 2 (room_id breakdown)
 */
import { FUNNELS } from '../lib/analytics/funnels';
import { ANALYTICS_EVENTS } from '../lib/analytics-taxonomy';

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

async function capture(distinctId: string, event: string, props: Record<string, unknown>) {
  const res = await fetch(`${HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: KEY,
      event,
      distinct_id: distinctId,
      properties: props,
      timestamp: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    throw new Error(`capture failed ${res.status}: ${await res.text()}`);
  }
}

async function main() {
  if (!KEY) {
    throw new Error('EXPO_PUBLIC_POSTHOG_KEY 미설정 — ~/.dei/secrets.env 를 source 하세요.');
  }
  // 고정 run id (랜덤 금지 — 결정적 식별). 사람이 PostHog 에서 이 값으로 필터.
  const runId = process.env.POSTHOG_E2E_RUN_ID ?? 'e2e-posthog-funnels-local';
  const distinctId = `e2e-posthog-${runId}`;

  let sent = 0;
  for (const funnel of FUNNELS) {
    for (const key of funnel.steps) {
      const eventName = ANALYTICS_EVENTS[key];
      // 퍼널이 step 을 인식하려면 동일 distinct_id 로 순서대로 발사.
      await capture(distinctId, eventName, {
        e2e_run_id: runId,
        funnel: funnel.id,
        room_id: funnel.id === 'engagement' ? `e2e-room-${runId}` : undefined,
      });
      sent += 1;
    }
  }

  // North Star 실증용: 같은 방에 두 번째 actor 의 engagement 활동 1건 추가.
  const distinctIdB = `${distinctId}-b`;
  await capture(distinctIdB, ANALYTICS_EVENTS.video_uploaded, {
    e2e_run_id: runId,
    funnel: 'engagement',
    room_id: `e2e-room-${runId}`,
  });
  sent += 1;

  console.log(`[posthog-e2e] 발사 완료: ${sent} events, distinct_id=${distinctId}, run_id=${runId}`);
  console.log('[posthog-e2e] 다음: PostHog MCP query-funnel 로 4대 퍼널 산출 확인 (e2e_run_id 필터).');
}

main().catch((err) => {
  console.error('[posthog-e2e] 실패:', err);
  process.exitCode = 1;
});
```

- [ ] **Step 2: package.json scripts 추가**

`apps/mobile/package.json` 의 `"scripts"` 에 추가:

```json
    "posthog:e2e": "tsx scripts/e2e-posthog-funnels.ts",
```

루트 `package.json` 의 `"scripts"` 에 추가(편의 위임):

```json
    "posthog:e2e": "pnpm --filter mobile posthog:e2e",
```

- [ ] **Step 3: 타입 확인 (실행은 온디맨드라 여기선 컴파일만)**

Run: `pnpm -F mobile exec tsc --noEmit`
Expected: PASS. (스크립트가 메인 tsconfig 에 포함되는지 확인 — 안 되면 `// @ts-check` 가 아니라 tsconfig include 확인. mobile tsconfig 가 scripts/ 를 포함하지 않으면 typecheck 대상 밖이어도 무방하나, import 경로(`../lib/...`)는 정확해야 한다.)

- [ ] **Step 4: (온디맨드) 실제 발사 — secrets 있을 때만**

> 이 스텝은 CI 가 아니라 로컬에서 사람이 실행. secrets 없으면 SKIP 하고 그 사실을 보고.

Run:
```bash
set -a; source ~/.dei/secrets.env 2>/dev/null; set +a
pnpm posthog:e2e
```
Expected: `[posthog-e2e] 발사 완료: N events ...`. 그 뒤 PostHog MCP `query-funnel` 로 4대 퍼널 산출 확인.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/scripts/e2e-posthog-funnels.ts apps/mobile/package.json package.json
git commit -m "test(analytics): 실PostHog 관통 e2e 스크립트 (온디맨드, posthog:e2e)"
```

---

## Task 10: 전체 검증 + 문서 갱신

**Files:**
- Create: `docs/posthog-spec/rooms-funnels-e2e-report.md` (e2e 실행 시)

- [ ] **Step 1: 전체 게이트 동등 실행**

Run:
```bash
pnpm -F mobile exec tsc --noEmit
pnpm ds-enforce
pnpm -F mobile test:unit
pnpm -F mobile test:component
```
Expected: 전부 PASS. (integration/e2e-web 은 본 변경과 무관하나, verify 게이트 전체를 돌리려면 `pnpm verify` — Docker 필요. 없으면 integration 은 NOT-RUN-LOCALLY 로 정직 표기.)

- [ ] **Step 2: contract 가드 동작 실증 (의도적 회귀 테스트)**

`funnels.ts` 에서 임의 step 키를 잘못된 값(예: `'app_opened'` → `'app_opened_typo'`)으로 잠깐 바꾼 뒤 `pnpm -F mobile exec tsc --noEmit` 또는 `pnpm -F mobile test:unit -- funnel-contract` 실행 → **FAIL 확인** → 원복. 이것으로 "다른 사람이 spine 을 깨면 CI 가 잡는다"를 실증한다. (원복 후 재실행 PASS 확인.)

- [ ] **Step 3: (e2e 실행했다면) 리포트 작성**

`docs/posthog-spec/rooms-funnels-e2e-report.md` 에 검증 식별자(run_id, distinct_id), 도착한 이벤트 목록, 4대 퍼널 query-funnel 결과(전환율), North Star 산출(방당 distinct actor≥2), cleanup 확인을 기록한다. 기준: `docs/posthog-spec/e2e-posthog-report.md`.

- [ ] **Step 4: Commit (리포트 작성 시)**

```bash
git add docs/posthog-spec/rooms-funnels-e2e-report.md
git commit -m "docs(posthog): rooms 4대 퍼널 실PostHog e2e 검증 리포트"
```

---

## Self-Review 결과 (작성자 체크)

- **Spec coverage:** §1 퍼널 4개 → Task 2 SSOT + Task 3~8 계측. §2 이벤트 8건 → Task 1 + 3~8. §3 SSOT → Task 2. §4 계층1(contract)=Task 2, 계층2(component)=Task 4~8, 계층3(e2e)=Task 9. §5 PostHog 대시보드 → Task 9 Step 4(MCP) + Task 10. §6 영향범위(verify.yml 무변경) 준수. §8 검증정의 → Task 10. 누락 없음.
- **Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. Task 4·8 의 일부 component 테스트는 mock 비용 판단을 구현자에게 위임하되 골격+대안(e2e 위임)을 명시 — "TODO" 가 아니라 명시적 결정 위임.
- **Type consistency:** `FunnelDef`/`FUNNELS`/`FUNNEL_EVENT_KEYS`/`AnalyticsEventKey` 명칭이 Task 2·9 에서 일치. 이벤트 발송 문자열(`F0:`~`F3:`)이 Task 1 정의와 Task 7 테스트 assertion(`F2:video_uploaded`)에서 일치. duration_sec 계산(safeDurationMs/1000)이 Task 7 구현·테스트(2300→2.3)에서 일치.
