# Rooms-Pivot 화면 구조 (Phase 0.5)

> expo-router 페이지 구조. 그림 A 의 노드와 1:1 매핑.

## 디렉토리 트리

```
apps/mobile/app/
├── _layout.tsx                     (KEEP, 수정)
├── index.tsx                       (KEEP - splash)
├── (auth)/                         (KEEP 전체)
│   ├── welcome.tsx
│   ├── terms.tsx
│   ├── terms-detail.tsx
│   ├── phone.tsx                   (본인인증)
│   └── account-status.tsx
├── (onboarding)/                   (KEEP 전체)
│   ├── profile.tsx
│   └── log-intro.tsx
├── (app)/                          (대폭 재작성)
│   ├── _layout.tsx                 (탭 정의 새로)
│   ├── home.tsx                    (새로 작성 — 그림 A "가입/홈" 매칭 대기 상태)
│   ├── solo-join.tsx               (새로 — "혼자 참여" 큐 등록 확인)
│   ├── group/                      (새로 — 묶음 구성/관리)
│   │   ├── new.tsx                 ("닉네임 초대 → 묶음 구성")
│   │   ├── [groupId].tsx           (묶음 상태 보기 — 매칭 대기 / 멤버 가용성 / 큐 진입)
│   │   └── invite-search.tsx       (닉네임 검색 모달용 별도 라우트)
│   ├── room/                       (새로 — 방 단위 모든 화면)
│   │   ├── [roomId]/
│   │   │   ├── index.tsx           (분할 피드 = 그림 A "공유 화면")
│   │   │   ├── chat.tsx            (전체 채팅 + @멘션 = 그림 A "전체 채팅")
│   │   │   ├── members.tsx         (멤버 목록 + 차단/신고 진입 = 그림 B 입구)
│   │   │   ├── upload.tsx          (3초 영상 촬영/업로드 = 그림 A "최대 3초 영상 게시")
│   │   │   └── leave-confirm.tsx   (그림 A "방 나가기?" 분기)
│   ├── booster.tsx                 (새로 — BM 구매 = 그림 A "즉시 재매칭")
│   ├── record.tsx                  (KEEP — 일반 영상 녹화. 새 도메인의 room/upload 와 분리)
│   ├── settings.tsx                (KEEP)
│   ├── my-profile.tsx              (KEEP)
│   └── profiles/[userId].tsx       (KEEP — 다른 멤버 프로필 조회)
├── result.tsx                      (KEEP - 영상 검수)
├── log-detail.tsx                  (KEEP)
└── log-detail/
    └── delete-confirm.tsx          (KEEP)
```

> **삭제**: `chat.tsx`, `chat-room.tsx`, `messages.tsx`, `matches.tsx`, `matched/[matchId].tsx`,
> `likes.tsx`, `likes/received/[id].tsx`, `likes/sent/[id].tsx`, `discovery.tsx`, `modal.tsx`

---

## 그림 A → 화면 매핑

| 그림 A 노드 | expo-router 경로 | 비고 |
|---|---|---|
| 가입 / 홈 (매칭 대기) | `(app)/home.tsx` | "지금 무엇을 할까요?" 진입 |
| 참여 방식? | `(app)/home.tsx` 내 분기 버튼 | (혼자 / 함께) |
| 개인 큐 등록 | `(app)/solo-join.tsx` | 확인 시트 → enqueue RPC |
| 닉네임 초대 → 묶음 구성 | `(app)/group/new.tsx` + `invite-search.tsx` | 친구 닉네임 검색 + 추가 |
| 초대 멤버 상태 확인 | `(app)/group/[groupId].tsx` | 각 멤버의 "다른 방 사용 중?" 표시 |
| 매칭 불가 → 총대 안내 | `(app)/group/[groupId].tsx` 내 배너 | 멤버 조정 후 재시도 버튼 |
| 운영진 방 매칭 진행 | (대기 화면) `(app)/home.tsx` 또는 `group/[groupId].tsx` | 매칭 완료 시 push → room 진입 |
| 매칭 완료 → 푸시 알림 | push deeplink: `dei://room/<roomId>` | `_layout.tsx` 의 response listener |
| 진입 시 피드 블러 | `(app)/room/[roomId]/index.tsx` | feed 자체는 렌더, 블러 오버레이만 |
| 첫 영상 업로드? | `room/[roomId]/upload.tsx` (분기 표시는 index 내) | "영상 1개 올리기" CTA |
| 블러 유지 / 블러 해제 | `room/[roomId]/index.tsx` 상태 | useBlurGate hook |
| 공유 화면 (분할 피드) | `room/[roomId]/index.tsx` | 2x3 그리드 (D7) |
| 1시간 알림 → 업로드? | push → `room/[roomId]/upload.tsx` deeplink | |
| 최대 3초 영상 게시 | `room/[roomId]/upload.tsx` | record + finalize |
| 블러 재적용 (24h 경과) | `room/[roomId]/index.tsx` 상태 | useBlurGate hook |
| 전체 채팅 (@멘션) | `room/[roomId]/chat.tsx` | |
| 〔멤버 메뉴〕 차단/신고 | `room/[roomId]/members.tsx` → 시트 | 그림 B로 |
| 방 나가기? | `room/[roomId]/leave-confirm.tsx` | |
| 방 활동 유지 (루프) | `room/[roomId]/index.tsx` | |
| 방 이탈, 24h 재매칭 제한 | `(app)/home.tsx` 의 상태 배너 | cooldown 표시 |
| 24h 내 재매칭? | `home.tsx` 분기 | |
| 24h 후 무료 재매칭 | `home.tsx` "재매칭 가능" 상태 | |
| 즉시 재매칭 (BM) | `(app)/booster.tsx` | 결제 sheet |
| 재매칭 큐 복귀 | (자동) → home/solo-join/group | |

