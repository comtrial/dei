# S13 · 일상 공유 방 (8셀 분할 ★시그니처)

- **status**: pending
- **owner**: C (손승태)
- **priority**: P0 ★ — dei 유일 시그니처. 가장 무겁고 가장 중요.
- **route**: `apps/mobile/app/(app)/room/[roomId]/index.tsx`
- **선행**: C-0 영상 모듈, C-0b realtime, **C-1 영상 서빙 최적화 §1 결정 (셀=썸네일 vs 영상)**, **C-2 grid 렌더 최적화**, S10/S11/S11b 플로우 완성

---

## 1. 목적

dei 의 **유일한 시그니처 화면**. PRD §4 핵심 메커니즘이 모두 여기서 작동:
- 매시간 3초 영상 모자이크
- 블러 게이트 (24h sliding window)
- 방 단위 공유 (멤버 8명까지)

매칭 후 홈의 **③b 언블러 모드**(본인 영상 24h 내 존재). 24h 마지막 영상 경과 시
③b → ③a (S10) 자동 전환.

---

## 2. 진입·이탈

| | |
|---|---|
| **진입** | S01 (매칭 후 라우팅, 본인 영상 24h 내 존재) / S11b 업로드 성공 (S10 → S13 자동 전환) |
| **이탈** | 셀 본체 탭 → S13b / 셀 아바타 탭 → S14 / 💬 헤더 → S13a (A 담당) / ⋯ 메뉴 → S16 (B 담당) / 24h 본인 영상 경과 → S10 자동 전환 |

**뒤로가기 없음**. 방 자동 종료(마지막 1명 이탈) → S05 복귀 + 토스트.

---

## 3. 의존 DS 컴포넌트 (`@dei/ui` 만)

- `TopNav` (RoomHeader) — 중앙 dei 로고 + back 숨김 + 우측 아이콘 그룹.
- `IconButton` — 💬 채팅 (→ S13a) / ⋯ 메뉴 (→ 방 정보/나가기 sheet).
- `Badge` — 채팅 미읽음 dot (숫자 X).
- `Chip` — TimeStrip 시간대 pill row (스와이프, now pill 강조, tabular-nums).
- `GridRoom` — 8셀 2×4 그리드 (gap 4px, 셀 aspect-ratio 3/4, radius 14px).
  - **좌측 컬럼 = 본인 성별 / 우측 컬럼 = 반대 성별** (HTML 행 우선 배치).
- `Avatar` (PresenceAvatar) — who 칩 (아바타 + 닉네임 + 업로드 시간).
- `PulseRing` — 라이브 presence (accent 링 + 온라인 dot).
- `FullscreenVideo` — 셀 본체 탭 → S13b.
- `EmptyBlob` — 빈 셀 blob 얼굴. 활동 시간대 '[닉네임] · 안 올림' / 새벽 'zzz'.
- `Banner` (Toast) — 24h 임박 / 멤버 자동 퇴장 / 방 자동 종료 안내 (조건부).

---

## 4. 의존 데이터

| 테이블 | 용도 |
|---|---|
| `room` | 방 직행 라우팅 조건, status, ended_reason |
| `room_member` | 멤버 리스트 (성별 컬럼 split), 자동 퇴장/차단 상태 |
| `video` | 멤버별 시간대 3초 영상 — 셀 배경 + 업로드 시각, 24h 만료 판정 |
| `message` | 헤더 채팅 미읽음 dot 카운트 (A 담당이지만 본인 unread 쿼리는 여기서) |
| `block` | 차단 멤버 → 본인 화면 셀 빈 칸 |
| `profile` | 멤버 닉네임/아바타 |

RLS 게이트: `room_is_member(p_room_id, auth.uid())` 가 true 인 경우만 SELECT 가능 (A 가 고정).

---

## 5. Realtime / Presence

C-0b 의 hook 3개 사용:
- `useRoomVideos(roomId)` — `video` INSERT 자동 푸시.
- `useRoomPresence(roomId, userId)` — `online` 집합 → PresenceAvatar PulseRing.
- `useRoomMembers(roomId)` — `room_member` UPDATE → auto_kick/leave 토스트.

---

## 6. 구현 체크리스트

