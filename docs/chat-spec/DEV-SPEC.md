# 채팅 시스템 개발 명세 (missoula export_spec 권위 소스)

> contexts 76 / transitions 175 / user_flows 43 중 채팅 부분 추출

## 1. 화면·API·게이트 (context)

### CH-API1 · CH-API1 · POST /conversations/:id/messages  `[EXTERNAL_API_ENDPOINT]`
- **endpoint**: `POST /conversations/:id/messages`
- **purpose**: 메시지 전송 API. 서버 측에서 차단/conversation 상태 재검증 후 messages row insert (status=SENT). 200 응답 시 클라이언트 버블 확정, 5xx 시 retry 마커.
  - event `message_persisted` (PRECEDING_EVENT_COMPLETED) — CH-API1 200 응답 → messages row 저장
  - event `message_send_failed` (PRECEDING_EVENT_COMPLETED) — CH-API1 5xx 또는 차단/종료 응답

### CH-API2 · CH-API2 · POST /conversations/:id/leave  `[EXTERNAL_API_ENDPOINT]`
- **endpoint**: `POST /conversations/:id/leave`
- **purpose**: 사용자 나가기 API. 서버: conversation.status=DELETED, messages soft-delete (deleted_at), matches.status=UNMATCHED, 상대에게 conversation.ended 실시간 push.
  - event `leave_processed` (PRECEDING_EVENT_COMPLETED) — CH-API2 처리 완료 → 양쪽 삭제 + UNMATCHED

### CH-RT · CH-RT · 실시간 채널 (WebSocket/SSE)  `[EXTERNAL_API_ENDPOINT]`
- **endpoint**: `WS wss://realtime/chat`
- **purpose**: 메시지 수신 + conversation.ended 신호 수신용 실시간 채널. 미연결 시 앱 진입 시 CH1 로드에서 차이 발견 → 동일 무음 정리.
  - event `conversation_ended_received` (EXTERNAL_SIGNAL_RECEIVED) — 실시간 채널 conversation.ended 수신
  - event `message_received` (EXTERNAL_SIGNAL_RECEIVED) — 실시간 채널 신규 메시지 수신

### CH0 · CH0 · 채팅 진입 라우터 + 차단/상태 게이트  `[INTERNAL_LOGIC_GATE]`
- **purpose**: LK8 / OP3 / H2 탭바 / 푸시 알림 4개 진입점에서 conversation_id 를 해석하고, blocks 테이블 양방향 조회 + conversations.status 판정 후 CH2/토스트/CH1 으로 분기. 모든 채팅 진입의 단일 게이트.
  - event `chat_route_evaluating` (PRECEDING_EVENT_COMPLETED) — CH0 라우터 진입 (4개 진입점 중 하나에서)
  - event `chat_route_resolved` (PRECEDING_EVENT_COMPLETED) — CH0 라우터 분기 판정 완료 (CH2 / 차단토스트 / 종료토스트)
  - event `push_notification_chat_tapped` (EXTERNAL_SIGNAL_RECEIVED) — 푸시 알림 → 채팅방 deeplink

### CH1 · CH1 · 채팅 목록  `[USER_FACING_SCREEN]`
- **purpose**: 홈 탭바 "채팅" 진입 시 매칭된 상대 N명 리스트 표시. updated_at 내림차순 정렬. 항목 tap → CH0 라우터로. 매칭 0건 시 CH3 빈 상태.
  - control `?`  — CH1 목록의 한 행. 상대 닉네임 + 마지막 메시지 미리보기 + updated_at. tap → CH0 라우터.
  - event `chat_list_entered` (SCREEN_ENTERED_OR_LOADED) — CH1 채팅 목록 진입
  - event `chat_list_item_tapped` (USER_INTERACTION_ON_CONTROL) — CH1 목록 항목 tap