## 그림 B (차단/신고) → 화면

| 노드 | 진입 |
|---|---|
| 〔채팅에서 진입〕 | `room/[roomId]/chat.tsx` 또는 `members.tsx` 의 멤버 long-press 시트 |
| 차단 / 신고 메뉴 | `components/room/MemberActionSheet.tsx` (새로) |
| 차단 확인 + "신고도 함께?" | `components/room/BlockConfirmDialog.tsx` (새로) |
| 신고 사유 선택 | `components/room/ReportReasonSheet.tsx` (새로) |
| 결과 (양방향 숨김 / 자동 퇴장) | 자동으로 feed/chat 갱신 |

> 모달이 아닌 별도 라우트 옵션도 있지만, MVP 는 BottomSheet 컴포넌트로 처리 (네비 스택 가벼움).

## 그림 C (재매칭 제외) → 화면 없음

매칭 엔진 내부 로직 (RPC `admin_create_room` 내부에서 처리).
관리자 페이지 (dei-admin) 에서 후보 묶음 검토 시 화면 필요할 수 있으나 본 작업 범위 밖.

---

## 탭 구성 (`(app)/_layout.tsx`)

| 탭 | 라벨 | 진입 화면 |
|---|---|---|
| home | 홈 | `home.tsx` |
| record | 일상 | `record.tsx` (개인 영상 기록 — 방과 무관) |
| profile | 내 프로필 | `my-profile.tsx` |
| settings | 설정 | `settings.tsx` |

> **탭 4개**. 옛 도메인 9탭 중 chat/chat-room/likes/messages/matches/discovery 제거.
> **방 진입은 home 의 카드 클릭 또는 push deeplink** — 탭 아님 (방은 임시적, 7일 후 종료).

---

## 컴포넌트 매핑 (Phase 3 작성 대상)

| 컴포넌트 | 위치 | 기존 자산 참고 |
|---|---|---|
| `RoomFeedGrid` | `components/room/` | 새로 작성 (2x3 grid) |
| `RoomFeedCell` | `components/room/` | VideoWithPoster 재활용 |
| `BlurGateOverlay` | `components/room/` | 새로 작성 |
| `HourlyUploadButton` | `components/room/` | 새로 작성 (`record.tsx` 진입) |
| `RoomChatList` | `components/room/` | `ChatComposer` + `MessageBubble` 재활용 (REUSE 표) |
| `RoomChatComposer` | `components/room/` | `ChatComposer` 변형 |
| `MentionAutocomplete` | `components/room/` | 새로 작성 (`@` 입력 시 멤버 목록) |
| `RoomMemberList` | `components/room/` | 새로 작성 |
| `MemberActionSheet` | `components/room/` | `ChatMoreSheet` 변형 |
| `BlockConfirmDialog` | `components/room/` | `LeaveChatDialog` 변형 |
| `ReportReasonSheet` | `components/room/` | 새로 작성 |
| `LeaveRoomDialog` | `components/room/` | `LeaveChatDialog` 변형 |
| `GroupInviteSearch` | `components/group/` | 새로 작성 |
| `GroupMemberList` | `components/group/` | 새로 작성 |
| `MatchWaitingCard` | `components/home/` | 새로 작성 (큐 대기 상태 카드) |
| `RematchCooldownCard` | `components/home/` | 새로 작성 (24h 대기 + 부스터 CTA) |
| `BoosterPurchaseSheet` | `components/booster/` | `PaidRefreshSheet` 구조 참고 (REUSE 표) |

---

## Hooks 매핑 (Phase 3)

| Hook | 위치 | 책임 |
|---|---|---|
| `useRoom(roomId)` | `hooks/` | 방 메타데이터 + realtime member status |
| `useRoomFeed(roomId)` | `hooks/` | 24h 내 hourly_uploads + realtime + 차단 필터 |
| `useBlurGate(roomId)` | `hooks/` | "내가 24h 내 업로드 있는가" boolean |
| `useRoomChat(roomId)` | `hooks/` | `useChatRoom` 변형 (REUSE), realtime + optimistic + retry |
| `useRoomMembers(roomId)` | `hooks/` | 멤버 목록 + 차단 양방향 필터 |
| `useGroup(groupId)` | `hooks/` | 묶음 멤버 + 가용성 check (다른 방 사용 중?) |
| `useMatchQueue()` | `hooks/` | 본인 큐 상태 + realtime |
| `useRematchCooldown()` | `hooks/` | 24h 제한 잔여 시간 + 부스터 사용 가능 여부 |
| `useBoosterPurchase()` | `hooks/` | RevenueCat purchase + sync-booster-purchase Edge 호출 |
| `useHourlyUpload(roomId)` | `hooks/` | 3초 영상 업로드 (record 결과 → upload_hourly_video RPC) |

---

## 라우팅 deeplink

| Push payload | 화면 |
|---|---|
| `room_matched` + `roomId` | `/room/<roomId>` (분할 피드) |
| `hourly_upload_reminder` + `roomId` | `/room/<roomId>/upload` |
| `chat_mention` + `roomId` + `messageId` | `/room/<roomId>/chat?focusMessage=<messageId>` |
| `room_auto_kicked` + `roomId` | `/home` (방 입장 불가) |
| `rematch_available` | `/home` |
| `booster_offer` | `/booster` |

`apps/mobile/lib/push-notifications.helpers.ts` 의 chat-deeplink 부분을 위 매핑으로 교체.
