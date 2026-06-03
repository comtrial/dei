# C-0b · 방 Realtime / Presence / 영상 신호

- **status**: done
- **임시 가정 적용**: §2-1 `room_ended broadcast` 담당 합의 미정 → 클라 폴백(`useRoomEndedDetector`) 으로 옵션 B 강행. A 합의 후 재검토 필요.
- **owner**: C (손승태) — 단, 채널 네이밍·구독/해제 유틸은 A 가 SSOT (`lib/realtime.ts`)
- **priority**: P0 (S13 시그니처 화면 전제)
- **대상 파일**: `apps/mobile/lib/realtime.ts` 확장 + `apps/mobile/hooks/useRoomPresence.ts` 신규
- **선행**: 없음 (C-0 와 병행 가능)

---

## 1. 목적

S13 일상 공유 방의 **실시간 신호 3종** 을 단일 채널 위에 흘린다:

1. **presence** — 누가 방에 들어와 있는가 (라이브 dot · PulseRing).
2. **video INSERT** — 새 영상 모자이크 자동 갱신.
3. **room_member UPDATE** — auto_kick / 본인 leave / 다른 멤버 leave (셀 빈칸 + 토스트).

A 가 담당하는 **message INSERT** 와 같은 채널을 공유하므로, **채널 네이밍·구독/해제는
이미 만들어진 `lib/realtime.ts` 의 헬퍼만 거친다** (직접 `supabase.channel('room:...')` 금지).

---

## 2. 합의 필요 (A ↔ C) — 코드 짜기 전 필수

`docs/c-tasks/README.md` §2-2 의 표를 확정하고 이 문서에 박는다:

### 2-1. 확정 규약 (작성 후 채워넣을 곳)

| 신호 | 담당 | 메커니즘 | 페이로드 | 비고 |
|---|---|---|---|---|
| message INSERT 전체 | A | postgres_changes | `message` row | 이미 `subscribeRoomMessages` |
| message INSERT 귓속말 | A | postgres_changes + filter | whisper_to_user_id=eq | A 작성 |
| presence sync | **C** | presence | `{ user_id, joined_at }` | **합의: 키=user_id** |
| video INSERT | **C** | postgres_changes | `video` row | **합의: filter=`room_id=eq.{roomId}`** |
| room_member UPDATE | **C** | postgres_changes | `room_member` row | **합의: status 변화 감지** |
| room_ended broadcast | **?** | broadcast 'room_ended' | `{ room_id, reason }` | **합의 미정** — Edge Function 발신 vs DB trigger |

### 2-2. 결정사항
- [ ] presence key 형식 = `user_id` (UUID) 직접 사용. 닉네임 노출은 client 가 join 시 메타로 따로 .track.
- [ ] 단일 채널 안에 postgres_changes 3개 (video / room_member / message) + presence + (optional) broadcast 가 공존 — Supabase 한계 (채널당 100 events) 안에서 OK.
- [ ] 끊김 복구 — `subscribe` callback 의 `CHANNEL_ERROR`/`TIMED_OUT` 시 자동 재구독 (현재는 logger.captureMessage 만 함).

---

## 3. 구현 체크리스트

### 3-1. `lib/realtime.ts` 확장

- [ ] `subscribeRoomVideos(roomId, onInsert)` — `video` 테이블 INSERT 구독. `subscribeRoomMessages` 와 동일 패턴.
- [ ] `subscribeRoomMembers(roomId, onChange)` — `room_member` UPDATE 구독 (auto_kick/leave 감지).
- [ ] `subscribeRoomPresence(roomId, userId, onSync)` — presence track + sync.
- [ ] 모두 cleanup unsubscribe 반환 (useEffect cleanup 필수).
- [ ] 재구독 로직 — 5초 backoff 후 자동 재시도.

### 3-2. `hooks/useRoomPresence.ts` (신규)

```ts
export function useRoomPresence(roomId: string): {
  online: Set<string>;  // online user_id 집합
  iAmOnline: boolean;
};
```

- [ ] 마운트 시 presence track (`{ user_id, joined_at: now }`).
- [ ] sync event 로 online 집합 갱신.
- [ ] unmount cleanup.
- [ ] S13 GridRoom 각 셀이 이 집합 참조 → PulseRing 표시.

### 3-3. `hooks/useRoomVideos.ts` (신규)

```ts
export function useRoomVideos(roomId: string): {
  videos: VideoRow[];
  refresh: () => Promise<void>;
};
```

- [ ] 초기 fetch (last 7h) + realtime INSERT 자동 push.
- [ ] 끊김 시 `refresh()` 로 pull-to-refresh 가능하게 노출.

### 3-4. `hooks/useRoomMembers.ts` (신규)

- [ ] room_member 초기 fetch + UPDATE 구독.
- [ ] status='auto_kicked' 또는 'left' 전이 감지 → onMemberLeft callback.
- [ ] S13 에서 "○○님이 방을 나갔어요" 토스트 표시 트리거.

---

## 4. 테스트

- **unit**: 채널 이름 생성 규약 (`roomChannelName('abc') === 'room:abc'`).
- **component**: `useRoomPresence` 가 mock channel 의 sync 이벤트로 online 집합 갱신.
- **integration (CI 실DB)**: 두 클라이언트 (각각 supabase client) → 한쪽 track → 다른 쪽 sync 받음.
- **e2e-realdb 필수**: 두 e2e 유저로 동시 join → 양쪽 모두 presence 표시 → 한쪽 leave → 반대편 onMemberLeft 토스트 트리거.

---

## 5. 위험·예외

- 채널 누수 — useEffect cleanup 빠뜨리면 메모리 누수 + Supabase 한도 (동시 채널 200) 초과.
  → `lib/realtime.ts` 의 unsubscribe 헬퍼만 사용.
- presence 중복 — 같은 user_id 가 2 디바이스에서 track 하면 둘 다 online 으로 보임 — 정상 (의도).
- postgres_changes 지연 — 1~2초 지연 가능. UI 는 낙관적 업데이트 안 함 (영상 INSERT 는 본인이 직접 했어도 realtime 으로 들어올 때까지 대기 — 셀 깜빡임 방지).

---

## 6. 발생 이벤트 (PostHog)

- (S13 화면이 호출) `S5:room_joined_unblurred` — 방 첫 진입 + 본인 영상 있을 때.
- `S5:room_closed_last_member_left` — broadcast 'room_ended' 수신 시 (또는 room.status='ended' 감지 시).

---

## 7. 완료 정의 (DoD)

- [x] A 와 §2-1 확정 규약 표 합의 완료 + 이 문서에 박음. ← 옵션 B 강행 (사용자 지시). `room_ended broadcast` 담당은 합의 미정 — 클라 폴백 적용.
- [x] 3 hooks 신규 + `lib/realtime.ts` 3 헬퍼 추가. (useRoomPresence / useRoomMembers / useRoomEndedDetector + subscribeRoomPresence / subscribeRoomMembers / subscribeRoomVideos)
- [ ] integration + e2e-realdb 통과. ← 실DB 2디바이스 검증 필요 (수동)
- [ ] A 1차 리뷰 OK. ← PR 머지 시점 별도 (verifier 범위 아님)
