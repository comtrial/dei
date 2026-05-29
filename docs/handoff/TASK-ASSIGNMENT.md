# dei 담당자별 태스크 분배서 (release/dei-ver2)

> **이 문서 = "누가 무엇을 어떤 순서로"** 의 단일 기준. 아키텍처 배경은
> `docs/handoff/README.md`, 검증 결과·완료 정의는 `docs/handoff/FINAL-REPORT.md`,
> 화면별 상세는 `docs/handoff/screens/S*.md` + 각 화면 파일 헤더 주석을 본다.
>
> **현재 상태:** 토대·DS(@dei/ui 37컴포넌트)·스키마(원격 21테이블)·아키텍처 골격·
> 빈 화면 30개 스캐폴딩 완료. 화면은 전부 "핸드오프: {owner} 구현 예정" placeholder.
> **여러분의 일 = 각 화면을 실제 동작으로 채우는 것.**

---

## 0. 시작 전 모두 공통 (읽고 → 환경)

1. `docs/handoff/README.md` 1회 정독 (특히 §4 DS 강제, §5 스키마, §7 공통 골격).
2. 환경: `pnpm install` → `apps/mobile/.env` 실값 채우기(`SECRETS.md` 참조, A에게 안전채널로 요청).
3. **화면 작업 루프(반드시):**
   - `docs/handoff/screens/S{NN}.md` + 화면 파일 헤더(담당자/의존DS/데이터/이벤트/서버L1/정책L2) 읽기
   - 헤더의 "의존 DS 컴포넌트" 를 `@dei/ui` 에서 import (전부 이미 존재)
   - 데이터 = `@dei/api` supabase client + `import type { Database } from '@dei/api'`
   - 이벤트 = `apps/mobile/lib/analytics-taxonomy.ts` 상수 (raw 문자열 금지)
   - 완료 전: `pnpm -F mobile exec tsc --noEmit` + `pnpm ds-enforce` 통과 확인
4. **절대 규칙(어기면 CI `verify` 게이트가 머지 차단):**
   - raw 스타일 0 — inline `style={{}}`, raw hex(`#fff`), `StyleSheet.create` 전부 금지. NativeWind className 토큰만.
   - DS 에 없는 시각요소 발견 시 직접 스타일링 ❌ → **A에게 `@dei/ui` 추가 요청** (전수 추출로 0이어야 정상).
   - 에러 로깅은 `@dei/shared` `logger` 만 (`@sentry/react-native` 직접 import 금지).
   - 스키마 🔴 충돌 테이블(`profile`/`room`/`room_member`/`message`/`group_match`) 변경은 **A 승인 필수**.

---

## 🟦 B (변경규) — 온보딩·매칭·결제·설정·신고 (22화면)

### 선행 (이게 풀려야 화면들이 산다)
- [ ] **B-0a. PortOne 본인인증 실연동** — `lib/portone.stub.ts` 의 `startIdentityVerification` 구현
      (현재 throw). 결과(실명·생년월일·성별·CI)는 서버 콜백 검증 → `auth_verification` 기록.
      `auth-provider.promoteWithIdentity`(익명→검증 승격) 도 함께. → **S03 의 전제.**
- [ ] **B-0b. splash 5분기 부트스트랩** — `app/index.tsx` 의 `TODO(B)`: 프로필 완성/큐 등록/방 존재를
      1회 조회해 비로그인/프로필미완성/매칭전/매칭중/방있음 분기 완성.
- [ ] **B-0c. 결제(부스터)** — `lib/portone.stub.ts` `purchaseInstantRematch`. 가격 하드코딩 금지
      (스토어/RevenueCat 콘솔). 정책 = `POLICY.payment` (`@dei/shared`). HEART env 드리프트 정리(`SECRETS.md §2`).

### 화면 (그룹 순 권장)