### 6-1. 진입 가드 (블러 게이트 — ③a/③b 결정)
- [ ] 마운트 시 본인 24h 내 `video` count 조회.
  - 0건 → `router.replace('/(app)/room/' + roomId + '/preview')` (S10 으로).
  - ≥1건 → 본 화면 본문 표시.
- [ ] 24h 경계는 realtime 으로 정확히 감지 어려움 → focus 시 재평가 + 24h 임박 1시간 전부터 Banner.

### 6-2. Header (TopNav)
- [ ] 중앙 dei 로고 + back 숨김.
- [ ] 💬 IconButton + 미읽음 Badge dot — 탭 시 S13a route 로 (A 가 채울 화면).
- [ ] ⋯ IconButton — 탭 시 BottomSheet "방 정보 / 방 나가기" — 방 나가기 → S16 route (B 담당).

### 6-3. TimeStrip
- [ ] 과거 1~7 시간대 pill row (스와이프 가능).
- [ ] 현재 시간 pill 강조 (now). `packages/shared/timeOfDay` 로 KST 고정.
- [ ] 새벽 시간대 (0~7시 KST) 는 'zzz' 표시.
- [ ] **시간대 변경 시 cache hit 우선** (C-2 §2-2) — 데이터 swap, mount 새로 X.
- [ ] **매시 정각 자동 갱신** (C-2 §5-3) — setInterval(60s) 로 분 체크, 시 변경 시 trigger.
- [ ] 선택된 시간대 → GridRoom 의 video 쿼리 hour_slot filter 변경.
- [ ] 초기 fetch = 현재 ± 3시간 7시간치를 1 RPC 로 (`get_room_signed_urls_batch` — L1 §4-1b).

### 6-4. GridRoom (8셀)
- [ ] 2×4 그리드. 행 우선 배치 (좌 1행 → 우 1행 → 좌 2행 ...).
- [ ] 좌측 = 본인 성별 멤버 / 우측 = 반대 성별. `profile.gender` 기준.
- [ ] **셀 배경 = C-1 §1 결정 사항**:
  - 옵션 A (권장): `expo-image` 썸네일 jpg (`thumbnail_path` 의 signed URL) + transition 250ms cross-fade.
  - 옵션 B: muted autoplay loop 영상 (디코더 한계 ≤ 4, viewport 밖 release).
- [ ] 셀 위 overlay: `Avatar` + 닉네임 + 업로드 시간 + (옵션 A 면) 우상단 ▶ 아이콘.
- [ ] 빈 셀 = `EmptyBlob` ("[닉네임] · 안 올림" 또는 'zzz').
- [ ] **차단 멤버 셀** = 본인 화면에서 빈 칸 (다른 멤버는 정상). `block` join 으로 결정.
- [ ] **auto_kicked / left 멤버** = 빈 칸 + 토스트로 알림 (1회).
- [ ] **셀 컴포넌트 `React.memo`** + `videoId + uploadTime` 만 비교 (C-2 §1-1).
- [ ] **presence dot, 닉네임, 시간 라벨 각각 분리** — leaf 단위 re-render (C-2 §1-1).

### 6-5. 셀 탭 액션
- [ ] 셀 본체 탭 → `/(app)/room/[roomId]/video/[videoId]` (S13b 풀스크린).
- [ ] 셀 아바타 탭 → `/(app)/room/[roomId]/members?userId=...` (S14 프로필).

### 6-6. Realtime 갱신 (C-2 §1-3 정합)
- [ ] `useRoomVideos` → 새 영상 INSERT 시 **debounce 100ms** 후 단일 셀만 patch (전체 re-render X).
- [ ] `useRoomMembers` → status='auto_kicked'/'left' 감지 시 셀 fade-out 200ms 후 EmptyBlob 으로 swap + Toast Banner.
- [ ] `useRoomPresence` → online 집합 변화 시 **각 셀이 자기 user_id 만 구독** (전체 grid re-render X).
- [ ] 끊김 시 pull-to-refresh (ScrollView refreshControl) 노출 + 자동 backoff 재구독.
- [ ] AppState 'active' 전환 시 5분+ 백그라운드면 `invalidateQueries` 강제 refetch (C-2 §2-4).

