# Open Questions

## Supabase

- What is the Supabase project ref?
- What are the Project URL and anon public key?
- Who owns the Supabase access token for CLI login and migration push?
- Should remote DB receive this first schema now, or after the local sign flow is closer to the HTML concept?

## Sign Flow

- Production sign in currently uses Supabase anonymous auth before PortOne identity verification.
- PortOne identity verification is required before profile creation.
- PortOne adult verification is excluded from the current implementation slice.
- Existing-user login/account recovery with PortOne-only identity still needs a server-side decision.
- Is the HTML rule "1 account / 1 device" confirmed for MVP?
- Should first 2 second video be required before Home, or only before appearing in discovery?

## Design

- Is `CLAUDE.md` the only agent-consumable instruction file, or is there another agent directory that should exist?
- Should we add project-specific screen patterns for form pages, bottom sheets, empty states, and gated states?
- Should the sign flow HTML be committed as a reference artifact, or kept outside git because it is a large export?

## External Services

- PortOne contract status, store id, identity channel key, and API secret?
- Slack workspace/webhook for moderation alerts?
- Expo push project and notification permission copy?
- RevenueCat project, products, entitlements, and store account readiness?
