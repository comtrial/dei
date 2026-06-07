# 방 화면 채팅 버튼 — 신규 메시지 unread 점 조건부 표시

작성일: 2026-06-07
브랜치: `feature/c/20260607-queue-room-lifecycle-e2e` (작업 시 신규 브랜치 분기 권장)

## 문제

방 화면(`apps/mobile/app/(app)/room/[roomId]/index.tsx`) 상단 채팅 버튼에
`<Badge variant="dot" />`(빨간 점)가 **무조건** 렌더된다(L796–798). 신규
메시지 유무와 무관하게 항상 "새 알림 있음"처럼 보인다.

## 목표

- 내가 안 읽은 신규 메시지가 **있을 때만** 점을 표시한다.
- 없을 때(또는 채팅을 확인한 직후)는 점을 숨긴다.

## 비목표 (YAGNI)

- 안 읽은 개수(숫자 배지) 표시 — 점 하나로 충분.
- read receipt(상대에게 "읽음" 표시) — 별개 기능.
- 푸시 알림 억제 연동 — 별개 기능.

## 접근: 서버 read marker (업계 정석)

"읽음" 상태를 `room_member.last_read_at`(timestamptz)에 서버 저장한다.
사용자가 **채팅 화면에 진입할 때** 그 시각을 `now()`로 갱신한다. 방 화면은
"내가 안 보낸, 나에게 보이는 메시지 중 `last_read_at` 이후 생성된 것이
하나라도 있는가"를 계산해 `hasUnread`면 점을 표시한다.

> 로컬(AsyncStorage) 대안 대비 멀티 디바이스 동기화·확장성(향후 unread 카운트/
> read receipt)이 정석. 사용자가 서버 방식을 선택함.

## 결정 사항 (확정)

- **읽음 시점**: 채팅 화면 **진입 시**.
- **귓속말 포함**: unread 판정에 @멘션 귓속말 포함 — 즉 "RLS상 나에게
  보이는 모든 메시지"(내가 보낸 것 제외)가 unread 신호. RLS가 이미
  "나에게 보이는 것"만 내려주므로 클라는 발신자 self 제외만 하면 된다.

## 설계

### 1. DB 마이그레이션

신규 파일: `supabase/migrations/20260607000010_room_member_last_read.sql`

#### DDL 체크리스트 (CLAUDE.md 규칙)

| 항목 | 판정 | 근거 |
|------|------|------|
| PK | N (변경 없음) | room_member PK = `(room_id, user_id)` 유지 |
| NOT NULL | N (nullable) | NULL = "아직 한 번도 안 읽음" 을 의미로 사용 |
| 인덱스 | N | unread 판정은 항상 본인 멤버 행 1개만 읽음 — 추가 인덱스 불필요 |
| FK | N (변경 없음) | 컬럼 추가만 |
| DEFAULT | N (없음) | NULL이 "미읽음"을 정확히 표현, DEFAULT now() 면 가입 즉시 읽음 처리돼 오답 |
| 컬럼 타입 | Y | `timestamptz` — 기존 `joined_at`/`left_at` 컨벤션 일치 |
| 네이밍 일관성 | Y | `_at` 접미사 → `last_read_at` (joined_at/left_at 과 동일) |

```sql
-- 1) 컬럼 추가
alter table public.room_member add column last_read_at timestamptz;

-- 2) 읽음 마킹 RPC — 본인 행만 갱신. security definer + room_is_member 가드.
--    send_room_message 와 동일 패턴(authenticated grant, auth.uid() 본인).
create or replace function public.mark_room_read(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.room_is_member(p_room_id, v_uid) then
    raise exception 'not_room_member' using errcode = '42501';
  end if;
  update public.room_member
    set last_read_at = now()
    where room_id = p_room_id and user_id = v_uid;
end $$;

revoke all on function public.mark_room_read(uuid) from public, anon;
grant execute on function public.mark_room_read(uuid) to authenticated;
```

