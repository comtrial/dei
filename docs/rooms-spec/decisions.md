# Rooms-Pivot 결정사항 (Phase 0.3)

> PRD v0.6 에 "미정" 또는 명시되지 않은 항목에 대한 **합리적 기본값 결정**.
> 본 결정은 코드 작업의 전제로 사용된다. 팀 검토 후 변경 필요 시
> 이 파일을 갱신하고 영향 받는 모듈을 다시 평가한다.

결정자: rooms-pivot 작업 에이전트
근거: PRD v0.6 + userflow v0.6 + dei 모노레포 기존 인프라

---

## D1. 법적 구조

| 항목 | 결정 |
|---|---|
| 운영 모델 | **"무료 커뮤니티"** 를 코드의 기본 전제로. 결제 모듈은 분리 가능하게 설계 (Provider 패턴). |
| 19세 게이트 | 본인인증(PortOne) 통과 시 `profiles.is_adult = true` 만 통과 |
| 결혼중개업 신고 | 코드 변경 없음. 정식 운영 결정 시 약관·결제 UI 만 추가 |

**영향:** 부스터 결제는 코드상 존재하지만 feature flag 로 disable 가능하게.

---

## D2. 매칭 자동화 수준

| 항목 | 결정 |
|---|---|
| MVP | **"큐 적재 + 운영진 수동 편성"** |
| 자동화 | v0.7+ 에서 도입 |
| 관리자 페이지 | **본 작업 범위 밖** (`dei-admin` repo 가 별도 존재 추정 — Phase 0.5 에서 확인) |

**구현:** `match_queue` 테이블에 대기 항목 적재 → 운영진이 SQL/관리툴로
`rooms` 생성 → `room_members` 에 큐 항목 매핑. RPC `admin_create_room()` 으로
원자성 보장.

---

## D3. 새벽 알림 정책

| 항목 | 결정 |
|---|---|
| 발송 제외 시간 | **0:00–7:00 KST 고정** |
| 사용자 설정 | `profiles.quiet_hours_start/end` 컬럼 미리 박아두지만 MVP 에서는 UI 없음 (default 0~7) |
| 적용 범위 | "시간별 업로드 알림", "블러 리마인드" 등 정기 알림 8종 모두 |
| 예외 | "방 매칭 완료", "@멘션 귓속말" 같은 사용자 액션 직접 트리거 알림은 시간 무관 발송 |

**구현:** `_shared/push.ts` 의 `sendPushToUser` 가 발송 전 KST 시각 + `profiles.quiet_hours` 체크.

---

## D4. 닉네임 초대의 의미

| 항목 | 결정 |
|---|---|
| 초대 대상 | **(a) 이미 가입된 유저만** |
| 식별자 | `profiles.nickname` (unique) — 시스템 내부 식별자로 격상 |
| 미가입 친구 초대 | MVP 제외 (추후 SMS 초대 링크로 추가 가능) |

**근거:** PRD "수락 절차 없음" + "다른 방 사용 중 체크" 는 (a) 전제에서만 무결.

**구현:** `groups` 생성 시 클라가 nickname 으로 검색 → uuid 변환 → server-side `groups_create_rpc` 가 nickname unique 검증 + nickname → user_id 재확인.

---

## D5. 매칭 조건

| 항목 | 결정 |
|---|---|
| 강제 조건 | **성별 반대 묶음 매칭** (남자 그룹 ↔ 여자 그룹) |
| 후순위 조건 | 연령대 (±3살 권장), 지역(시/도)은 일단 무시 |
| 큐 적재 시 | `match_queue.required_gender` 자동 계산 (= 반대 성별) |

**구현:** `match_queue` 에 `submitter_gender`, `desired_opponent_gender` 컬럼.
운영진 편성 시 `desired_opponent_gender` 일치만 후보.

---

## D6. 방 수명

| 항목 | 결정 |
|---|---|
| 자동 종료 | **방 생성 후 7일** |
| 멤버 전원 이탈 시 | 즉시 종료 |
| 종료 후 데이터 | `rooms.status = 'ended'` (soft) — 30일 후 cron 으로 hard 삭제 |
| 영상 (D8 참조) | 방 종료 시 즉시 archive (열람 차단), 30일 후 storage hard 삭제 |

**구현:** `rooms.expires_at = created_at + INTERVAL '7 days'`.
cron Edge Function `expire-rooms` 가 1시간마다 실행.

