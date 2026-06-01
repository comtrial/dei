---
description: dei C(손승태) task .md 1개 실행 — planner(Opus) → implementer(Sonnet) → verifier(Sonnet) 순차 자동
---

사용자가 다음 task 를 요청했습니다:

**task 인자**: $ARGUMENTS

# 절차

`docs/c-tasks/<task-name>.md` 파일을 기준으로 plan → implement → verify 3단계를
**Task 도구로 subagent 호출**해서 순차 진행하세요. 각 단계 사이에 다음 단계로
필요한 컨텍스트(파일 경로·계획 결과·변경 파일 목록)를 다음 subagent 에게 **명시적으로
프롬프트에 박아서** 전달해야 합니다. **subagent 는 이 메인 대화를 못 봅니다.**

---

## 0단계: task .md 경로 결정

`$ARGUMENTS` 정규화:
- `S11a-camera-permission` 또는 `S11a` 만 들어오면 → `docs/c-tasks/S11a-camera-permission.md` 로 확장 (Glob 로 매칭).
- 풀패스 `docs/c-tasks/...` 가 들어오면 그대로.
- 매칭 0건이면 사용자에게 알리고 STOP.
- 매칭 2건 이상이면 후보 보여주고 사용자 확인 요청.

결정된 경로를 변수처럼 들고 가세요.

---

## 1단계: plan (task-planner — Opus)

Task 도구로 `task-planner` subagent 를 호출하세요.

`subagent_type`: `task-planner`
`description`: `plan <task-name>`
`prompt`:
```
대상 task .md 절대경로: <decided path>

이 task 의 plan 을 수행해줘. 너의 system prompt 의 진행 순서 §1~6 다 따라:

1) task .md 읽고 status 확인
2) 선행 의존 task 들 status 확인
3) 합의 차단 점검
4) 의존 파일 사전 정찰 (@dei/ui 컴포넌트, DB 테이블, lib 모듈)
5) 체크리스트 추출 + 구현 순서
6) 위험·임시 가정 식별

최종 보고는 너의 system prompt 의 보고 양식대로.

차단 사유 발견 시 즉시 STOP — 다음 단계 진행 X.
```

응답에서 다음 정보 추출:
- **차단 여부** (선행 미완료 / 합의 미진 / DS 부재)
- **구현 순서** (체크리스트)
- **변경 예상 파일 목록**

**차단이면 사용자에게 보고하고 멈춤.** 2단계 진행 X.

차단 아니면 사용자에게 한 줄 진행 안내:
```
plan 완료. 구현 시작합니다 (변경 예상 N 파일).
```

---

## 2단계: implement (task-implementer — Sonnet)

Task 도구로 `task-implementer` subagent 를 호출하세요.

`subagent_type`: `task-implementer`
`description`: `implement <task-name>`
`prompt`:
```
대상 task .md 절대경로: <decided path>

planner 의 plan 결과:

<planner 의 응답 전체 — 특히 구현 순서·변경 예상 파일·위험·임시 가정 부분>

위 계획대로 코드 작성. 너의 system prompt 의 진행 순서 §1~7 다 따라:

1) 받은 컨텍스트 확인
2) task .md 재읽기
3) 의존 파일 재확인
4) todowrite 로 진행 추적
5) 절대 규칙 §1~6 준수하며 코드 작성
6) 큰 단위 끝낼 때마다 tsc --noEmit 가볍게 확인
7) DS 부족 발견 시 STOP

최종 보고는 너의 system prompt 의 보고 양식대로.

⚠️ raw 스타일 0건. @dei/ui · @dei/api · @dei/shared logger · POLICY · analytics-taxonomy 절대 규칙 어기지 마.
```

응답에서 추출:
- **변경 파일 목록**
- **가벼운 tsc 결과**
- **차단 사유** (있다면)

차단이면 사용자에게 보고하고 멈춤. 3단계 진행 X.

진행 안내:
```
implement 완료. 검증 시작합니다.
```

---

## 3단계: verify (task-verifier — Sonnet)

Task 도구로 `task-verifier` subagent 를 호출하세요.

`subagent_type`: `task-verifier`
`description`: `verify <task-name>`
`prompt`:
```
대상 task .md 절대경로: <decided path>

implementer 가 변경한 파일 목록:

<implementer 의 응답에서 변경 파일 list 부분>

이 변경 검증해줘. 너의 system prompt 의 진행 순서 §1~5 다 따라:

1) task .md DoD 추출
2) tsc --noEmit, lint, test 실행
3) 변경 파일 영향 범위 확인
4) 모두 통과 시 task .md status: pending → done 갱신
5) 자동 검증 못 하는 항목 (실기·realtime 2디바이스) 수동 검증 권고 list

최종 보고는 너의 system prompt 의 보고 양식대로.

⚠️ 검증 실패 시 새 코드 짜지 마 — implementer 재호출 권유만.
```

---

## 4단계: 사용자에게 최종 통합 보고

3 subagent 의 결과를 합쳐서 한 번에 보고:

```
## ✅ /task $ARGUMENTS 완료

### 📋 plan (task-planner · Opus)
- 선행 검증: <ok / 차단>
- 합의 점검: <ok / 차단>
- 구현 순서: <항목 N개>

### 💻 implement (task-implementer · Sonnet)
- 변경 파일: <N개>
  - <list>
- 절대 규칙 준수: <ok>
- 가벼운 tsc: <pass / fail>

### 🧪 verify (task-verifier · Sonnet)
| 검증 | 결과 |
|---|---|
| tsc --noEmit | ✓ |
| pnpm lint | ✓ |
| pnpm test | ✓ |

- task .md status: <pending / done>

### 📋 사용자 수동 검증 권고
1. <항목>
2. <항목>

### ⚠️ 미해결 (있을 때만)
- <항목>
```

# 중요 규칙

- 각 subagent 는 **이전 단계 대화를 못 봄.** 모든 필요한 컨텍스트를 프롬프트에 직접 박아.
- 단계 사이에 사용자에게 진행 상황을 1~2줄로 알려.
- 차단 사유 발견 시 다음 단계 진행 X — 사용자에게 보고.
- 사용자 승인 없이 `git commit` / `git push` 금지.
- caveman 모드 — 군더더기·이모지·"~하겠습니다" 금지.
