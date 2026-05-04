# dei — Agent Instructions

이 프로젝트는 [`CLAUDE.md`](./CLAUDE.md) 를 단일 source of truth 로 사용합니다.

Claude Code, OpenAI Codex CLI, Cursor, Windsurf, Copilot 등 어떤 에이전트
CLI 를 쓰더라도 같은 규칙을 따라야 합니다 — 그래서 내용을 한 파일에만
유지합니다 (drift 방지).

**본 파일은 fallback 입니다.** Codex CLI 처럼 `AGENTS.md` 를 먼저 읽는 도구는
이 파일을 거쳐 `CLAUDE.md` 의 모든 섹션을 적용해주세요.

## 핵심 원칙 (요약)

1. UI 는 `apps/mobile/components/ui/` (RNR + NativeWind) 우선 재사용.
2. 에러 로깅은 **`@dei/shared` 의 `logger` 만** 사용. `@sentry/react-native`
   직접 import 금지 (단, `apps/mobile/lib/sentry.ts` 제외).
3. 새 코드는 **테스트 계층 결정** 후 작성: Unit / Component / Integration /
   Contract / E2E. 자세한 규칙은 `CLAUDE.md` 의 **Testing** 섹션 참고.
4. Supabase 스키마 변경 시 `pnpm db:gen-types` 로 타입 동기화 필수.

전체 규칙은 `CLAUDE.md` 를 읽어주세요.
