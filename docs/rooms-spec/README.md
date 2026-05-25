# Rooms-Pivot 사양 (feat/rooms-pivot)

> **체질 개선 작업** — 기존 1:1 큐레이션·매칭·채팅 도메인에서
> "그룹 소개팅(과팅) · 매시간 3초 영상 공유 · 방 단위" 도메인으로 전환.

이 디렉토리는 새 도메인 작업의 단일 source of truth 다. 모든 결정·설계·테스트
전략을 여기서 시작하고, 코드 변경 PR 은 이 문서들을 근거로 한다.

## 입력 자료 (원본)

- 사업계획서 PRD v0.6 — `.local/planning/PRD_.html` (gitignore, 로컬에만 존재)
- 유저플로우 다이어그램 v0.6 — `.local/planning/userflow.html` (그림 A/B/C)

위 두 파일은 외부 공유 금지이므로 워크스페이스에 보관하되 커밋 대상이 아니다.

## 문서 구성

| 파일 | 내용 |
|---|---|
| [`decisions.md`](./decisions.md) | PRD 미정 항목 11개에 대한 합리적 기본값 결정 (팀 검토 대상) |
| [`db-design.md`](./db-design.md) | 새 도메인 DB 스키마 (테이블, RLS, RPC) ERD |
| [`edge-functions.md`](./edge-functions.md) | 새 Edge Function 목록 + 보존 Edge Function 재활용 매핑 |
| [`screens.md`](./screens.md) | expo-router 페이지 구조 + 각 화면의 책임 |
| [`testing.md`](./testing.md) | 새 도메인 테스트 계층 + `rooms-verify.yml` 게이트 정의 |

## 진행 상태 (Phase)

| Phase | 상태 | 산출물 |
|---|---|---|
| 0. 준비 (인벤토리, 설계 문서) | 진행 중 | docs/rooms-spec/* |
| 1. 옛 도메인 폐기 | 대기 | 마이그레이션 archive + 파일 삭제 커밋 |
| 2. 백엔드 (로컬) | 대기 | 새 베이스라인 SQL + Edge Function |
| 3. 프론트엔드 | 대기 | 새 화면/컴포넌트/hooks |
| 4. 테스트 + 게이트 | 대기 | rooms-verify.yml + 실DB e2e |
| 5. Remote 배포 | 대기 | `supabase db push` + `supabase functions deploy <all>` |

## 보존 / 폐기 인벤토리

`.local/planning/inventory.md` (커밋 안 됨) — Phase 1 폐기 작업의 입력.