### CH2 · CH2 · 채팅방 1:1  `[USER_FACING_SCREEN]`
- **purpose**: 메시지 스트림 + 텍스트 컴포저. AppBar 좌측 상대 닉네임/미니 아바타 (탭→OP3), 우측 더보기(...)→CH4 시트. 메시지 길이 1~500자. 전송 직전 차단 재검증.
  - control `?`  — CH2 AppBar 좌측. tap → OP3 cross-WF 진입 (매칭 후 전체 공개 프로필).
  - control `?`  — CH2 AppBar 우상단. tap → CH4 시트 (나가기/상대 프로필 보기 2개 항목).
  - control `?`  — CH2 하단 컴포저. multiline expand (max 5줄), grapheme cluster 1~500자. 카운터 표시 (490자+ 빨강).
  - control `?`  — CH2 컴포저 우측 전송 버튼. 활성: 1~500자, 비활성: 0자 또는 501+자. tap → B-CH2 전송 직전 재검증 → CH-API1 호출.
  - event `chat_room_entered` (SCREEN_ENTERED_OR_LOADED) — CH2 채팅방 진입 (CH0 라우터 통과 후)
  - event `chat_header_avatar_tapped` (USER_INTERACTION_ON_CONTROL) — CH2 AppBar 상대 아바타/닉네임 tap → OP3
  - event `chat_more_tapped` (USER_INTERACTION_ON_CONTROL) — CH2 AppBar 더보기 tap → CH4 시트
  - event `message_send_submitted` (USER_INTERACTION_ON_CONTROL) — 전송 버튼 tap → 차단/상태 재검증

### CH3 · CH3 · 채팅 목록 빈 상태  `[USER_FACING_SCREEN]`
- **purpose**: 매칭 0건 또는 모든 대화가 양쪽 삭제됨 상태. "아직 매칭이 없어요 — 일상 로그 기록하기" CTA → R3 cross-WF.
  - control `?`  — CH3 빈 상태 메인 CTA. tap → R3 촬영 화면 cross-WF.
  - event `chat_empty_state_entered` (SCREEN_ENTERED_OR_LOADED) — CH3 채팅 목록 빈 상태 진입
  - event `chat_empty_state_record_tapped` (USER_INTERACTION_ON_CONTROL) — CH3 빈 상태 "일상 로그 기록하기" tap → R3

