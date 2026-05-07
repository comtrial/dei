# Dev1 Test Plan

이 문서는 기능이 커질수록 테스트가 흩어지지 않도록 관리하는 체크리스트입니다.

## Always Run

- `pnpm --dir apps/mobile typecheck`
- `pnpm --dir apps/mobile lint`

## Local Smoke Test

| Area | Test | Status |
| --- | --- | --- |
| App boot | Expo dev client launches and routes away from `/` | Pass |
| Auth | Anonymous session is created after required terms | Pass |
| Terms | Required consent saves to Supabase local DB | Pass |
| Identity gate | Local dev verification bypass advances to profile | Pass |
| Profile | Korean text input works on Android emulator after enabling Korean Gboard | Pass |
| Profile | Profile save advances to first video gate | Pass |
| Discovery | Gate blocks access until eligibility is complete | Partial |

## Product Flow Tests To Add

| Area | Needed Test |
| --- | --- |
| Anonymous session | Required terms creates a Supabase session before identity verification |
| Returning user | Existing verified account routes to app area |
| New user | New account routes to profile onboarding |
| Device takeover | One account / one device warning and previous device revocation, if kept for MVP |
| PortOne | Start verification through Edge Function only |
| PortOne | Confirm verification through Edge Function only |
| Identity gate | Profile creation is blocked until `identity_verified_at` exists |
| Approved user gate | Matching/DM reads approved-user status from the shared eligibility contract |
| Reports | Report creates `reports` row and moderation case |
| Blocks | Block prevents future discovery/DM exposure |
| Push | Expo push token saved after auth and notification consent |
| Payment | RevenueCat customer ID maps to Supabase user ID |

## Remote Supabase Test

Do this after the local schema and sign flow stabilize.

- Link the Supabase project with project ref and DB password.
- Push migrations with a dry run first.
- Configure `apps/mobile/.env` with project URL and anon key only.
- Never place DB password, service role key, PortOne secret, or RevenueCat secret in the mobile app.
- Run the same smoke flow against remote DB.
