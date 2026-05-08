# Implementation Plan: Paid Refresh IAP

**Status**: In Progress; DB and Edge Function foundation deployed
**Started**: 2026-05-08
**Last Updated**: 2026-05-08
**Source Ticket**: `TalkFile_20250501 작업자 별 작업 티켓.html` H4/H5, A1/A6

---

**Critical instructions**: After completing each phase:
1. Check off completed task checkboxes.
2. Run the listed quality gate commands.
3. Verify every quality gate item passes.
4. Update "Last Updated".
5. Document learnings in Notes.
6. Proceed only when the phase is actually shippable.

---

## Overview

The first payment slice is not a subscription. It is a paid refresh item for the home curation screen.

Ticket requirements:

| Ticket | Requirement |
| --- | --- |
| H4 | Show paid refresh bottom sheet when the user needs a new curation pool. Copy: `리프레시 아이템을 통해 바로 새로운 사람을 만나보세요`. Show price and `구매하기`. Close returns to H2. |
| H4 success | Purchase succeeds, generate a new 3-person pool and add it above the current page. |
| H5 | Purchase failure dialog. Copy: `결제에 실패했어요. 잠시 후 다시 시도해주세요`. Confirm returns to H2 with existing cards. |
| A1 | Admin dashboard shows payment revenue and refresh item sales. |
| A6 | Member detail shows payment history. |

## Product Decision

Use `RevenueCat + StoreKit 2 + Play Billing` as planned in `docs/tech-stack.md`.

For MVP, model refresh as a **consumable one-time IAP**:

- RevenueCat owns store purchase validation, product catalog, offerings, and revenue reporting.
- Supabase owns refresh credit grants, consumption, idempotency, and curation pool generation.
- Do not attach this consumable to a RevenueCat entitlement. Entitlements are persistent and would make a consumable look unlocked forever.
- Subscriptions can be added later using a separate entitlement model without changing the refresh credit ledger.

## Architecture Decisions

| Decision | Rationale | Trade-off |
| --- | --- | --- |
| RevenueCat `appUserID = auth.users.id` | Existing-member recovery can keep purchases attached to the stable Supabase user. RevenueCat also exposes this ID in dashboard/webhooks. | Requires SDK login/re-login after account transfer or sign-out. |
| Consumable refresh credit stored in Supabase | RevenueCat tracks the purchase, but not whether a consumable was granted/used. Our server must own that state. | More DB/RPC work, but prevents duplicate grants and double consumption. |
| Keep existing `public.payments` | HTML and admin docs already call this "결제". Existing migrations and account-transfer RPC already update it. | Need to extend awkward Korean `결제상태` column instead of renaming now. |
| Add `refresh_item_grants` and `refresh_redemptions` | Separates purchase ledger from usage ledger. Refund/revoke can be handled cleanly. | One extra join for admin member detail. |
| Webhook + immediate sync Edge Function | Webhooks are eventually delivered; the app needs immediate UX after purchase. Both paths must be idempotent. | Slightly more code, but avoids waiting 5-60 seconds for webhook delivery. |
| Server-side paid pool consumption | Prevents client from granting itself a new pool without a valid paid credit. | Requires an RPC that atomically consumes credit and returns 3 candidates. |

## Current Codebase Fit

Current home behavior:

- `apps/mobile/hooks/useHomeScreen.ts`
  - Fetches up to 3 approved `curation_pool` rows.
  - `handleRefresh()` fetches another 3 excluding seen users.
  - If fewer than 3, returns `exhausted`.
- `apps/mobile/app/(app)/home.tsx`
  - `exhausted` currently shows `더 이상 새로운 추천이 없어요.`
  - This is where H4 paywall should open.

Current DB:

- `public.payments`
  - `user_id`, `product_type`, `amount`, `currency`, `"결제상태"`, `payment_method`, `external_tx_id`, timestamps.
  - RLS currently allows admin select only.
- Existing member transfer already migrates `payments.user_id`, so payments should continue to use `auth.users.id`.