---

## D7. 분할 피드 UX

| 항목 | 결정 |
|---|---|
| 그리드 | **2 × 3 = 최대 6명** |
| 6명 초과 시 | 세로 스크롤 (페이지 단위 6명) |
| 본인 셀 | 좌상단 고정, 본인 영상은 항상 mute play |
| 차단된 멤버 셀 | 빈 셀로 비움 (= "회색 placeholder + ⊘") |
| 자동 퇴장된 멤버 | 동일하게 비움 + "퇴장됨" 라벨 |

**구현:** `app/(app)/room/[roomId]/feed.tsx` (Phase 3).

---

## D8. 영상 보존 정책

| 항목 | 결정 |
|---|---|
| 방 활성 중 | 24시간 sliding window 내 영상만 공개 (블러 게이트 정책) |
| 방 종료 후 | 30일 보관 (분쟁 대응) → 30일 경과 시 hard delete |
| 사용자 본인 영상 | 본인 프로필에서는 30일 후에도 열람 가능 (옵션, v0.7+) |
| 신고된 영상 | 신고 처리 완료까지 hard delete 보류 |
| GDPR/개보법 | "계정 삭제 요청" 시 24시간 내 모든 영상 hard delete |

**구현:** `hourly_uploads.archived_at`, `hourly_uploads.expires_at`. cron `purge-expired-uploads`.

---

## D9. 자동 퇴장 임계값

| 항목 | 결정 |
|---|---|
| 임계값 | **방 전체 인원 (본인 제외) 의 절반 이상** |
| 예시 | 6인 방에서 본인 X가 차단/신고 대상일 때, X 제외 5명 중 3명 이상 (= ceil(5/2)=3) |
| 임계 도달 즉시 | X 자동 퇴장 (`room_members.status = 'auto_kicked'`) + push 알림 |
| 계정 정지 | 자동 없음 — 운영팀 검토 큐 (`reports` 적재) |

**구현:** `block_user_in_room_rpc` 가 트랜잭션 내에서 차단 + 임계값 체크 + 자동 퇴장 처리.

---

## D10. 신고 카테고리

| 코드 | 라벨 |
|---|---|
| `verbal_abuse` | 욕설/비방 |
| `spam` | 스팸/광고 |
| `fake_profile` | 허위 프로필 (사진/정보 부정확) |
| `inappropriate_video` | 부적절한 영상 (음란/혐오/폭력) |
| `harassment` | 괴롭힘/스토킹 |
| `other` | 기타 (자유 입력 필수) |

**구현:** `reports.reason_code TEXT CHECK`, `reports.reason_detail TEXT NULLABLE`.

---

## D11. 부스터 가격 / 결제

| 항목 | 결정 |
|---|---|
| Product ID | `booster_instant_rematch_v1` (남성용 — 24h 재매칭 제한 해제 1회) |
| 가격 | RevenueCat 콘솔에서 설정 (코드 하드코딩 금지) |
| 여성 | 무료 — `booster_grants` 자동 생성 RPC (`grant_free_booster_for_female`) |
| 영수증 검증 | 기존 `sync-refresh-purchase` Edge Function 변형 활용 (`sync-booster-purchase`) |
| Webhook | 기존 `revenuecat-webhook` 그대로 (이벤트 처리만 추가) |

**구현:** Phase 2 에서 `booster_grants` 테이블 + `consume_booster_grant` RPC.

---

## 결정에서 명시적으로 미루는 항목

| 항목 | 사유 | 처리 |
|---|---|---|
| 자동 매칭 엔진 | MVP 범위 밖 | `match_queue` 만 적재. v0.7+ |
| 영상 자동 모더레이션 | MVP 범위 밖 | 사람 검토 경로(`reports` + Slack) 만 |
| 묶음 매칭 동성 그룹 허용 | PRD 미명시 | 일단 성별 반대 강제. v0.7+ 검토 |
| 멤버 8명+ 방 | 묶음 유연 편성으로 가능하나 UX 미정 | UI 는 6명 기준 + 페이지네이션 |
| 영상 이모지/댓글 반응 | PRD 명시적 제외 | v0.7+ |
| 프로필 상세 페이지 | PRD 명시적 제외 | 최소 정보만 (기존 `(onboarding)/profile.tsx` 재활용) |
| 점수 차감식 패널티 | PRD 명시적 제외 | 블러 게이트 단일 메커니즘 |
