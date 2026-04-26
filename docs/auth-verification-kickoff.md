# Eligibility, Safety & Sign Flow Kickoff

## Goal

Build the first production-shaped slice for Dei: app-native readiness, phone-based account entry, eligibility/age verification, safety gates, and the moderation foundation required before matching, DM, push, and payments can safely exist.

## Product Context

Dei is a dating app centered on short 2-second profile videos. The app needs strong onboarding and safety gates because downstream features depend on verified, policy-compliant users and moderated UGC:

- Matching and DM should only be available to eligible, verified users.
- Reports, blocks, and admin review must exist before discovery/DM ships.
- Push notifications depend on authenticated users and device tokens.
- Payments should attach to a stable app user identity.

## Current Branch

`feature/auth-verification-flow`

## Sign Flow Reality Check

The current concept file (`dei - Sign Flow _standalone_.html`) defines a phone-first flow, not email/password:

1. Boot reads `auth_token` from SecureStore and routes to Home or Onboarding.
2. Onboarding has 3 short pages and no skip.
3. Terms open in a bottom sheet with required/optional consent.
4. Phone entry is fixed to `+82`, validates 11 digits, and sends an OTP.
5. OTP screen has a 3-minute timer, 60-second resend cooldown, and lockout after repeated failures.
6. Backend verifies the code and branches into returning user or new profile.
7. Existing accounts support 1-account-1-device takeover.
8. New profile collects name, DOB, gender, then asks for the first 2-second log.
9. First log is part of the ideal onboarding, but the concept allows postponing it.

## Corrected Work Order

1. Expo app hardening
   - Add `expo-dev-client` because camera, push, and RevenueCat need native builds.
   - Rename app identifiers from `mobile` to stable Dei identifiers before push/auth/store config depends on them.
   - Replace template tabs with route groups: `(auth)`, `(onboarding)`, `(app)`.
   - Keep NativeWind/RNR conventions; avoid new StyleSheet-only UI.

2. Policy and safety foundation
   - Terms, privacy, community guidelines, age policy, report taxonomy.
   - Account deletion path.
   - Admin/moderation system of record; Slack is only an alert channel.

3. Auth and eligibility foundation
   - Phone/OTP-oriented auth wrapper matching the concept flow.
   - Session provider and root gate.
   - Server-readable onboarding/eligibility state.
   - 1-account-1-device state if the product keeps that rule.

4. Data model and RLS
   - `profiles`
   - `account_status` or `user_eligibility`
   - `identity_verifications`
   - `user_consents`
   - `user_devices`
   - `profile_videos`
   - `blocks`, `reports`, `moderation_cases`, `admin_actions`
   - RLS policies in the first migration, before app access.

5. Identity verification integration boundary
   - Mobile starts verification.
   - Supabase Edge Function creates/sends PortOne identity verification request.
   - Mobile confirms status through backend only.
   - Store only minimum required verification result fields.

6. Onboarding gates
   - Terms consent.
   - Identity verification complete.
   - Age eligibility check.
   - Basic profile completion.
   - First 2-second video capture/upload, with moderation status before discovery.

7. Follow-up slices
   - Matching access gate: eligible, not banned, approved profile/video.
   - DM gate: mutual match only, with report/block already live.
   - Report/block schema and admin-console event feed.
   - Expo push token registration after auth and notification consent.
   - RevenueCat customer identity wiring after stable Supabase user ID exists; payment UI later.

## PortOne Notes

PortOne V2 exposes identity verification APIs for sending, confirming, resending, and fetching verification records. The app should not call secret-key APIs directly. Use Supabase Edge Functions as the server boundary.

Recommended app flow:

1. App requests `start_identity_verification`.
2. Edge Function creates an `identity_verifications` row with status `pending`.
3. Edge Function calls PortOne send API with a server-held secret.
4. App collects/receives the user-facing verification result.
5. App calls `confirm_identity_verification`.
6. Edge Function confirms with PortOne and updates private eligibility/account-status records. It should not write sensitive verification results into discoverable profile rows.

## Data Boundary

Keep public dating profile data separate from private eligibility and identity facts:

- `profiles`: display name, public profile fields, public media references, non-sensitive discovery fields.
- `account_status` / `user_eligibility`: identity verified flag, age eligible flag, onboarding state, suspension/ban state.
- `identity_verifications`: provider transaction state only.
- `private_profile`: DOB/birth year or legal attributes only if the product truly needs them.
- `profile_videos`: storage object reference plus moderation status.
- `reports` / `blocks` / `moderation_cases`: safety system of record.

Clients may write profile drafts, consents, and device registrations under RLS. Clients must not write verification, age eligibility, moderation, ban, or payment authority fields.

## Initial Data Model Sketch

```sql
create type public.verification_status as enum ('pending', 'verified', 'failed', 'expired');
create type public.onboarding_state as enum ('auth', 'terms', 'phone', 'verified', 'profile', 'first_log', 'complete');
create type public.moderation_status as enum ('pending', 'approved', 'rejected', 'removed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  onboarding_state public.onboarding_state not null default 'auth',
  identity_verified_at timestamptz,
  age_verified boolean not null default false,
  suspended_at timestamptz,
  banned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'portone',
  provider_verification_id text,
  status public.verification_status not null default 'pending',
  requested_at timestamptz not null default now(),
  verified_at timestamptz,
  failed_at timestamptz,
  expires_at timestamptz,
  failure_code text
);

create table public.profile_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  duration_ms integer not null,
  moderation_status public.moderation_status not null default 'pending',
  created_at timestamptz not null default now()
);
```

## Open Decisions

- Whether MVP uses Supabase phone OTP directly, a custom SMS provider, or PortOne-first verification.
- Whether PortOne is mandatory before profile creation or before discovery.
- Whether DOB from the concept remains self-entered only, or is reconciled against PortOne verified age.
- Whether the camera module should stay `expo-camera` for MVP or move to `react-native-vision-camera` after a 2-second/H.264 spike.
- Whether first log is required before Home or only before appearing in discovery.
