# C-2 · 방 grid 렌더 / Realtime 최적화

- **status**: in_progress
- **owner**: C (손승태)
- **priority**: **P0** — PM 명시: "다수 매칭 참여 시스템 개편으로 성능·화면 배치·시간대 관리 신경 쓸 부분 多".
- **선행**: C-0b realtime, C-1 영상 서빙 최적화 (썸네일 결정)
- **관련 task**: S13-room-grid, S13b-video-fullscreen

---

## 0. 배경

PM 우려 2번째 축 — **다수가 참여하는 매칭된 방** = S13 시그너처. 8명 멤버 × 7시간대 =
이론상 56셀. realtime 으로 새 영상 자주 들어옴. timestrip 스와이프로 시간대 이동.

성능 망가지는 시나리오:
1. **timestrip 시간대 변경 → 8셀 통째 fetch 재발급** → 매번 1초+ 로딩.
2. **realtime INSERT 마다 grid 전체 re-render** → 깜빡임·키보드 입력 지연.
3. **다른 멤버 동시 업로드** → 짧은 시간에 INSERT 폭증 → render thrash.
4. **timestrip 7시간대 전부 mount** → 56셀 동시 = 메모리 OOM (특히 옵션 B autoplay).
5. **방 이동·앱 백그라운드 복귀 시** stale data + 재구독 폭풍.

---

## 1. 렌더 최적화

### 1-1. 셀 컴포넌트 memoization
- [ ] `GridRoom` 의 셀 컴포넌트 `React.memo` + 동등성 비교 (`videoId + uploadTime` 만 비교).
- [ ] presence dot (실시간으로 자주 바뀜) 은 **별도 컴포넌트** 로 분리 → 셀 본체 re-render 안 함.
- [ ] 닉네임/시간 라벨도 분리 — 가능한 한 leaf 단위로.

### 1-2. timestrip 가상화 / lazy mount
- [ ] **현재 시간대만 mount.** 인접 ±1 시간대 만 추가 prefetch (데이터만 — DOM 마운트 X).
- [ ] timestrip 시간대 변경 = 데이터 swap, mount 새로 X.
  - `FlatList` 가로 + `pagingEnabled` 또는
  - 시간대 별 8셀 데이터를 `Record<hourSlot, Cell[]>` 로 캐시 + 현재 hour 만 렌더.
- [ ] 옵션 B/C (autoplay) 채택 시: 현재 hour 가 아닌 셀의 video player 즉시 release.

### 1-3. realtime debounce / batch
- [ ] `video` INSERT 가 동시에 N건 들어오면 → 100ms 윈도우 debounce.
- [ ] 셀 단위 patch: 전체 grid setState X → 해당 video 의 셀만 update (lookup map).
  ```ts
  const cellsById = useMemo(() => new Map(videos.map(v => [v.user_id + ':' + v.hour_slot, v])), [videos]);
  // 새 INSERT 들어오면 setVideos(v => [...v.filter(x => x.id !== new.id), new])
  ```
- [ ] presence sync 도 동일 — `online` Set update 시 셀이 모두 re-render 되지 않도록
      각 셀이 자기 user_id 만 구독 (custom hook).

### 1-4. 깜빡임 방지
- [ ] 새 영상 INSERT 시 셀 background 가 즉시 검은색 → 새 썸네일 로드 까지의 1초 깜빡임.
  → `expo-image` `transition={250}` cross-fade.
- [ ] 영상 status='processing' 일 때 셀 표시 = "곧 올라와요" 또는 이전 영상 유지 + 작은 spinner.
- [ ] auto_kicked / left 멤버는 셀 풀 풀 fade-out 200ms 후 EmptyBlob 으로 swap.

---

## 2. 데이터 fetch 전략

### 2-1. 초기 fetch
- [ ] 진입 시 1회: 현재 hour ± 3시간 = 7시간 × 8명 = 56 video row, 1 RPC.
  ```sql
  -- rpc('get_room_videos', { p_room_id, p_hour_from, p_hour_to })
  -- 동시에 signed URL · thumbnail URL 모두 반환 (C-1 §3-2 정합)
  ```
- [ ] 응답 cache → `react-query` queryKey `['room', roomId, 'videos', hourFrom, hourTo]`.
- [ ] staleTime 50분 (signed URL TTL 안에).

### 2-2. timestrip swipe
- [ ] 시간대 변경 = 캐시 hit 우선. miss 일 때만 fetch.
- [ ] 더 과거 (예: 8시간 전) 로 가려 하면 추가 fetch.
- [ ] 한 번에 7시간씩 끌어와서 추가 RPC 빈도 ↓.

### 2-3. realtime + cache 일관성
- [ ] `subscribeRoomVideos` INSERT 핸들러 안에서 `react-query` cache 직접 invalidate (또는 manual setQueryData).
- [ ] 다른 멤버 영상 INSERT → cache 에 추가 → re-render 단일 셀만.
- [ ] 끊김 시 `invalidateQueries(['room', roomId])` 로 강제 refetch.