### CH4 · CH4 · 채팅방 더보기 시트  `[USER_FACING_SCREEN]`
- **purpose**: CH2 AppBar 우상단 더보기 탭 시 열리는 바텀 시트. 사용자 결정 #4 타협안: "상대 프로필 보기" + "나가기" 2개 항목. 신고/차단 진입점 없음 (프로필에서만).
  - control `?`  — CH4 시트 1번 항목. tap → OP3 cross-WF (사용자 결정 #4 타협안).
  - control `?`  — CH4 시트 2번 항목 (빨강). tap → CH5 확인 다이얼로그.
  - event `chat_more_sheet_opened` (SCREEN_ENTERED_OR_LOADED) — CH4 더보기 시트 열림
  - event `chat_view_profile_tapped` (USER_INTERACTION_ON_CONTROL) — CH4 "상대 프로필 보기" tap → OP3
  - event `chat_leave_menu_tapped` (USER_INTERACTION_ON_CONTROL) — CH4 "나가기" tap → CH5 다이얼로그

### CH5 · CH5 · 채팅방 나가기 확인 다이얼로그  `[USER_FACING_SCREEN]`
- **purpose**: "대화에서 나가시겠어요? 대화 내용이 영구 삭제되며 되돌릴 수 없습니다." PRIMARY 나가기 (빨강) / SECONDARY 취소.
  - control `?`  — CH5 다이얼로그 확정 버튼 (빨강). tap → CH-API2 호출.
  - control `?`  — CH5 다이얼로그 취소. tap → CH2 유지.
  - event `chat_leave_dialog_shown` (SCREEN_ENTERED_OR_LOADED) — CH5 나가기 확인 다이얼로그 표시
  - event `chat_leave_confirmed` (USER_INTERACTION_ON_CONTROL) — CH5 "나가기" 확정 → CH-API2
  - event `chat_leave_cancelled` (USER_INTERACTION_ON_CONTROL) — CH5 "취소" tap

## 2. 전이 그래프 (transition)

- `message_received`(CH-RT) --[CH2 활성 시 버블 append / 백그라운드면 푸시]--> `(ctx전환)` `CHANGE_LOCAL_UI_STATE`
- `match_chat_open_tapped`(LK8) --[LK8 → CH0 라우터]--> `chat_route_evaluating` `TRIGGER_NEXT_EVENT`
- `chat_route_evaluating`(CH0) --[차단/상태 조회]--> `(ctx전환)` `CALL_EXTERNAL_SERVICE`
- `chat_route_evaluating`(CH0) --[조회 완료 → 판정]--> `chat_route_resolved` `TRIGGER_NEXT_EVENT`
- `chat_list_item_tapped`(CH1) --[B-CH6 무음 정리 — CH2 활성 시 250ms fadeout → H2]--> `(ctx전환)` `CHANGE_LOCAL_UI_STATE`
- `chat_empty_state_record_tapped`(CH3) --[CH3 → R3 촬영 (cross-WF)]--> `(ctx전환)` `CHANGE_LOCAL_UI_STATE`
- `message_persisted`(CH-API1) --[B-CH2 차단/상태 재검증 + POST /messages]--> `(ctx전환)` `CALL_EXTERNAL_SERVICE`
- `message_persisted`(CH-API1) --[200 OK]--> `conversation_ended_received` `TRIGGER_NEXT_EVENT`
- `message_persisted`(CH-API1) --[실패 (네트워크/차단/종료)]--> `message_send_submitted` `TRIGGER_NEXT_EVENT`
- `chat_leave_confirmed`(CH5) --[CH4 → CH5]--> `(ctx전환)` `NAVIGATE_TO_ANOTHER_CONTEXT`
- `chat_leave_cancelled`(CH5) --[POST /conversations/:id/leave]--> `(ctx전환)` `CALL_EXTERNAL_SERVICE`
- `chat_leave_cancelled`(CH5) --[leave 처리 완료]--> `message_send_failed` `TRIGGER_NEXT_EVENT`
- `op3_chat_tapped`(OP3) --[OP3 → CH0 라우터]--> `chat_route_evaluating` `TRIGGER_NEXT_EVENT`
- `message_send_failed`(CH-API1) --[DB 변경]--> `(ctx전환)` `UPDATE_DOMAIN_DATA_FIELD`
- `message_send_failed`(CH-API1) --[상대에게 conversation.ended push]--> `(ctx전환)` `EMIT_DOMAIN_EVENT`
- `message_send_failed`(CH-API1) --[완료 토스트]--> `(ctx전환)` `DISPLAY_MESSAGE_TO_USER`
- `chat_leave_menu_tapped`(CH4) --[CH4 → OP3 (사용자 결정 #4)]--> `(ctx전환)` `NAVIGATE_TO_ANOTHER_CONTEXT`
- `chat_room_entered`(CH2) --[실시간 채널 subscribe]--> `(ctx전환)` `CALL_EXTERNAL_SERVICE`
- `chat_more_tapped`(CH2) --[CH2 → CH4 시트]--> `(ctx전환)` `NAVIGATE_TO_ANOTHER_CONTEXT`
- `push_notification_chat_tapped`(CH0) --[conversation_count > 0]--> `(ctx전환)` `NAVIGATE_TO_ANOTHER_CONTEXT` | cond: conversations 중 status=ACTIVE 가 1건 이상
- `push_notification_chat_tapped`(CH0) --[conversation_count = 0]--> `(ctx전환)` `NAVIGATE_TO_ANOTHER_CONTEXT` | cond: ACTIVE conversation 0건
- `chat_route_resolved`(CH0) --[outcome=ENTERED]--> `(ctx전환)` `NAVIGATE_TO_ANOTHER_CONTEXT` | cond: 차단 없음 AND conversation.status=ACTIVE
- `chat_route_resolved`(CH0) --[outcome=BLOCKED]--> `(ctx전환)` `DISPLAY_MESSAGE_TO_USER` | cond: 차단 존재
- `chat_route_resolved`(CH0) --[outcome=ENDED]--> `(ctx전환)` `DISPLAY_MESSAGE_TO_USER` | cond: conversation.status ∈ {ENDED, DELETED}
- `chat_view_profile_tapped`(CH4) --[CH1 항목 → CH0 라우터]--> `chat_route_evaluating` `TRIGGER_NEXT_EVENT`
- `chat_header_avatar_tapped`(CH2) --[CH2 헤더 → OP3]--> `(ctx전환)` `NAVIGATE_TO_ANOTHER_CONTEXT`
- `conversation_ended_received`(CH-RT) --[messages row + updated_at]--> `(ctx전환)` `UPDATE_DOMAIN_DATA_FIELD`
- `conversation_ended_received`(CH-RT) --[상대에게 메시지 push]--> `(ctx전환)` `EMIT_DOMAIN_EVENT`
- `chat_more_sheet_opened`(CH4) --[CH4 시트 닫고 CH2 유지]--> `(ctx전환)` `CHANGE_LOCAL_UI_STATE`
- `leave_processed`(CH-API2) --[푸시 deeplink → CH0 라우터]--> `chat_route_evaluating` `TRIGGER_NEXT_EVENT`

## 3. 비즈니스 정책

## 4. e2e flow

- **10-A 매칭 직후 채팅 진입 e2e (LK8)** [PLANNED] id=`ac4d2102-853a-43ce-ac71-e69e712b88b0` — 매칭 직후 LK8 '채팅하기' → CH0 라우터 통과 → CH2 진입 → 첫 메시지 전송까지의 핵심 funnel
- **10-B 홈 탭바 → 채팅 목록 → 채팅방** [PLANNED] id=`efeb5a14-7326-42c4-9b89-c8f576b671c6` — 홈 탭바 채팅 진입 후 대화 선택 → 메시지 전송. conversation_count=0 시 CH3 으로 분기.
- **10-C OP3 매칭 후 프로필 → 채팅 진입** [PLANNED] id=`e6110b3e-4b17-4360-b997-5256127135aa` — 매칭 후 상대 프로필에서 채팅 진입. CH0 통합 라우터 검증 확인.
- **10-D 푸시 알림 → 채팅방 직진입** [PLANNED] id=`194792a1-ffc3-4e76-aa48-f10aada99100` — 앱 외부에서 알림 tap → deeplink. 만료/차단 시 라우터에서 흡수.
- **10-E 메시지 전송 e2e (성공 + 실패 retry)** [PLANNED] id=`294d0001-8c15-4913-b64a-4726c9240872` — 전송 직전 B-CH2 차단/상태 재검증 게이트. fail 시 인라인 retry.
- **10-F 채팅방 나가기 e2e (양쪽 영구 삭제)** [PLANNED] id=`1ea78bda-cd64-4928-a258-604eb63139f0` — 더보기 → 나가기 → 확인 → CH-API2 → 양쪽 삭제. B-CH5 적용.
- **10-G 채팅방 → 상대 프로필 보기 (신고/차단 진입)** [PLANNED] id=`b9f14b85-1225-471b-96c6-a0a563b5fcdc` — 사용자 결정 #4 타협 경로. CH2 → CH4 → "상대 프로필 보기" → OP3 (또는 헤더 아바타 직진입 alt).
- **10-H 상대 나감 수신 무음 정리** [PLANNED] id=`684555c9-460a-4209-822a-b1217c8cb0ae` — B-CH6 — conversation.ended 수신 시 토스트 0, 250ms 페이드아웃, 자동 H2 복귀. 성공 종료 개념 없음 (시스템 효과만).
- **10-I 채팅 빈 상태 → 로그 촬영 회복** [PLANNED] id=`e8f07eeb-776a-4d32-bfe8-5bf0fd26aaed` — 매칭 0건 콜드스타트 → 일상 로그 기록하기 CTA → R3 cross-WF.