> **RLS 추가 정책 불필요** — 기존 `room_member_update_self`
> (`user_id = auth.uid()`)가 본인 행 update를 이미 허용. RPC는 그 경계 안에서
> 동작한다. 그래도 RPC를 쓰는 이유: `now()` 서버 시각 사용 + 멤버십 재검증을
> 한 트랜잭션에서 보장하기 위함.

### 2. 타입 재생성

`pnpm db:gen-types` → `packages/api/src/database.types.ts` 에 `last_read_at`
및 `mark_room_read` 반영. 커밋 포함.

### 3. 클라이언트

#### (a) unread 판정 순수 함수 — `apps/mobile/lib/chat/unread.ts` (신규)

테스트 가능한 순수 로직으로 분리(Vitest unit 대상).

```ts
// "나에게 보이는, 남이 보낸 메시지의 가장 최근 created_at" vs last_read_at
export function hasUnread(
  latestOthersMessageAt: string | null, // ISO; 없으면 null
  lastReadAt: string | null,            // ISO; 한 번도 안 읽었으면 null
): boolean {
  if (latestOthersMessageAt == null) return false;     // 남의 메시지 없음
  if (lastReadAt == null) return true;                 // 미읽음 + 남 메시지 존재
  return new Date(latestOthersMessageAt).getTime() > new Date(lastReadAt).getTime();
}
```

#### (b) unread 훅 — `apps/mobile/hooks/useRoomUnread.ts` (신규)

방 화면에서 사용. 책임:

1. 방 진입 시 본인 `room_member.last_read_at` 1회 조회(supabase select).
2. "남이 보낸 최신 메시지 시각"을 추적:
   - 초기: `message` 테이블에서 `room_id=eq` AND `user_id<>self` 중 최신 1건
     `created_at` 조회(RLS가 귓속말 가시성·차단 자동 필터).
   - 실시간: 기존 `subscribeRoomMessages(roomId, ...)` 재사용. 들어온 row의
     `user_id !== selfId` 이면 `latestOthersMessageAt` 갱신.
3. `useFocusEffect`로 화면 재포커스 시 `last_read_at` 재조회 → 채팅에서
   돌아오면 점이 사라지도록 보정(realtime 누락 대비 belt).
4. 반환: `{ hasUnread }` (위 순수 함수 결과).
5. 비동기 경계는 `logger.withErrorCapture` 로 보호. 조회 실패는 회복 가능
   (점이 안 정확할 뿐) → 조용히 캡처. 단순 select 실패는
   `logger.captureException` 한정.

#### (c) 읽음 마킹 — 채팅 화면 진입 시 (`app/(app)/room/[roomId]/chat.tsx`)

화면 mount 시 `mark_room_read(roomId)` RPC 1회 호출.
`logger.withErrorCapture('room.mark-read', ...)` 로 비동기 경계 보호.
실패해도 채팅 자체는 정상 동작 → 점이 안 사라질 뿐. 회복 가능, 캡처만.

#### (d) 조건부 렌더 — `room/[roomId]/index.tsx`

```tsx
const { hasUnread } = useRoomUnread(roomId, user?.id ?? null);
// ...
<View>
  <IconButton glyph={MessageCircle} ... onPress={...} />
  {hasUnread ? (
    <View className="absolute top-[2px] right-[2px]">
      <Badge variant="dot" />
    </View>
  ) : null}
</View>
```

## 데이터 흐름

```
[채팅 진입] chat.tsx mount → mark_room_read(roomId) RPC → room_member.last_read_at = now()
                                                              │
[방 화면]  index.tsx ──useRoomUnread──┐                       │
   ├ 진입/재포커스: select last_read_at ◄──────────────────────┘
   ├ 초기: select 최신 "남의 메시지" created_at
   ├ realtime: subscribeRoomMessages → user_id≠self 시 latest 갱신
   └ hasUnread(latestOthersAt, lastReadAt) → 점 조건부 렌더
```

