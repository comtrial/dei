Inventory complete. Here is the read-only reference assessment of the `origin/dei-ver2` rooms domain (UI/design components excluded per instruction).

---

## Rooms 도메인 인벤토리 (origin/dei-ver2) — 참고가치 평가 + S01~S23 매핑

### (a) Migrations — supabase/migrations/

| 자산 | 참고가치 | 내용 / S 매핑 |
|---|---|---|
| `20260526000010_rooms_v1_baseline.sql` (927줄) | **HIGH** | 11개 테이블(rooms, groups, group_members, match_queue, room_members, hourly_uploads, chat_messages, chat_mentions, reports, room_auto_kicks, room_leave_cooldowns) + 10개 RLS SELECT 정책 + 10개 RPC(`create_group`, `disband_group`, `enqueue_group_for_match`, `admin_create_room`, `upload_hourly_video`, `send_chat_message`, `block_user`, `report_user`, `leave_room`) 전부 한 파일. **DB 스키마/RLS/RPC 설계의 단일 최강 참고처.** → S(DB 베이스라인)·S(RLS)·S(RPC) 계열에 직결. |
| `block_user` RPC의 auto-kick 임계식 | **HIGH** | `v_threshold := ceil((active_member_count-1)/2)`, `block_count >= threshold` → `room_members.status='auto_kicked'` + `room_auto_kicks` insert + `active_member_count` 동기화. D9 정책의 **정확한 SQL 구현**. → A-6 정책모듈 + 차단 S 매핑. |
| `20260526000020_booster_grants.sql` (123줄) | **MED** | `booster_grants` 테이블 + `consume_booster_grant`/`grant_free_booster_for_female` RPC. BM 분리(D1·D11). → 부스터 S. |
| `20260526000030_storage_buckets_room_uploads.sql` (93줄) | **MED** | `room-uploads`/`room-thumbnails` 버킷 + storage RLS(같은 방 active member + 차단 양방향 + 블러게이트). → 영상 업로드 S. |
| `20260526001000_create_group_allow_solo.sql` (64줄) | **MED** | `create_group`이 size=1(혼자 참여) 허용하도록 변형. solo-join flow의 미묘한 케이스. → 묶음/솔로 S. |
| `migrations_legacy/pre_rooms_pivot_20260525/*` | **LOW** | 폐기된 큐레이션·좋아요·1:1채팅. zero-base이므로 무관. 인벤토리 제외 권장. |

### (b) Edge Functions — supabase/functions/

| 자산 | 참고가치 | 내용 / S 매핑 |
|---|---|---|
| `room-send-message`(101), `room-upload-video`(119), `room-block-user`(77), `room-report-user`(99), `room-leave`(58) | **HIGH** | 전부 thin wrapper — auth 추출 후 동명 RPC `.rpc(...)` 위임. **클라가 타는 `functions.invoke` 경로 = 앱 동일 경로(CLAUDE.md 규칙 9)의 레퍼런스 구현.** → 각 기능 S의 Edge 계층. |
| `groups-create`(79), `match-admin-create-room`(90) | **HIGH** | `create_group`/`admin_create_room` 위임. 운영진 service_role 편성 경로. → 묶음/매칭 S. |
| `booster-purchase-sync`(89), `booster-consume`(44), `booster-grant-free-female`(49) | **MED** | RevenueCat 영수증 동기화(RPC 미사용, 직접 검증) + 소비/무료지급. → 부스터 S. |
| `expire-rooms`(124) | **MED** | cron: 7일 만료 방 ended + 영상 archive(D6). → 방 수명/cron S. |

### (c) Hooks / lib 순수함수 — apps/mobile/