## Data Model

### Extend `public.payments`

Purpose: purchase/revenue ledger for admin dashboard and member payment history.

Add columns:

| Column | Type | Purpose |
| --- | --- | --- |
| `provider` | `text default 'revenuecat'` | Payment provider. |
| `product_id` | `text` | Store/RevenueCat product ID, e.g. `dei_refresh_1`. |
| `offering_id` | `text` | RevenueCat offering, e.g. `refresh`. |
| `package_id` | `text` | RevenueCat package identifier. |
| `store` | `text` | `APP_STORE`, `PLAY_STORE`, `RC_BILLING`, etc. |
| `environment` | `text` | `SANDBOX` / `PRODUCTION`. |
| `revenuecat_app_user_id` | `text` | Usually Supabase `auth.users.id`. |
| `revenuecat_original_app_user_id` | `text` | Needed when RC aliases exist. |
| `revenuecat_transaction_id` | `text` | Idempotency key for purchase. |
| `revenuecat_event_id` | `text` | Idempotency key for webhook event. |
| `purchased_at` | `timestamptz` | Store purchase timestamp. |
| `failed_at` | `timestamptz` | Failed/cancelled timestamp if known. |
| `refunded_at` | `timestamptz` | Refund/reversal timestamp. |
| `raw_payload` | `jsonb` | Minimal provider payload for audit/debug. |

Indexes:

```sql
create unique index payments_revenuecat_transaction_uidx
  on public.payments(provider, revenuecat_transaction_id)
  where revenuecat_transaction_id is not null;

create index payments_product_created_idx
  on public.payments(product_type, created_at desc);

create index payments_user_created_idx
  on public.payments(user_id, created_at desc);
```

Status mapping:

| RevenueCat/store event | `payments."결제상태"` |
| --- | --- |
| purchase started locally | `PENDING` |
| verified purchase / webhook purchase | `SUCCESS` |
| SDK purchase error | `FAILED` |
| refund/reversal | Keep `SUCCESS`, set `refunded_at`; revoke grant separately. |

### `public.revenuecat_webhook_events`

Purpose: process each webhook once and keep replay/debug visibility.

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | `text primary key` | RevenueCat webhook event ID. |
| `event_type` | `text not null` | RC event type. |
| `app_user_id` | `text` | RC app user. |
| `original_app_user_id` | `text` | RC original app user. |
| `aliases` | `text[]` | RC aliases for account merge. |
| `transaction_id` | `text` | Store/RC transaction ID. |
| `product_id` | `text` | Product. |
| `environment` | `text` | Sandbox/production. |
| `payload` | `jsonb not null` | Full event payload. |
| `processed_at` | `timestamptz` | Processing timestamp. |
| `created_at` | `timestamptz default now()` | Received timestamp. |

RLS: service-role only; admin select optional later.

### `public.refresh_item_grants`

Purpose: consumable credit ledger. One refresh purchase grants one available refresh item.

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Grant ID. |
| `user_id` | `uuid references auth.users(id)` | Owner. |
| `payment_id` | `uuid references public.payments(id)` | Purchase source. |
| `product_id` | `text not null` | Product that granted credit. |
| `granted_count` | `int not null default 1` | Usually 1. |
| `remaining_count` | `int not null default 1` | Decrement on use. |
| `status` | `text not null default 'AVAILABLE'` | `AVAILABLE`, `CONSUMED`, `REVOKED`. |
| `granted_at` | `timestamptz default now()` | Grant time. |
| `consumed_at` | `timestamptz` | Last consumption time. |
| `revoked_at` | `timestamptz` | Refund/revoke time. |
| `revoke_reason` | `text` | Refund, chargeback, admin action. |

Constraints:

```sql
alter table public.refresh_item_grants
  add constraint refresh_item_grants_remaining_check
  check (remaining_count >= 0 and remaining_count <= granted_count);

create unique index refresh_item_grants_payment_uidx
  on public.refresh_item_grants(payment_id);
```

