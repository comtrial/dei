# 룸 캘린더에 "영상 있는 날짜" 점 표기 — 설계

## 배경 / 요구사항

룸 화면의 날짜 선택 캘린더(`CalendarSheet`)에서, **해당 날짜에 영상이 1개라도
있으면 점(dot)으로 표시**한다. 사용자가 "어느 날에 영상이 있는지"를 캘린더에서
한눈에 알 수 있게 한다.

- **표기 단위**: 날짜 단위 — 그 날(00~23시 통틀어) 영상이 1개라도 있으면 점 1개.
- **조회 범위**: 캘린더의 선택 가능 범위와 동일 = `오늘 ~ (오늘 - POLICY.room.autoExpireDays)`.
  영상은 `autoExpireDays(7일)` 후 만료되므로 이 범위 밖에는 영상이 없다.
- **갱신 시점**: 캘린더가 열릴 때마다 1회 조회. 닫혀 있는 동안엔 추가 쿼리 없음.
- **DB/RPC/Edge/마이그레이션 변경 없음** — 기존 `video` 테이블 읽기만.

## 현재 구조

- `apps/mobile/components/calendar-sheet.tsx` — `react-native-calendars` 사용.
  `markedDates`에 **선택된 날짜 1개만** 표시. 영상 유무 표기는 없음.
- `apps/mobile/hooks/useRoomVideos.ts` — 시간대 범위(hourFrom~hourTo)로만 조회.
  날짜 전체의 영상 유무는 다루지 않음 → 별도 경량 쿼리 필요.
- `video.created_at`(ISO timestamp), `video.status`('ready'), `video.room_id`.

## 데이터 흐름

```
날짜 칩 탭 → calendarOpen = true
   ↓
useRoomVideoDates(roomId, range, enabled=calendarOpen)  ← 신규 훅
   ↓ enabled 가 true 되는 순간 1회
getRoomVideoDates(roomId, fromMs, toMsExclusive)         ← 신규 RPC 함수
   = video.select('created_at').eq(room_id).eq(status,'ready')
     .gte(created_at, fromIso).lt(created_at, toIso)
   ↓
created_at(ISO) → kstDateKey(ms) = 'YYYY-MM-DD' (KST) Set
   ↓
CalendarSheet markedDates 합성:
   영상 있는 날 = { marked:true, dotColor }
   선택일       = { selected:true } (영상일과 겹치면 점+강조 공존)
```

## 단위 분해

### 1. `kstDateKey(ms: number): string` — `packages/shared/src/timeOfDay.ts`

- **무엇**: epoch ms → KST 기준 `YYYY-MM-DD` 키. 기존 `getKstHour`와 동일한
  UTC+9 변환 규칙을 따른다.
- **왜 공유 유틸로**: `calendar-sheet.tsx`의 `dateToKey`(로컬 타임존 기반)와
  점 위치가 어긋나는 버그를 막기 위해 날짜키 규칙을 단일 소스로 둔다.
  `getRoomVideoDates`(created_at→키)와 캘린더 selectedKey 가 같은 규칙을 써야
  점이 선택일과 정확히 정렬된다.
- **의존성**: 없음(순수 함수). **테스트**: Vitest 단위(timeOfDay.test.ts 확장).

### 2. `getRoomVideoDates(roomId, fromMs, toMsExclusive): Promise<Set<string>>` — `apps/mobile/lib/room-rpc.ts`

- **무엇**: 방의 ready 영상 중 `[fromMs, toMsExclusive)` 범위 내 것의
  `created_at`만 select → `kstDateKey`로 변환해 날짜키 Set 반환.
- **왜 created_at만**: 7일치 수십 row 수준이라 가볍고, 점 표시에 날짜만 필요.
- **실패 처리**: `logger.captureException` + 빈 Set 반환 → 점만 안 보이고 날짜
  선택은 정상(graceful degradation).
- **의존성**: `supabase`, `logger`, `kstDateKey`.

### 3. `useRoomVideoDates(roomId, range, enabled)` — `apps/mobile/hooks/useRoomVideoDates.ts`

- **무엇**: `enabled && roomId`일 때 `getRoomVideoDates` 1회 호출 → `dateKeys` Set 보관.
- **왜 enabled 게이트**: 캘린더 닫혀 있을 땐 쿼리 없음. realtime 구독 없음(YAGNI —
  닫혀있을 때 갱신 불필요, 열 때마다 최신이면 충분).
- **반환**: `{ dateKeys: Set<string>; loading: boolean }`.

### 4. `CalendarSheet` 확장 — `apps/mobile/components/calendar-sheet.tsx`

- `markedDateKeys?: Set<string>` prop 추가.
- `markedDates`를 `useMemo`로 합성: 영상일 → `{ marked, dotColor }`,
  선택일 → `selected` 머지(둘 다면 점+강조 공존).
- **하위호환**: prop 미전달 시 기존 동작(선택일만 강조) 유지.

### 5. 룸 화면 연결 — `apps/mobile/app/(app)/room/[roomId]/index.tsx`

- `calendarRange = { fromMs: calendarMinDate day-start, toMsExclusive: 오늘 day-end }`.
- `const { dateKeys } = useRoomVideoDates(roomId, calendarRange, calendarOpen);`
- `<CalendarSheet ... markedDateKeys={dateKeys} />`.

## 테스트 전략

- **Unit (Vitest)**: `kstDateKey` 변환(자정 경계, UTC↔KST), `getRoomVideoDates`의
  created_at→키 그룹화·빈 결과→빈 Set.
- **Component (Jest + RNTL)**: `CalendarSheet`에 `markedDateKeys` 전달 시
  `markedDates`에 점 반영, 선택일+영상일 겹칠 때 둘 다 유지.
- **실DB e2e 불필요**: 읽기 전용 단순 select, RLS/Edge/마이그레이션 변경 없음.
  기존 video RLS 가시성 그대로 사용.

## 영향 범위

- **신규**: `hooks/useRoomVideoDates.ts`, `room-rpc.ts`에 함수 1개,
  `timeOfDay.ts`에 `kstDateKey` 유틸.
- **수정**: `calendar-sheet.tsx`(prop + markedDates 합성),
  `room/[roomId]/index.tsx`(훅 연결).
- **화면**: 룸 날짜 선택 캘린더. **DB/RPC/Edge/마이그레이션**: 없음.