| 자산 | 참고가치 | 내용 / S 매핑 |
|---|---|---|
| `lib/rooms/blur-gate.ts` (+테스트) | **HIGH** | 순수함수 `evaluateBlurGate`(open/never-uploaded/expired), `shouldWarnBlurReapply`(23~24h), `blurGateRemainingMs`. 24h window 상수. **DB RLS와 동일 규칙의 클라 평가** — 블러게이트 정책 SSOT 후보. → A-6 정책모듈 + 블러 S. |
| `lib/rooms/mention-parser.ts` (+테스트) | **HIGH** | `@([A-Za-z0-9가-힣_]{2,30})` 정규식(서버 RPC와 동일), `parseMentions`/`segmentBody`/`extractActiveMentionPrefix`(자동완성). → 채팅 멘션 S. |
| `lib/rooms/rooms-service.ts` | **HIGH** | 전 함수 `functions.invoke` 경로 강제(직접 RPC 금지 주석 명시) + `fetchMyActiveRoom`만 select. 서비스 레이어 계약 패턴. → 서비스 레이어 S. |
| `lib/rooms/types.ts` | **MED** | Row 타입 ↔ View 타입(RoomSummary, FeedCell, ChatBubble 등) 분리 alias. → 타입 S. |
| `lib/group/groups-service.ts`, `lib/booster/booster-service.ts` | **MED** | invoke 경로 + `searchProfileByNickname`, `fetchMyCooldown`, `fetchAvailableBoosterCount`. `disband_group`만 직접 rpc. → 묶음/부스터 S. |
| `hooks/useRoom·useRoomChat·useRoomFeed·useRoomMembers` | **MED** | 공통 패턴: select + realtime channel(`room-*-${Date.now()}`) subscribe + cleanup(unsubscribe+removeChannel). useRoomChat은 optimistic+dedupe+retry. **realtime 구독 보일러플레이트 참고.** → 방 realtime S 계열. |
| `hooks/useGroup`(useMyForming 포함), `useBoosterPurchase` | **MED** | 가용성 체크, RevenueCat 결제 결과코드(unavailable/cancelled/rc-error/sync-error/consume-error) 분기. → 묶음/부스터 hook S. |

### (d) docs/rooms-spec/

| 자산 | 참고가치 | 내용 / S 매핑 |
|---|---|---|
| `decisions.md` (D1~D11) | **HIGH** | PRD 미정 11개 기본값 — 무료커뮤니티+결제분리(D1), 큐적재+수동편성(D2), quiet hours 0~7 KST(D3), 가입자 닉네임 초대(D4), 성별 반대 강제(D5), 방 7일(D6), 2×3 그리드(D7), 영상 30일(D8), auto-kick ceil((n-1)/2)(D9), 신고 6카테고리(D10), 부스터(D11). **A-6 정책모듈과 직접 겹침 — 정책 SSOT의 입력.** |
| `db-design.md` | **HIGH** | ERD + 테이블 CREATE 의도 + RLS 정책 + RPC 목록표 + storage 버킷. baseline SQL의 산문 명세. → DB 설계 S. |
| `edge-functions.md` | **HIGH** | NEW/KEEP-TWEAK/REMOVE 매핑 + cron 스케줄 + **배포 산출물 체크리스트(CLAUDE.md 규칙 8)**. → Edge/배포 S. |
| `testing.md` | **HIGH** | R0~R12 스펙→계층 매핑, rooms-verify 6단계 게이트, 실DB e2e 시나리오(realdb-r-*), testID 규약, multiUserSession 패턴. → 테스트/게이트 S 계열. |
| `screens.md` | **MED** | expo-router 트리 + 그림A/B/C→화면 매핑 + push deeplink 표. 구조 참고만(UI 컴포넌트 매핑 표는 디자인 영역이라 참고 제외). → 라우팅/화면구조 S. |
| `README.md` | **LOW** | Phase 개요 + 원본 PRD 위치(`.local/`, 미커밋). 맥락만. |

### CI
`/.github/workflows/rooms-verify.yml` — **MED**. `lint→typecheck→unit→component→integration(실 Supabase)→e2e-web` 직렬 needs 체인 + 집계 `rooms-verify` gate. chat-verify.yml 패턴 그대로. → 검증 게이트 S.

---

### 종합 권고
- **HIGH 핵심 4종**(baseline SQL, decisions.md, db-design.md, blur-gate.ts/mention-parser.ts 순수함수)이 zero-base 재작성 시 설계 정합성을 가장 크게 끌어올림 — 특히 **D9 auto-kick 임계식**과 **블러게이트 24h 규칙**은 SQL/클라 양쪽에 중복 존재하므로 A-6 정책모듈에서 SSOT로 통합할 후보.
- Edge Function은 전부 thin RPC wrapper 패턴이라 **로직보다 "앱 동일 invoke 경로" 계약**이 참고가치(CLAUDE.md 규칙 9 충족 근거).
- `migrations_legacy/*`와 모든 UI/컴포넌트 자산은 인벤토리 제외.

핵심 참고 파일 절대경로(git show로 열람):
- `supabase/migrations/20260526000010_rooms_v1_baseline.sql`
- `docs/rooms-spec/{decisions,db-design,edge-functions,testing,screens}.md`
- `apps/mobile/lib/rooms/{blur-gate,mention-parser,rooms-service,types}.ts`
- `supabase/functions/room-{send-message,upload-video,block-user,report-user,leave}/index.ts`
- `supabase/functions/{groups-create,match-admin-create-room}/index.ts`
- `apps/mobile/hooks/{useRoom,useRoomChat,useRoomFeed,useRoomMembers,useGroup,useBoosterPurchase}.ts`