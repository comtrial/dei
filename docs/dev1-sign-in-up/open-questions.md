# Open Questions

## Supabase

- What is the Supabase project ref?
- What are the Project URL and anon public key?
- Who owns the Supabase access token for CLI login and migration push?
- Should remote DB receive this first schema now, or after the local sign flow is closer to the HTML concept?

## Sign Flow

- Is production sign in PortOne-first, Supabase phone OTP, or custom SMS OTP plus PortOne identity verification?
- Is phone verification required before profile creation, or only before discovery?
- Should DOB be self-entered, PortOne-derived, or both with reconciliation?
- Is the HTML rule "1 account / 1 device" confirmed for MVP?
- Should first 2 second video be required before Home, or only before appearing in discovery?

## Design

- Is `CLAUDE.md` the only agent-consumable instruction file, or is there another agent directory that should exist?
- Should we add project-specific screen patterns for form pages, bottom sheets, empty states, and gated states?
- Should the sign flow HTML be committed as a reference artifact, or kept outside git because it is a large export?

## External Services

- PortOne contract status and API environment?
- Slack workspace/webhook for moderation alerts?
- Expo push project and notification permission copy?
- RevenueCat project, products, entitlements, and store account readiness?