**가입 흐름 (auth/onboarding)**
- [ ] S02 약관+19+ `(auth)/terms` — 동의기록 저장, 약관버전 재동의. 이벤트 `terms_agreement_screen_entered`
- [ ] S03 본인인증 `(auth)/verify` — B-0a 의존. CI중복/연속실패5회24h잠금/19세미만 분기
- [ ] S03f 본인인증 실패 `(auth)/verify-failed` — 다시시도→S03 / 취소→S02
- [ ] S04 프로필 1/3 `(onboarding)/profile/step1` — 닉네임 unique·blocklist(0.5s debounce), 성별·생년월일 lock(본인인증 자동)
- [ ] S04b 프로필 2/3 `step2` — 사진 1장 필수(현장 카메라만, C의 S11 카메라 모듈 연동), 자기소개 60자
- [ ] S04c 프로필 3/3 `step3` — MBTI·지역(선택), 가입완료 트랜잭션→S05

**홈·매칭 (🔴 `profile`/`match_queue`/`team` 읽기)**
- [ ] S05 홈 `(app)/home` — EntryCard 2개(혼자/친구 동등), 24h 재매칭 제한 배너+카운트다운. 이벤트 4종
- [ ] S06 친구초대 `(app)/team/new` — 닉네임 검색·추가(최대 5명), busy 멤버, 차단관계. `POLICY.team`
- [ ] S07a 알림권한 `(app)/permission/notification` — `@dei/ui` PermissionGate + `lib/permissions.ts`(notification은 stub)
- [ ] S07 큐 대기 `(app)/queue` — PulseRing, "앱 닫아도 알림". 큐 만료 24h(`POLICY.matching`)
- [ ] S08 매칭취소 confirm `(app)/match/cancel-confirm` — BottomSheet, 묶음 취소 시 멤버 전원 푸시
- [ ] S09 매칭실패/만료 `(app)/match/failed`

**안전·결제·설정·신고**
- [ ] S15 차단·신고 시트 `(app)/report/block-report` — BottomSheet. auto-kick `POLICY.autoKick.thresholdFor`
- [ ] S16 방 나가기 모달 `(app)/room/[roomId]/leave-confirm` — ⚠️ 방 도메인이라 **A(채팅)·C(방)와 경계 협의**
- [ ] S17 바로매치 결제 `(app)/booster` — B-0c 의존. 여성 무료/남성 결제(`POLICY.payment`)
- [ ] S18 결제 실패 `(app)/booster-failed`
- [ ] S19 프로필 수정 허브 `(app)/my-profile` — 닉네임 변경 30일 1회(`POLICY.identity`)
- [ ] S20 회원탈퇴 `(app)/settings/withdraw` — 영상 24h 내 hard delete(`POLICY.video`)
- [ ] S21 신고 카테고리 `(app)/report/[targetId]` — `REPORT_CATEGORIES` 6종(`@dei/shared`), other 자유입력
- [ ] S22 알림 설정 `(app)/settings/notifications` — `notification_setting` 테이블. 새벽 0~7 KST(`POLICY.notifications`)
- [ ] S23 고객센터 `(app)/support`

> S01 splash 화면 자체는 Phase 5 에서 골격 완성 — B 는 B-0b(부트스트랩 조회)만 채우면 됨.

---

## 🟩 C (손승태) — 영상·방 (8화면)

### 선행
- [ ] **C-0. 영상 모듈** — `lib/video.stub.ts` 3함수 구현(현재 throw): `recordClip`(3초, 현장 카메라만,
      갤러리 금지) / `uploadClip`(storage + `video`/`upload` 행) / `isClipVisible`(블러게이트 24h sliding window,
      `POLICY.blurGate`). `expo-camera`·`expo-image-picker` 설치돼 있음.
- [ ] **C-0b. 방 realtime/presence** — `lib/realtime.ts` 의 `roomChannel`(=`room:{roomId}`) 위에 presence
      (누가 방에 있나)·영상 신호 구현. 채널 네이밍은 반드시 헬퍼 경유(A와 동일 채널 공유).