RLS:

- Users may select their own grants.
- Users may not insert/update grants directly.
- Edge Functions use service role.
- Admin select for member detail.

### `public.refresh_redemptions`

Purpose: record each paid refresh usage and the generated 3-person pool.

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Redemption ID. |
| `user_id` | `uuid references auth.users(id)` | User. |
| `grant_id` | `uuid references public.refresh_item_grants(id)` | Consumed grant. |
| `pool_date` | `date not null` | Same date logic as home curation. |
| `seen_user_ids` | `uuid[] not null default '{}'` | IDs already shown on client. |
| `candidate_user_ids` | `uuid[] not null` | Exactly 3 users returned. |
| `status` | `text not null default 'SUCCESS'` | `SUCCESS` / `FAILED`. |
| `failure_reason` | `text` | No candidates, DB error, etc. |
| `created_at` | `timestamptz default now()` | Usage timestamp. |

## Backend Interfaces

### Edge Function: `revenuecat-webhook`

Input: RevenueCat webhook.

Responsibilities:

1. Verify `Authorization` header equals `REVENUECAT_WEBHOOK_AUTH_TOKEN`.
2. Insert `revenuecat_webhook_events.id`; return 200 if already processed.
3. For purchase events:
   - Resolve `user_id` from `event.app_user_id`.
   - Upsert `payments`.
   - Insert `refresh_item_grants` once per payment.
4. For refund/reversal events:
   - Mark `payments.refunded_at`.
   - Revoke unused grants; if already consumed, flag for admin review.
5. Return quickly; keep processing idempotent.

### Edge Function: `sync-refresh-purchase`

Input from app after SDK purchase success:

```json
{
  "productId": "dei_refresh_1",
  "transactionId": "...",
  "offeringId": "refresh",
  "packageId": "$rc_package_identifier"
}
```

Responsibilities:

1. Require Supabase auth.
2. Call RevenueCat subscriber API using `REVENUECAT_SECRET_KEY`.
3. Verify a matching non-subscription purchase exists for `auth.uid()`.
4. Upsert `payments`.
5. Grant one refresh item if not already granted.
6. Return current available refresh count.

This gives immediate UX without waiting for the webhook.

### RPC: `consume_refresh_item(p_seen_user_ids uuid[])`

Responsibilities:

1. Require authenticated user.
2. In one transaction:
   - Lock one available `refresh_item_grants` row.
   - Select 3 eligible curation candidates excluding current user and `p_seen_user_ids`.
   - If fewer than 3, do not consume and return `NO_CANDIDATES`.
   - Decrement `remaining_count`.
   - Insert `refresh_redemptions`.
   - Return the 3 curation rows.
3. The app adds the returned page above the existing page stack.

Candidate source:

- Phase 1 can reuse `public.curation_pool` with wider exclusion logic.
- Phase 2 can move selection into an algorithm/RPC that builds a paid batch from approved `logs`.

## Mobile Design

### New dependency

```bash
cd apps/mobile
pnpm expo install react-native-purchases
```

Notes:

- Expo Go is not enough for IAP; use a development build.
- Android currently has `launchMode="singleTask"` in `apps/mobile/android/app/src/main/AndroidManifest.xml`. RevenueCat recommends `standard` or `singleTop` because some payment methods require leaving the app temporarily. Change this before real purchase testing.

### Environment

Mobile public env:

```bash
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=
EXPO_PUBLIC_REVENUECAT_REFRESH_OFFERING_ID=refresh
EXPO_PUBLIC_REVENUECAT_REFRESH_PRODUCT_ID=dei_refresh_1
EXPO_PUBLIC_ENABLE_DEV_PAYMENT_BYPASS=false
```

Supabase Function secrets:

```bash
REVENUECAT_SECRET_KEY=
REVENUECAT_WEBHOOK_AUTH_TOKEN=
```

### Client modules

