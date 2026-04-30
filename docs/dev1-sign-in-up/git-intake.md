# Git Intake Notes

This file tracks what was confirmed from the team's pushed git changes.

## Confirmed From `origin/main`

The RNR + NativeWind direction is present in git.

Confirmed files:

- `CLAUDE.md`
- `apps/mobile/components.json`
- `apps/mobile/components/ui/button.tsx`
- `apps/mobile/components/ui/card.tsx`
- `apps/mobile/components/ui/dialog.tsx`
- `apps/mobile/components/ui/input.tsx`
- `apps/mobile/components/ui/text.tsx`
- `apps/mobile/global.css`
- `apps/mobile/tailwind.config.js`
- `apps/mobile/lib/theme.ts`
- `apps/mobile/lib/utils.ts`

## Interpretation

Item 4 from the team note is confirmed: the code-level design system exists and should be used for ongoing UI work.

Item 6 is partially confirmed: `CLAUDE.md` exists and is useful for agents. A separate `.agents/` or `agents/` directory was not visible in `origin/main` at the time of review. If the team expects another directory, ask for the exact path or branch.

## Impact On Dev1 Work

- Use `components/ui` first for all UI.
- Add new reusable UI through the RNR pattern before using one-off screen code.
- Use NativeWind `className` and token classes instead of hardcoded styles.
- Keep sign flow tracking in this folder so future agents can resume from git context.