### 6-7. 24h 경과 임박 / 방 자동 종료
- [ ] 본인 마지막 영상 + 23h 시점부터 Banner "곧 영상이 잠겨요" 토스트.
- [ ] `room.status='ended'` realtime 감지 → S05 로 router.replace + "방이 종료됐어요" 토스트.

---

## 7. 컴포넌트 명세 (handoff.html S13)

```
[ ] 헤더 — dei 로고(중앙) + 💬(미읽음 dot) + ⋯ 메뉴
[ ] timestrip — 과거~현재 시간대 스와이프 (새벽 'zzz')
[ ] 2×4 그리드 — 좌=본인 성별 / 우=반대 성별 (가로 영상 강제)
[ ] 셀 — 가로 영상 배경 + 아바타 + 닉네임 + 업로드 시간
[ ] 빈 셀 — '[닉네임] · 안 올림' / 새벽 'zzz'
[ ] "바뀐 홈" 시각 시그널 (DS 영역)
[ ] 24h 경과 임박 안내 토스트 (조건부)
[ ] 멤버 자동 퇴장 안내 토스트 (조건부)
[ ] 상태바
```

---

## 8. 정책 (L2 / POLICY)

- `POLICY.blurGate.visibilityWindowHours` = 24
- `POLICY.room.endWhenAllLeft` = true (마지막 1명 이탈 시 자동 종료)
- `POLICY.room.autoExpireDays` = 7 (방 최대 수명)
- `POLICY.autoKick.thresholdFor(memberCount)` — 자동 퇴장 임계 (운영 로직, 클라는 결과만 받음)
- 휘발성 정책 — 방 종료 시 영상·채팅 영구 소멸

---

## 9. 발생 이벤트

- `S5:room_joined_unblurred` — 진입 + 본인 영상 있음 (이 화면 본문 표시).
- `S5:blur_reapplied_24h_passed` — 24h 경계 도달로 ③b → ③a 전환 (실제 router.replace 시점).
- `S5:room_closed_last_member_left` — broadcast 'room_ended' 수신 시.
- `S3:home_entered_waiting` — (관련 — 매칭 전 홈 → S05 와 연계, 이 화면 X)

---

## 10. 테스트

- **component**: 본인 영상 0건 → router.replace 호출 (이 화면 안 보임).
- **component**: 본인 영상 ≥1건 + 8명 mock → grid 2x4 렌더링, 좌/우 컬럼 성별 split 검증.
- **component**: timestrip 시간대 변경 → useRoomVideos 가 hour_slot filter 갱신.
- **component**: 차단 멤버 셀 = EmptyBlob.
- **component**: useRoomMembers 가 left 이벤트 emit → Toast 표시.
- **integration (CI 실DB)**: 두 e2e 유저 + 같은 방 → A 가 영상 업로드 → B 의 grid 에 realtime 으로 표시 (≤3초).
- **e2e-realdb 필수**: 본인 영상 만료 24h 시뮬레이션 → S10 으로 자동 전환.

---

## 11. 위험

- **realtime 채널 누수** — useEffect cleanup 빠뜨리지 마라. C-0b 의 unsubscribe 헬퍼 필수.
- **grid 멤버 수 ≠ 8** (실제 멤버 4~6명 등) — 빈 셀 보장. 8셀 고정 vs 동적? DS 결정 — `GridRoom` props 확인.
- **차단 = 양방향 숨김** (PRD §9) — A 가 B 차단했으면 A 화면에서 B 셀 빈칸 + B 화면에서 A 셀 빈칸 둘 다 처리.
- **시간대 변경** — KST 기준 hour_slot. `packages/shared/src/timeOfDay` 헬퍼 사용.

---

## 12. 완료 정의 (DoD)

- [ ] tsc + lint + ds-enforce 통과.
- [ ] 모든 component test 통과.
- [ ] integration realtime 시나리오 통과.
- [ ] e2e-realdb 1개 이상 통과 (영상 INSERT → 다른 클라 grid 갱신).
- [ ] 실기 2대 동시 접속 수동 검증.
- [ ] A 1차 리뷰 OK (특히 채팅 헤더 진입 + 채널 공유 정합성).

---

## 13. 와이어프레임

`all-screens.html` S13 (line 2301~) · `handoff.html` S13