| File | Responsibility |
| --- | --- |
| `apps/mobile/lib/revenuecat.ts` | Configure SDK with platform key and `appUserID = user.id`; logout on sign-out. |
| `apps/mobile/lib/refresh-purchase.ts` | Fetch offering, purchase package, call `sync-refresh-purchase`, consume refresh item. |
| `apps/mobile/components/home/PaidRefreshSheet.tsx` | H4 bottom sheet UI. |
| `apps/mobile/components/home/PaymentFailureDialog.tsx` | H5 dialog UI. |
| `apps/mobile/hooks/useHomeScreen.ts` | On exhausted refresh, open H4 instead of alert; consume paid refresh after purchase. |

### UI flow

1. User taps `새로운 3명 보기`.
2. Free refresh:
   - If 3 candidates exist, add page as today.
   - If not, open H4 paid refresh sheet.
3. H4:
   - Fetch RevenueCat offering/package.
   - Display localized store price.
   - `구매하기` starts SDK purchase.
   - Close fires `refresh_paywall_dismissed` and returns to H2.
4. Purchase success:
   - Call `sync-refresh-purchase`.
   - Call `consume_refresh_item`.
   - Add returned 3-person pool above current page.
5. Purchase failure/cancel:
   - Show H5 only for actual failure.
   - User cancellation closes sheet or stays on H2 without alarming copy.

### Developer-only path

Until store products are ready:

- Keep a local dev-only button in H4: `개발자 전용: 리프레시 결제 완료 처리`.
- Guard with `EXPO_PUBLIC_ENABLE_DEV_PAYMENT_BYPASS=true` or local Supabase URL.
- It calls a dev Edge/RPC path that grants and consumes one refresh without RevenueCat.
- Never show in production builds.

## Analytics

From the HTML ticket:

| Event | Priority | Trigger | Props |
| --- | --- | --- | --- |
| `refresh_paywall_shown` | P0 | H4 shown | `trigger_screen`, `free_refresh_result`, `available_candidate_count` |
| `refresh_purchase_clicked` | P0 | `구매하기` | `product_id`, `price`, `currency`, `offering_id` |
| `refresh_paywall_dismissed` | P1 | Close | `trigger_screen` |
| `payment_failed_shown` | P1 | H5 shown | `payment_method`, `product_id`, `error_code` |

Additional recommended:

| Event | Purpose |
| --- | --- |
| `refresh_purchase_succeeded` | Purchase conversion and revenue debugging. |
| `refresh_credit_granted` | Server grant success. |
| `refresh_credit_consumed` | Paid pool generation success. |
| `refresh_credit_consume_failed` | Paid UX issue / candidate shortage. |

## Implementation Phases

### Phase 1: Payment Foundation and Schema

**Goal**: DB and server contracts exist without touching live store products.
**Estimated time**: 3-4 hours.
**Status**: Complete locally.

Tasks:

- [x] Add migration extending `payments`.
- [x] Add `revenuecat_webhook_events`.
- [x] Add `refresh_item_grants`.
- [x] Add `refresh_redemptions`.
- [x] Add RLS policies: user read own grants/redemptions, admin read all, no client writes.
- [x] Add integration tests for grant idempotency and consumption guard.
- [x] Run `pnpm db:gen-types`.

Quality gate:

```bash
SUPABASE_SERVICE_ROLE_KEY=$(pnpm exec supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"/\1/p') RUN_INTEGRATION=1 pnpm --filter mobile test:integration
pnpm db:gen-types
pnpm typecheck
```

Rollback:

- Drop new tables.
- Drop new columns/indexes from `payments`.
- Regenerate DB types.

### Phase 2: RevenueCat SDK Boundary

**Goal**: App can configure RevenueCat and fetch refresh offering safely.
**Estimated time**: 2-3 hours.
**Status**: Partial. SDK boundary is implemented; real RevenueCat public keys still need to be supplied.

Tasks:

