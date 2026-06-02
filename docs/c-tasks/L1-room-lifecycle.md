# L1 · 방 생성·라이프사이클 Edge Function

- **status**: pending (A 합의 차단 중)
- **owner**: C (손승태) — 단, 매칭 엔진 측 진입점은 A
- **priority**: P1
- **위치**: `supabase/functions/room-lifecycle/index.ts` (신규)
- **선행**: README §2-1 (방 생성 핸드오프 계약) A 합의

---

## 1. 목적

방의 **생성·종료·자동 퇴장** 백엔드 로직. 마이그레이션(`supabase db push`) 만으로는
배포되지 않음 — Edge Function 별도 `supabase functions deploy room-lifecycle` 필수
(AGENTS.md §7 참고).

### 다루는 이벤트

1. **방 자동 종료** — `room.active_member_count == 0` 시 status='ended' + ended_reason='all_left'.
   영상·채팅 즉시 영구 소멸 (`POLICY.room.endWhenAllLeft=true`).
2. **자동 퇴장 (auto-kick)** — 절반 이상이 한 멤버 차단·신고 시 status='auto_kicked'
   (`POLICY.autoKick.thresholdFor`).
3. **방 만료** — `expires_at < now()` 도달 시 자동 종료 (`POLICY.room.autoExpireDays=7`).
4. **방 hard delete** — 종료 후 30일 (`POLICY.room.hardDeleteAfterDays=30`).

---

## 2. 합의 필요 (A ↔ C)

README §2-1 항목:
- [ ] 누가 `room` row INSERT — 매칭 엔진(A) 이라고 가정. 이 Edge Function 은 그 후 라이프사이클만.
- [ ] `group_match.room_id` set 시점 — push 이전.
- [ ] 자동 종료/자동 퇴장 트리거 방식:
  - **옵션 A**: DB trigger (room_member UPDATE → 트리거 → ended 전이)
  - **옵션 B**: Edge Function 스케줄러 (cron, 1분 주기)
  - **옵션 C**: 클라가 leave 시 RPC 호출 → 그 안에서 active_member_count 평가
- [ ] auto-kick 임계 평가 위치 — DB trigger vs Edge Function.

---

## 3. 구조 제안

```
supabase/functions/room-lifecycle/
├── index.ts           # 진입점 (HTTP POST 핸들러)
├── handlers/
│   ├── leave.ts       # 멤버 leave 처리 (active_member_count 감소 + 마지막 1명 판정)
│   ├── autoKick.ts    # block/report 임계 평가 + auto_kicked 전이
│   ├── expire.ts      # 만료 방 자동 종료 (cron 호출 대상)
│   └── purge.ts       # 30일 경과 hard delete (cron)
└── lib/
    ├── supabase.ts    # service_role client
    └── policy.ts      # POLICY 상수 mirror (또는 @dei/shared import)
```

---

## 4. 엔드포인트 (제안)

### 4-1. `POST /room-lifecycle/leave`
멤버가 방 나가기 직전 호출 (S16 의 final action). 트랜잭션:
1. `room_member.status='left'`, `left_at=now()` UPDATE.
2. `room.active_member_count` 재계산.
3. count=0 면 `room.status='ended'`, `ended_reason='all_left'`, `ended_at=now()`.
4. broadcast 'room_ended' (C-0b 합의 시).

요청: `{ room_id, user_id, leave_reason }`
응답: `{ room_ended: boolean, kicked_count_remaining: number }`

### 4-2. `POST /room-lifecycle/evaluate-autokick`
block 또는 report INSERT 후 호출 (DB trigger 가 webhook 으로 부르거나, 클라가 직접).
1. 대상 멤버의 `block` + `report` count 집계.
2. `POLICY.autoKick.thresholdFor(room_member_count)` 와 비교.
3. 임계 도달 시 `room_member.status='auto_kicked'`.

요청: `{ room_id, target_user_id }`
응답: `{ kicked: boolean }`

### 4-3. `POST /room-lifecycle/cron-expire` (인증된 cron 만)
주기적 cron (Supabase pg_cron 또는 Edge Function scheduler):
1. `room WHERE status='active' AND expires_at < now()` → 'ended' 전이.
2. `room WHERE status='ended' AND ended_at < now() - 30d` → hard delete (cascade 로 video/message 도 소멸).

---

## 5. 구현 체크리스트

- [ ] `supabase/functions/_shared/` 의 service_role client 재사용.
- [ ] `POLICY` 상수는 `@dei/shared/policy` import (Deno 호환 path 매핑 — 이미 monorepo 설정 확인).
- [ ] 모든 SQL 은 트랜잭션 (`supabase.rpc` 또는 stored procedure).
- [ ] 에러 로깅 — Edge Function 자체 console.error + Sentry (Edge 환경에서는 `@sentry/deno` 또는 fetch transport).
- [ ] CORS — 없음 (서버 내부 호출만).
- [ ] auth — service_role 또는 webhook secret 검증.

### 5-1. 마이그레이션 (필요 시)
- [ ] `room.active_member_count` 가 trigger 로 자동 갱신되는지 확인. 없으면 trigger 추가:
  ```sql
  create or replace function update_room_active_count() returns trigger ...
  ```
- [ ] pg_cron 설정 (옵션) — `supabase/migrations/20260530XXXXXX_cron_room_expire.sql`.

### 5-2. 배포 (AGENTS.md §7)
- [ ] `supabase functions deploy room-lifecycle`.
- [ ] 마이그레이션 push 와 함께 진행 (둘 다 해야 동작).
- [ ] **클라 실제 경로(Edge Function)** 로 e2e 검증 — `supabase.functions.invoke('room-lifecycle/leave', ...)`.

---

## 6. 테스트

- **integration (CI 실DB)**: leave 호출 → room_member 상태 + room.active_member_count 검증.
- **integration**: 4인 방에서 4명 leave → 4번째 호출에서 room_ended=true.
- **integration**: auto-kick 임계 — 4인 방 (대상 제외 3명) 중 2명이 block → kicked=true.
- **e2e-realdb 필수**: `supabase.functions.invoke('room-lifecycle/leave')` 경로로 호출 → DB 상태 변화 확인.
  - **AGENTS.md §7 규칙: RPC 직접 호출만 하지 말고 Edge Function 경로도 포함.**

---

## 7. 발생 이벤트 / Realtime

- `room.status='ended'` UPDATE → C-0b 의 `useRoomMembers` 가 감지 → S13 에서 자동 S05 로 router.replace.
- 또는 broadcast 'room_ended' (C-0b 합의 시).

---

## 8. 위험

- **active_member_count race condition** — 동시 leave 시 count 정합성 깨질 수 있음. SELECT FOR UPDATE 또는 stored proc 으로 트랜잭션화.
- **auto-kick 임계 평가 race** — block 동시 INSERT 시 중복 평가. trigger 안에서 advisory lock.
- **만료 cron 누락** — pg_cron 미설정 시 expires_at 도달해도 ended 안 됨. cron 설정 강제.
- **hard delete** — cascade 가 `video` storage 까지 삭제하지 않음. storage cleanup 별도 (`L1-video-pipeline.md` 의 purge job).

---

## 9. 완료 정의

- [ ] Edge Function 3 엔드포인트 + cron 1개 배포.
- [ ] 마이그레이션 trigger 추가 (필요 시).
- [ ] integration + e2e-realdb 통과.
- [ ] A 1차 리뷰 (특히 매칭 엔진 측 진입점 정합성).
- [ ] **`supabase functions deploy room-lifecycle` 실행 완료** + 클라 invoke 경로 e2e 통과.
