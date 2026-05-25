# Rooms-Pivot Edge Functions (Phase 0.6)

> Supabase Edge Functions 의 새/보존/폐기 매핑.
> CLAUDE.md 의 규칙 8 (백엔드 완료 = 마이그레이션 + Edge Function 배포 + 앱 경로 e2e) 을 그대로 따른다.

---

## 새로 작성 (NEW)

| 함수 | 역할 | RPC 위임 | 호출자 |
|---|---|---|---|
| `groups-create` | 닉네임 배열로 묶음 생성 (D4 가용자 검증) | `create_group` | 클라 |
| `match-enqueue` | 묶음을 매칭 큐에 적재 (모든 멤버 다른 방 사용 중 아닌지 D4 체크) | `enqueue_group_for_match` | 클라 |
| `match-admin-create-room` | (운영진용) 후보 묶음들로 방 편성. service_role 키 필수 | `admin_create_room` | 운영진 / cron |
| `room-upload-video` | 3초 영상 업로드 → finalize → hourly_uploads insert | `upload_hourly_video` | 클라 |
| `room-send-message` | 채팅 메시지 + @멘션 파싱 + push 트리거 | `send_chat_message` | 클라 |
| `room-block-user` | 차단 + (방 컨텍스트면) 자동 퇴장 임계값 체크 | `block_user` | 클라 |
| `room-report-user` | 신고 적재 + Slack 알림 (운영진) | `report_user` + `_shared/slack.ts` | 클라 |
| `room-leave` | 방 이탈 + cooldown set + (전원 이탈 시 방 종료) | `leave_room` | 클라 |
| `booster-purchase-sync` | RevenueCat 영수증 동기화 → booster_grants insert | `sync-refresh-purchase` 패턴 복제 | 클라 |
| `booster-consume` | 부스터 1개 소비 + cooldown 삭제 | `consume_booster_grant` | 클라 |
| `booster-grant-free-female` | 여성 사용자 무료 부스터 자동 생성 | `grant_free_booster_for_female` | cron 또는 클라 |
| `notify-hourly-upload` | 매시간 (KST) 활성 방 멤버에게 업로드 알림 (quiet hours 적용) | n/a | cron |
| `notify-blur-gate-remind` | 첫 진입 30~60분 미업로드 시 리마인드 | n/a | cron 또는 trigger |
| `notify-blur-gate-reapply` | 본인 마지막 업로드 24h 경과 시 경고 | n/a | cron |
| `notify-rematch-available` | 이탈 후 24h 경과 시 알림 | n/a | cron |
| `expire-rooms` | 7일 만료 방 ended 처리 + 영상 archive | n/a | cron |
| `purge-expired-uploads` | 30일 경과 영상 hard delete | n/a | cron |

> **운영진 도구로서의 `match-admin-create-room`**: 별도 admin UI 없이도 SQL/Supabase
> Studio 에서 호출 가능하도록 RPC 우선 + Edge Function 으로 wrap.

---

## 보존 + 변형 (KEEP with TWEAK)

| 함수 | 변경 사항 |
|---|---|
| `_shared/push.ts` | `chatPushRoute()` 헬퍼 제거. 새로 `roomPushRoute()` 추가 (deeplink: `dei://room/<id>/...`). quiet hours 체크 (D3) 적용. |
| `_shared/auth.ts` | 변경 없음 |
| `_shared/cors.ts`, `hash.ts`, `time.ts`, `analytics.ts`, `revenuecat.ts` | 변경 없음 |
| `start-identity-verification` / `confirm-identity-verification` | 변경 없음 (본인인증) |
| `finalize-log` | 변경 없음. 단, 이건 본인 프로필 일상 영상용. **방 영상은 별도 `room-upload-video`** 가 처리. |
| `notify-video-review` | 변경 없음. 새 도메인 영상은 `reports` 경로로 우회 가능. |
| `record-profile-view` | 변경 없음. 단, 향후 방 멤버 프로필 조회 시 호출 |
| `revenuecat-webhook` | 부스터 product id 추가 (`booster_instant_rematch_v1`) — 환불 시 booster_grants 무효화 |
| `sync-refresh-purchase` | **새 함수 `booster-purchase-sync` 로 분리**. 기존은 (옛 도메인 사라지므로) 사실상 사용 안 됨 — 제거 후보. |
| `send-push-notification` | 변경 없음 (범용) |
| `send-log-reminders` | 변경 없음 (개인 일상 로그 리마인더 — 방과 무관) |

---

## 폐기 (REMOVE)

| 함수 | 사유 |
|---|---|
| `get-curation-feed` | 큐레이션 도메인 폐기 |
| `send-like` | 좋아요 도메인 폐기 |
| `accept-like` | 좋아요 도메인 폐기 |
| `send-message` | 1:1 채팅 (`room-send-message` 로 대체) |
| `leave-conversation` | 1:1 채팅 (`room-leave` 로 대체) |
| `send-curation-ready` | "09시 큐레이션" 콘셉트 폐기 (`notify-hourly-upload` 등 새 알림으로 의미 이동) |

---

## CI / Cron 워크플로

### 기존 `.github/workflows/push-notification-schedules.yml` 변경

```yaml
# Before
schedule:
  - cron: '0 0,4,8,12,16,20 * * *'   # 4시간마다 send-log-reminders
  - cron: '0 0 * * *'                 # 09:00 KST send-curation-ready

# After
schedule:
  - cron: '0 0,4,8,12,16,20 * * *'   # 4시간마다 send-log-reminders (KEEP)
  - cron: '0 * * * *'                 # 매시간 notify-hourly-upload (NEW, quiet hours 함수 내부 처리)
  - cron: '*/15 * * * *'              # 15분마다 notify-blur-gate-remind/reapply (NEW)
  - cron: '0 * * * *'                 # 매시간 expire-rooms (NEW)
  - cron: '0 4 * * *'                 # 매일 새벽 4시 purge-expired-uploads (NEW)
```

(실제 yml 은 Phase 2 에서 정확히 작성)

---

## 배포 산출물 체크리스트 (CLAUDE.md 규칙 8)

Phase 5 (Remote 배포) 시 다음을 모두 확인:

- [ ] 모든 마이그레이션 `supabase db push` 성공
- [ ] `supabase functions list` 에 새 함수 전부 표시
- [ ] 폐기된 함수 (`get-curation-feed`, `send-message`, `leave-conversation` 등) 원격에서도 삭제
- [ ] `_shared/*` 의 변경이 모든 함수에 반영 (이건 함수별 deploy 시 자동 번들)
- [ ] Edge Function 환경변수 (PORTONE_*, REVENUECAT_*, PHONE_HASH_SALT, SLACK_WEBHOOK_URL 등) 원격에 설정
- [ ] 클라가 의존하는 `EXPO_PUBLIC_*` 가 빌드 시점에 올바른 supabase URL 가리킴
- [ ] 새 product id (`booster_instant_rematch_v1`) RevenueCat 콘솔에서 생성
- [ ] 본인 인증 JWT 가 ES256/JWKS 호환 (CLAUDE.md 규칙 9 ③)
- [ ] 실DB e2e 가 `supabase.functions.invoke()` 경로로 핵심 flow 통과 (RPC 직접 호출 X)