- [x] Install `react-native-purchases`.
- [x] Add RevenueCat public env keys to `apps/mobile/.env.example`.
- [x] Add Android Billing permission and set launch mode to `singleTop` or `standard`.
- [x] Add `apps/mobile/lib/revenuecat.ts`.
- [x] Configure with iOS/Android platform key and Supabase `user.id`.
- [ ] Add tests for platform key selection and disabled/missing-key behavior.

Quality gate:

```bash
cd apps/mobile && pnpm typecheck
cd apps/mobile && pnpm test:unit
cd apps/mobile && pnpm android
```

Rollback:

- Remove dependency and RevenueCat module.
- Revert native config changes.

### Phase 3: H4/H5 UI with Developer Bypass

**Goal**: Users see ticket-faithful paid refresh UI, and development can test without store keys.
**Estimated time**: 3-4 hours.
**Status**: Partial. UI and dev bypass are implemented; analytics/component tests remain.

Tasks:

- [x] Add `PaidRefreshSheet` with exact H4 copy.
- [x] Add `PaymentFailureDialog` with exact H5 copy.
- [x] Replace exhausted alert in `home.tsx` with H4 sheet.
- [x] Add dev-only purchase-complete button.
- [ ] Add PostHog event wrapper or placeholder service if PostHog is not installed yet.
- [ ] Component-test H4/H5 states.

Quality gate:

```bash
pnpm --filter mobile lint
pnpm --filter mobile test:unit
pnpm typecheck
```

Rollback:

- Restore existing exhausted alert.
- Remove new UI components.

### Phase 4: Server Purchase Sync and Webhook

**Goal**: RevenueCat purchases grant exactly one refresh credit.
**Estimated time**: 4 hours.
**Status**: Partial. Functions are implemented and deployed; real RevenueCat secrets/webhook URL are still required.

Tasks:

- [x] Add `supabase/functions/revenuecat-webhook`.
- [x] Add `supabase/functions/sync-refresh-purchase`.
- [x] Verify webhook authorization header.
- [x] Upsert `payments` by RevenueCat transaction ID.
- [x] Grant one `refresh_item_grants` row idempotently.
- [x] Handle refund/reversal by revoking unused grants.
- [ ] Add tests using mocked RevenueCat API responses.
- [ ] Add `REVENUECAT_SECRET_KEY` and `REVENUECAT_WEBHOOK_AUTH_TOKEN` to `.env.example` secret list.

Quality gate:

```bash
pnpm test
pnpm exec supabase functions deploy revenuecat-webhook --project-ref sjlzidjnpczysygnlmtk
pnpm exec supabase functions deploy sync-refresh-purchase --project-ref sjlzidjnpczysygnlmtk
```

Rollback:

- Disable RevenueCat webhook URL in dashboard.
- Remove function secrets.
- Revert function deployments if needed.

### Phase 5: Paid Refresh Consumption

**Goal**: Successful purchase generates and displays a new 3-person pool.
**Estimated time**: 3-4 hours.
**Status**: Partial. RPC and app call path are implemented; production candidate policy needs real data QA.

Tasks:

- [x] Add `consume_refresh_item(p_seen_user_ids uuid[])`.
- [x] Add client call after purchase success.
- [x] Ensure no credit is consumed when fewer than 3 candidates exist.
- [x] Add result mapping to `CurationItem`.
- [ ] Add tests for exhausted, no-candidate, and success cases.
- [ ] Manual test with developer bypass and RevenueCat sandbox when keys/products exist.

Quality gate:

```bash
pnpm test:integration
cd apps/mobile && pnpm typecheck
```

Rollback:

- Revert `handleRefresh` paid path to H4-only.
- Leave purchase ledger intact; do not delete historical payments.

### Phase 6: Admin Read Model

**Goal**: Admin dashboard and member detail can show refresh sales/history.
**Estimated time**: 2-3 hours.
**Status**: Pending.

Tasks:

- [ ] Add SQL view `admin_payment_summary_daily`.
- [ ] Add SQL view `admin_member_payment_history`.
- [ ] Include refresh grant and redemption status.
- [ ] Document dashboard fields for Choi/admin console owner.