### 2-4. 백그라운드 복귀
- [ ] AppState 'active' 전환 시 cache stale 판정 → refetch + realtime 재구독.
- [ ] 5분 이상 백그라운드면 강제 invalidate.

---

## 3. realtime 채널 효율

(C-0b 와 정합 — 합의 후 박는 표)

- [ ] 한 채널 (`room:{roomId}`) 위에 message + video + room_member + presence 모두.
- [ ] postgres_changes 는 셀 단위 patch 로 처리. presence sync 는 throttle 200ms.
- [ ] 재연결 backoff: 1s → 2s → 5s → 30s (cap).
- [ ] 채널 누수 방지 — useEffect cleanup 빠뜨리지 마라.

---

## 4. 메모리 / 디코더 관리 (옵션 B/C 시)

옵션 A (정적 썸네일) 채택 시 §4 무시 OK. 옵션 B/C 시:

- [ ] 동시 디코더 ≤ 4 (iOS H.264 한계).
- [ ] viewport 밖 셀의 `expo-video` player = `release()` 즉시.
- [ ] AppState 'inactive' = 모든 player pause.
- [ ] FlatList `removeClippedSubviews` + `windowSize` 조정.

---

## 5. 시간대별 화면 배치 (PM 우려 직격)

PM: "시간대 별 관리 등 신경 쓰일 부분 많다".

### 5-1. timestrip 표시 규칙
- [ ] 활동 시간대 (07~23 KST): pill 표시.
- [ ] 새벽 (00~07 KST): 'zzz' pill 표시 + 진입 차단 (영상 없음).
- [ ] 현재 시간 = ink 채움 강조 (이미 `TimeChip` 구현).
- [ ] **타임존**: 디바이스 로컬 vs KST 고정? → **KST 고정** (한국 서비스 + `POLICY.notifications.quietHours` KST 정합).
- [ ] `packages/shared/src/timeOfDay.ts` 헬퍼 사용 (이미 존재).

### 5-2. 시간대별 셀 구성
- [ ] 좌측 컬럼 = 본인 성별 / 우측 = 반대 성별 (handoff §S13). 행 우선 배치.
- [ ] 멤버 수 < 8 일 때 빈 슬롯 처리:
  - 빈 슬롯 = `EmptyBlob` "안 올림" (해당 시간대 미업로드).
  - 빈 슬롯 ≠ "방이 비어있음" — 멤버는 있지만 그 시간대 영상이 없을 뿐.
- [ ] 차단 멤버 → 본인 화면에서만 빈 칸 (양방향 숨김 §9).
- [ ] auto_kicked → 모두에게 빈 칸.

### 5-3. 시간대 자동 갱신
- [ ] 매시 정각에 현재 시간 pill 자동 이동 (예: 13:59 → 14:00 시 grid 데이터 + now pill 동시 갱신).
- [ ] `setInterval(60000)` 으로 분 단위 체크 — 시 변경 시 trigger.

---

## 6. 측정 / 모니터링

PostHog 이벤트 (taxonomy 추가):
- [ ] `room_grid_first_render` (roomId, video_count, latency_ms)
- [ ] `room_grid_realtime_lag` (roomId, expected_at, received_at) — INSERT 후 grid 반영 지연
- [ ] `room_timestrip_swipe` (from_hour, to_hour, cache_hit: boolean)

Sentry:
- [ ] grid render error · realtime 끊김 자동 캡처.

---

## 7. 테스트

- **unit**: cellsById Map lookup. throttle/debounce 로직.
- **component (jest)**:
  - 8셀 mount → 모두 렌더 확인.
  - 1 영상 INSERT mock → 해당 셀만 re-render (다른 셀 spy 0 호출).
  - timestrip swipe → 데이터 swap, 셀 unmount X.
- **integration (CI 실DB)**:
  - 두 e2e 유저 → A 업로드 → B 의 grid 에 ≤ 1초 안에 반영.
  - 8건 동시 INSERT → debounce 로 grid setState 호출 횟수 ≤ 2.
- **e2e-realdb**: 실 디바이스 2대, 30분 가만 두고 메모리 누수 없는지 (메모리 ≤ 200MB 유지).

---

## 8. 완료 정의

- [ ] §1 렌더 4항목 완료.
- [ ] §2 fetch 4항목 완료.
- [ ] §3 채널 효율 완료.
- [ ] §5 시간대 3항목 완료.
- [ ] PostHog 3 이벤트 추가.
- [ ] performance 메트릭:
  - 초기 grid 렌더 ≤ 1.5s
  - timestrip swipe (cache hit) ≤ 100ms
  - realtime INSERT → 셀 반영 ≤ 500ms
  - 30분 idle 후 메모리 증가 ≤ 50MB
- [ ] A 1차 리뷰 OK.
- [ ] PM 시연 OK.

---

## 9. 참고

- React.memo + custom equalityFn — leaf 컴포넌트 분리 패턴.
- react-query staleTime + cache time 정합.
- Supabase Realtime 채널 한도 (channel events ≤ 100/sec, presence size ≤ 100 keys).
