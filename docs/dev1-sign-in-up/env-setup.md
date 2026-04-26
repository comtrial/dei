# Mobile Environment Setup

The mobile app needs a local environment file before it can run.

Create this file:

```text
apps/mobile/.env
```

Use this shape:

```bash
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

## Where To Get The Values

Use the Supabase project assigned to the team.

- `EXPO_PUBLIC_SUPABASE_URL`: Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon/public key

These are app connection settings for the shared Supabase project. They are not the database password.

## What Not To Put Here

Never put these values in the mobile `.env` file:

- Supabase service role key
- Supabase database password
- PortOne secret key
- RevenueCat secret key
- Any admin/server-only credential

## How To Start On A New Computer

```bash
git checkout byungg/featrue-20260426-1
pnpm install
cp apps/mobile/.env.example apps/mobile/.env
```

Then fill in `apps/mobile/.env` with the team Supabase values.

For local Supabase development:

```bash
pnpm db:start
pnpm db:reset
pnpm --dir apps/mobile exec expo start --dev-client
```

For Android, open the app from Expo after the emulator is running.

## Notes

`apps/mobile/.env` is intentionally ignored by Git. Each developer keeps their own local copy.

Only `apps/mobile/.env.example` and this guide should be committed.
