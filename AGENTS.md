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
   Contract / E2E-web(Playwright) / E2E-native(Maestro). 자세한 규칙은
   `CLAUDE.md` 의 **Testing** 섹션, 결정 트리는 `apps/mobile/e2e/README.md`.
4. Supabase 스키마 변경 시 `pnpm db:gen-types` 로 타입 동기화 필수.
5. 채팅 등 검증 게이트 대상 모듈은 머지 전 **`pnpm verify`** 로 CI 게이트
   (`.github/workflows/chat-verify.yml`)를 로컬 재현. integration 은 CI 에서
   *실제* Supabase 로 강제 실행되며 skip 0건은 게이트 FAIL.
6. **DB/realtime 연동 변경은 push 전 실DB e2e 로 관통 검증** (unit/component/
   e2e-web 은 전부 mock — 통과해도 실제 동작·realtime 왕복·RLS 가시성은
   보장 안 됨). 전용 테스트 유저(`e2e-*@example.test`)만 쓰고 `try/finally`
   로 전량 cleanup. 자세한 규칙은 `CLAUDE.md` Testing 규칙 7, 기준 구현·
   리포트는 `docs/chat-spec/e2e-realdb-report.md`. "테스트 다 통과" 를 실DB
   동작 검증으로 보고하지 말 것.
7. **마이그레이션 ≠ Edge Function 배포 (별개 경로, 실제로 놓쳤던 항목).**
   `supabase db push` 는 테이블/RLS/RPC 만 반영 — Edge Function 은
   `supabase functions deploy <name>` 별도 필수. 백엔드 완료 = 마이그레이션
   적용 + 관련 Edge Function 전부 배포 + **클라 실제 경로(Edge Function
   우선/RPC 폴백)로 e2e 검증**. 실DB e2e 는 RPC 직접 호출만 하지 말고
   `supabase.functions.invoke` 경로도 포함. 자세히는 `CLAUDE.md` Testing
   규칙 8 (배포 산출물 체크리스트).

전체 규칙은 `CLAUDE.md` 를 읽어주세요.