### 화면
- [ ] S10 blur 미리보기 `(app)/room/[roomId]/preview` — 매칭 후 첫 진입, 블러 오버레이
- [ ] S11a 카메라 권한 `(app)/permission/camera` — `@dei/ui` PermissionGate + `lib/permissions.ts`(camera는 실동작)
- [ ] S11 3초 촬영 `(app)/room/[roomId]/upload` — C-0 의존. S04b(프로필 사진)도 이 카메라 모듈 재사용
- [ ] S11b 촬영 미리보기 `(app)/room/[roomId]/upload-preview` — FullscreenVideo 루프, 재촬영/올리기
- [ ] S12 촬영 실패 `(app)/room/[roomId]/capture-failed`
- [ ] **S13 일상 공유 방 (8셀 ★시그니처) `(app)/room/[roomId]/index`** — `@dei/ui` GridRoom.
      🔴 `room`/`room_member` 읽기 — RLS `room_is_member` 게이트 전제(A가 고정). 차단/퇴장 멤버 셀 비움
- [ ] S13b 영상 풀스크린 `(app)/room/[roomId]/video/[videoId]` — `@dei/ui` FullscreenVideo
- [ ] S14 멤버 프로필 `(app)/room/[roomId]/members` — `@dei/ui` ProfileHero

### C 가 알아야 할 경계
- 방 내부 **채팅(S13a)은 A 담당.** 같은 방 화면이지만 메시지 송수신은 A.
- 방 나가기(S16)는 B(UX) — 방 상태 전이는 C·A와 협의.
- e2e: `apps/mobile/e2e/` 옛 채팅 하네스는 **참고용**(현재 컴파일 안 됨). 방/영상 화면 e2e 는
  이 하네스 패턴(testID 규칙·경계 모킹)으로 새로 짜고, 완성되면 `verify.yml` 에 e2e-web 잡 추가.

---

## 🟥 A (최승원) — 방 내부 채팅 + 공통 유지 (1화면 + 플랫폼)

- [ ] **S13a 방 내부 채팅 `(app)/room/[roomId]/chat`** — `@dei/ui` ChatBubble/InputBar.
      🔴 `message`(+`message_mention`) — `room_is_member` RLS, 1..N자. **@멘션 귓속말**(`whisper_to_user_id`)
      경로 포함. `lib/realtime.ts` `subscribeRoomMessages` 로 수신. **DM(1:1)은 이번 범위 밖**(별도 화면).
- [ ] 메시지 송신 Edge Function / RPC (security definer 단일 경로). 배포 = `supabase functions deploy`
      (마이그레이션과 별개 — CLAUDE.md 8·9, README §9).
- [ ] 공통 플랫폼 유지: `@dei/ui` 추가 요청 처리, 스키마 🔴 변경 승인, `verify` 게이트 관리.

---

## 충돌·의존 주의 (협업 매트릭스 요약)

| 테이블/모듈 | 소유 | 다른 담당 영향 |
|---|---|---|
| `profile` 🔴 | A 승인 | B 온보딩 W, A·C R — 새 컬럼 멱등, A 승인 후 |
| `room`/`room_member` 🔴 | A 고정 | C 방 화면(S13) R, B 나가기(S16), `room_is_member` RLS 선고정됨 |
| `message`/`message_mention` 🔴 | A | 방 채팅(S13a)·귓속말. all R |
| `group_match` 🔴 | C 단독 | B·room R |
| `match_queue`/`team` | B W | C R (매칭 편성) |
| `lib/video.stub` | C 구현 | S04b(B)도 카메라 모듈 재사용 |
| `lib/notifications.stub` | A 인프라 | 설정표면 S22(B), 권한게이트 S07a(B) |
| `lib/portone.stub` | B | 본인인증(S03)·결제(S17) |
| `lib/realtime` `room:{roomId}` | A 규약 | C presence·영상 신호가 같은 채널 공유 |

---

## "완료" 정의 (각 화면 PR 자가점검)

- [ ] 화면이 실제 동작(데이터·이벤트·서버 경로 연결) — placeholder 문구 제거
- [ ] raw 스타일 0 (`pnpm ds-enforce` 통과)
- [ ] `pnpm -F mobile exec tsc --noEmit` 통과
- [ ] 백엔드 변경 시: 마이그레이션 적용 **+ Edge Function 배포** + 앱과 동일 경로(`functions.invoke`) e2e (CLAUDE.md 8·9)
- [ ] 스키마 🔴 변경 시 A 승인 + `pnpm db:gen-types` 재실행