## 영향 범위

- **화면**: 방 화면(`room/[roomId]/index.tsx` — 점 조건부), 채팅 화면
  (`room/[roomId]/chat.tsx` — 진입 시 마킹)
- **DB / RPC**: `room_member.last_read_at` 컬럼 추가 + `mark_room_read` RPC 신규
- **Edge Function**: 변경 없음
- **타입**: `packages/api/src/database.types.ts` 재생성
- **정책 / 상수**: 변경 없음

## 에러 처리

- `mark_room_read` 실패: 회복 가능(점 안 사라짐). `logger`로 캡처만, 사용자
  흐름 차단 없음.
- `last_read_at` / 최신 메시지 조회 실패: 점 부정확. `logger.captureException`
  캡처. 기본값은 "점 숨김"으로 안전측(오탐보다 미탐이 덜 거슬림).
- realtime 누락(백그라운드 등): 재포커스 시 `last_read_at`/메시지 재조회로 보정.

## 테스트 (CLAUDE.md Testing 7·8·9 — DB 변경이므로 필수)

| 계층 | 대상 | 위치 |
|------|------|------|
| Unit (Vitest) | `hasUnread` 순수 함수 경계(null/동일/이후/이전) | `apps/mobile/lib/chat/__tests__/unread.test.ts` |
| 실DB e2e (Vitest + 로컬 supabase) | mark_room_read RPC → last_read_at 반영 → unread 판정 관통 | `apps/mobile/__tests__/integration/room-unread.integration.test.ts` |

### 실DB e2e 시나리오 (앱과 동일 RPC 경로)

전용 테스트 유저(`e2e-*@example.test`) 2명 생성 → 실제 JWT 발급(기존
`send-message-rpc.test.ts` 패턴 재사용) → 같은 방 멤버로 세팅:

1. 유저B가 `send_room_message` RPC로 메시지 전송.
2. 유저A 관점: `room_member.last_read_at`(NULL) + 최신 남의 메시지 존재
   → `hasUnread === true` 확인.
3. 유저A가 `mark_room_read` RPC 호출 → `room_member.last_read_at` 갱신 확인.
4. 재판정: `hasUnread === false` 확인.
5. 유저B가 메시지 1건 더 전송 → 유저A `hasUnread === true` 재확인.
6. `try/finally` 로 생성 데이터(유저·방·멤버·메시지) 전량 cleanup,
   시작=끝 카운트 동일 확인(기존 실데이터 무접촉).

> Edge Function 변경이 없으므로 `functions.invoke` 경로는 불필요. mark/send
> 둘 다 RPC라 앱과 동일 경로로 관통.

### 검증 체크리스트

- [ ] typecheck (`pnpm -F mobile exec tsc --noEmit`)
- [ ] lint (`pnpm lint`)
- [ ] test (`pnpm test` — unread 순수 함수)
- [ ] 실DB e2e (`pnpm test:integration` — room-unread)
- [ ] 마이그레이션 적용 + `pnpm db:gen-types` 반영 커밋

## 사람이 확인해야 할 부분

- **귓속말 포함 정책**: unread에 @멘션 귓속말 포함(확정). 나중에 "일반
  메시지만" 으로 바꾸려면 메시지 조회/realtime 필터에 `whisper_to_user_id is
  null` 조건 추가만 하면 됨.
- **점 안전측 기본값**: 조회 실패 시 점을 **숨김**으로 처리(미탐). 반대로
  하고 싶으면(실패 시 점 표시) 훅 기본값만 뒤집으면 됨.
- **DEFAULT 없음 결정**: `last_read_at`에 DEFAULT now()를 안 둠 — 방 가입
  직후엔 "안 읽음"이 정상(아직 채팅 안 봄)이라 NULL이 맞음.