Quality gate:

```bash
pnpm test:integration
pnpm db:gen-types
```

Rollback:

- Drop admin views only.

## Risks

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| Store product setup not ready | High | High | Ship dev bypass first; hide real purchase until RevenueCat offering loads. |
| Android purchase cancelled after external app verification | Medium | High | Change `launchMode` from `singleTask` to `singleTop` or `standard`. |
| Webhook arrives late or duplicated | Medium | Medium | Immediate sync function plus webhook idempotency by event/transaction ID. |
| Paid refresh has fewer than 3 candidates | Medium | High | Preflight candidate count before purchase; do not consume credit if no candidates. |
| Existing account recovery changes `auth.users.id` | Low | High | Configure/logIn RevenueCat with the final Supabase user ID after account recovery. |
| Refund after credit consumed | Low | Medium | Keep payment history, mark grant consumed, create admin review flag. |

## Open Decisions

1. Product ID naming:
   - Proposal: `dei_refresh_1`.
2. Price:
   - HTML says price is undecided. Use store-localized price from RevenueCat, not hardcoded app text.
3. Candidate source:
   - Phase 1 can reuse `curation_pool`.
   - Product may want paid refresh to expand beyond daily pool; if so, define a wider candidate RPC before Phase 5.
4. Refund policy:
   - If user buys but no 3-person pool can be produced, either do not consume credit or show admin/support path.
5. Analytics provider:
   - PostHog is in tech stack, but code does not appear wired yet. Add a small analytics abstraction before emitting events.

## Setup Checklist for the User Later

RevenueCat:

- [ ] Create RevenueCat project.
- [ ] Add iOS app and Android app.
- [ ] Copy iOS public SDK key.
- [ ] Copy Android public SDK key.
- [ ] Create product `dei_refresh_1` as consumable IAP in App Store Connect / Google Play Console.
- [ ] Import/connect products in RevenueCat.
- [ ] Create offering `refresh`.
- [ ] Add package for `dei_refresh_1`.
- [ ] Create webhook URL to Supabase `revenuecat-webhook`.
- [ ] Set webhook authorization header token.
- [ ] Copy RevenueCat secret API key for Supabase function secret.

Supabase secrets:

```bash
pnpm exec supabase secrets set --project-ref sjlzidjnpczysygnlmtk \
  REVENUECAT_SECRET_KEY='...' \
  REVENUECAT_WEBHOOK_AUTH_TOKEN='...'
```

Mobile env:

```bash
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=...
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=...
EXPO_PUBLIC_REVENUECAT_REFRESH_OFFERING_ID=refresh
EXPO_PUBLIC_REVENUECAT_REFRESH_PRODUCT_ID=dei_refresh_1
```

## References

- HTML ticket: H4/H5 paid refresh, A1 dashboard, A6 member payment history.
- RevenueCat React Native install: https://www.revenuecat.com/docs/getting-started/installation/reactnative
- RevenueCat non-subscription purchases: https://www.revenuecat.com/docs/platform-resources/non-subscriptions
- RevenueCat webhooks: https://www.revenuecat.com/docs/integrations/webhooks
- RevenueCat customer IDs: https://www.revenuecat.com/docs/customers/identifying-customers
- Expo IAP guide: https://docs.expo.dev/guides/in-app-purchases/

## Notes

- Android manifest now uses `singleTop` and includes `com.android.vending.BILLING`.
- `public.payments` uses `"결제상태"` in the latest admin schema. Keep it for now to avoid breaking admin tickets.
- A developer bypass is appropriate until Apple/Google/RevenueCat products exist.
- Remote Supabase DB has been pushed through `20260508123000_consume_paid_refresh_item`.
- Edge Functions deployed to `sjlzidjnpczysygnlmtk`: `sync-refresh-purchase`, `revenuecat-webhook`.
- `REVENUECAT_SECRET_KEY` and `REVENUECAT_WEBHOOK_AUTH_TOKEN` are still required before real purchases/webhooks work.
