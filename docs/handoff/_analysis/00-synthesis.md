This is a read-only synthesis task. I have all five analysis inputs in the prompt. Let me produce the consolidated design-confirmation summary directly. No file reads needed since everything is provided.

# dei 1차 셋팅 핸드오프 — 설계 확정용 종합 요약 (READ-ONLY)

> SSOT: `/Users/susan/Downloads/all-screens (3).html` (화면·토큰·DS). 참고 도메인 구현: `origin/dei-ver2`. 현재 작업 베이스: `main` → `release/dei-ver2` zero-base 재구성.

---

## 1. 화면 인벤토리 표 (HTML SSOT, owner B 계열)

전달받은 추출은 S01~S04c(8행)까지 본문이 끊겼고 나머지는 잘림. 확정된 행만 채우고, **추정·미수신 행은 명시 플래그**한다.

| ID | 제목 | owner | route(추정 포함) | 핵심 컴포넌트(요지) | 이벤트 | 서버 의존 | 정책 의존 |
|---|---|---|---|---|---|---|---|
| S01 | 앱 첫 실행(splash) | B | `(app)/index` | LogoMark, 메인/서브카피, Spinner, 오프라인·timeout 재시도 | — | Auth 세션 검증, 부트스트랩 조회(프로필/큐/방 1콜) | — |
| S02 | 약관 + 19+ 자가확인 | B | `(auth)/terms` | AgeTag, CheckAll, CheckRow×4, RequiredTag, PrimaryCTA, MicroCopy | `terms_agreement_screen_entered` | 약관 전문 로드, 동의 기록 저장 | 약관 필수/선택 구분, 버전 변경 재동의 강제 |
| S03 | 본인인증 진행중(PortOne) | B | `(auth)/verify` | ProgressRing, BrandTransitionFrame, CircleIconButton(X), 조건부 Alert | `phone_auth_cancelled_by_user` | PortOne 콜백 검증 Edge, CI 조회/계정 매핑, 실패카운터·잠금 | 19+ 게이트, 5회/24h 잠금, CI중복 새계정금지, 인증정보 변경불가 |
| S03f | 본인인증 실패 | B | `(auth)/verify`(실패상태) | ErrorIconBadge, CircleIconButton(X), DualCTAStack | — | 실패 로그, PortOne 재호출 | 5회/24h 잠금, 실패횟수 비노출 |
| S04 | 프로필 1/3 기본정보 | B | `(onboarding)/profile/step1` | ProgressBar(33%), FormField, LockBadge, InlineValidationHelper(4상태), BottomFixedCTA | `profile_step_completed` | 닉네임 unique·blocklist 검사, step1 저장, 단계 진행상태 | 닉 정책(한/영/숫 1~10자), unique key, 30일 1회 변경, 성별·생일 lock |
| S04b | 프로필 2/3 사진 | B | `(onboarding)/profile/step2` | ProgressBar(66%), PhotoUploadFrame, BackButton, Textarea+CharCount(60), ProgressModal/Alert | `profile_photo_uploaded` | storage 업로드+URL, bio 필터, S11 카메라 연동 | 현장촬영만(갤러리X), 1장 필수, 신고시 사람검토, 권한거부=inline+deeplink |
| S04c | 프로필 3/3 신상 | B | `(onboarding)/profile/step3` | ProgressBar(100%), Select(placeholder), OptionalFieldLabel, BackButton, 조건부 Alert | (멀티스텝 flow 공유) | 가입완료 트랜잭션, 지역 GPS 자동채움 | 모든필드 선택(이탈방지), 지역=시·도, 위치동의 연동 |

플래그
- **누락(미수신)**: S05~S23 본문 전체가 프롬프트에서 잘림. 표는 **S04c까지만 신뢰**. DS 인벤토리·cherry-pick 분류에서 역참조되는 화면명만 아래 "추정 명세"로 보조.
- **routingMeta 역참조(추정)**: S05=홈, S07/S07a=매칭중, S09=CTA, S11/S11b=카메라(영상/사진), S13/S13a=방+컴포저, S14=멤버프로필, S16/S17=비교카드/결제, S18=부스터(VLOG 관련), S19=pass-card, S20~S23=신고/입력류. **확정 전 원본 HTML 재수신 필요.**
- **S18 "VLOG 제거예정" 플래그**: 사용자가 task에서 지목. DS 인벤토리상 S18은 `boost`(accent CTA) + `later`(secondary) + cta-card 패턴 사용 = **부스터 결제 진입 화면**으로 보임. ver2 `booster_grants`/`booster-purchase-sync`와 연결. → "VLOG"가 영상로그(제거대상)인지 부스터(유지)인지 **개념 충돌**. 6번 갭에서 결정 요청.

---

## 2. @dei/ui 패키지 구조 (HTML 값 그대로, 추정 없음)

```
@dei/ui/
├── tokens/
│   ├── color.ts       surface(bg/paper/bg-2/bg-3) · ink(ink~ink-4) · line(line/line-2)
│   │                  · semantic(accent/accent-soft/accent-deep, warn*, danger*, info*, success)
│   ├── radius.ts       r-sm 10 · r-md 14 · r-lg 20 · r-xl 24 · r-full 9999
│   ├── shadow.ts       shadow-1(정의됨) + [추가후보] shadow-2 0 8px24 .16 · shadow-pop · device 0 16px40 .12
│   └── typography.ts   font(Pretendard JP var…) · font-mono(SF Mono) + [정규화필요] size/weight/letter-spacing px리터럴
├── primitives/
│   ├── Button         ink(검정) · accent(핑크) · secondary · tertiary/text · mini-pill(r-full) · disabled · glass(blur)
│   ├── Input          bg-2/r-md, locked(bg-3/ink-3), label/.helper/.charcount, search variant
│   ├── Textarea       + CharCount (S04b 60, S23)
│   ├── Select         chevron(ink-4), placeholder(ink-4), lock(비대화형)
│   ├── Card           기본(paper+line) · cta-entry(r-lg) · compare(cur=bg-2/now=ink+glow) · info-rows
│   ├── Avatar         원형+이니셜
│   ├── ProgressBar    4px bg-2 트랙 + accent fill (33/66/100% 스텝)
│   ├── ProgressRing/Spinner  pulse 36px(S01) / progress-ring 80px(S03) 동일 patten 변형
│   ├── LogoMark       64px w900, .dot=accent
│   ├── CheckRow/CheckAll  원형 체크박스 + RequiredTag(accent/ink-3)
│   ├── Badge/Tag      AgeTag(ink pill) · RequiredTag · LockBadge · OptionalFieldLabel
│   ├── CircleIconButton  36px bg-2 원형(X)
│   └── StatusBar      notch+status row (전화면 공유 device 프레임)
└── patterns/
    ├── BottomSheet    scrim .55 + behind brightness + sheet(r-xl 24 리터럴→토큰매핑) + handle 36×4
    ├── Modal/AlertDialog  center, icon-circle(danger-soft/warn-soft/info), mini/r-lg
    ├── Banner         restrict(accent-soft) · warn-bar(warn-soft) · danger-box(danger-soft) · info/assure(info-soft)  ← transient toast 없음, banner가 SSOT
    ├── BrandTransitionFrame  dei.→PortOne 칩 나열
    └── DualCTAStack   primary(ink)+secondary(bg-2) 세로, margin-top auto 하단고정
```

토큰화 결정 필요(추정 아님, HTML이 리터럴로 둔 것)
- **비표준 하드코딩 색**: 아바타 `#7A8DB8`/`#E07A4F`, empty-blob 3색, 셀 그라데이션 `bg-a~h`, 배너 보더/텍스트 다수 → **patterns 단계 국소처리 or 토큰 확장** 중 택1.
- **shadow·typography**: 토큰 미정규화. 값은 그대로 두고 **이름만 부여**(임의값 변경 금지).
- **Sheet r-xl**: 리터럴 24 → `--r-xl` 매핑 권장.

---

## 3. 스키마 골격 + 충돌위험 매트릭스

설계 핵심(A 고정): **1:1 채팅(`conversations`/`messages`) 재정의·마이그레이션 금지.** 과팅 "방"은 N:N → 별도 `room`/`group_match` 트리 신설. 기존 헬퍼(`set_updated_at`, `is_admin`, `chat_is_blocked_between`)는 **N멤버십으로 일반화 재사용**.

| # | 테이블 | 그룹 | 핵심 status enum | RLS 게이트 | 작업자(R/W) | 충돌 |
|---|---|---|---|---|---|---|
| 1 | `profile`(기존 확장) | 사용자 | — | 본인W/auth read | A·B·C R, 온보딩 W | 🔴 HIGH |
| 2 | `auth_verification`(기존) | 신원 | provider/status | 본인 SELECT + service write | A R/W | — |
| 3 | `team` | 팀 | FORMING/READY/MATCHING/LOCKED/DISBANDED | `team_is_member` | A W, B R | — |
| 4 | `team_invite` | 팀 | PENDING/ACCEPTED/DECLINED/EXPIRED | 초대·피초대·멤버 SELECT, 수락 RPC | A W, B R | — |
| 5 | `match_queue` | 매칭 | WAITING/MATCHED/CANCELLED/EXPIRED | 팀멤버 본인큐, enqueue/dequeue RPC | B W, C R | — |
| 6 | `group_match`(★`matches` 동명회피) | 매칭 | ACTIVE/ENDED/CANCELLED | `group_match_is_member`, 생성 RPC | C W, B·room R | 🔴 HIGH |
| 7 | `match_member` | 매칭 | (side A/B) | 동일 match set SELECT | C W, room R | — |
| 8 | `room`(★`conversations` 일반화) | 방 | ACTIVE/ENDED/DELETED | `room_is_member` AND not-blocked, realtime ON | A·B·C R, 생성 RPC W | 🔴 HIGH |
| 9 | `room_member`(★`room_is_member` 정의원천) | 방 | role owner/member, left_at soft | 동일 room SELECT, 본인행 UPDATE | A·B·C R, 본인 W | 🔴 HIGH |
| 10 | `room_lifecycle` | 방 | 생성/종료 이벤트 이력 | (잘림) | (잘림) | — |

**동시 편집 충돌 핫스팟 (HIGH 4):**
- `profile` — 스키마 변경은 **A 승인 필수**, 신규컬럼 `add column if not exists` 멱등만.
- `group_match` — `matches` 동명회피 결정 + canonical order(`team_a_id < team_b_id`) + 차단게이트가 cross-cutting. **C 단독 소유 권고.**
- `room` / `room_member` — `room_is_member`가 모든 room 하위 RLS의 단일 참조점. **A가 헬퍼·RLS 게이트를 먼저 못박고** B/C는 그 위에서 작업. 동시 수정 시 RLS 깨짐 위험 최상.

ver2 직접 참고(HIGH): `20260526000010_rooms_v1_baseline.sql`(11테이블+10RLS+10RPC 단일파일), `block_user` auto-kick `ceil((n-1)/2)`, `db-design.md`, `decisions.md`(D1~D11).

플래그
- 표는 #10에서 잘림. `room_lifecycle` 이후 테이블(메시지/업로드/신고/cooldown 등 ver2엔 11개) **미수신** → 골격 원본 재수신 필요.
- ver2는 `room`/`group`/`group_members`/`room_members`/`hourly_uploads`/`chat_messages` 네이밍. A 골격은 `team`/`group_match`/`room_member`. **네이밍 합치 결정 필요**(6번).

---

## 4. cherry-pick(KEEP) vs zero(삭제) 최종 분류

원칙: **도메인 무지(infra/build/harness/순수유틸/transport SSOT) = KEEP. 도메인색(영상로그/매칭/좋아요/채팅/큐레이션/결제/본인확인/알림) = ZERO.** 알림·portone·영상은 이식 안 함 + 인터페이스 placeholder만.

**KEEP (cherry-pick)**
- 모노레포 뼈대: `package.json`(register-flags 줄 제거), `turbo.json`, `pnpm-workspace.yaml`/`.npmrc`/`pnpm-lock`(재생성 권장), `vitest.workspace.ts`, `scripts/verify.mjs`, `.gitignore`, `.env.example`.
- mobile 셋업: `babel/metro/jest/vitest(+integration)/playwright/eslint.config`, `jest.setup.ts`+`vitest.setup.ts`(Sentry·PostHog mock 유지), `nativewind-env.d.ts`, `tsconfig(.e2e)`, `components.json`(토큰값만 갱신), `.vscode`, `scripts/reset-project.js`, `scripts/smoke-sentry.ts`.
- 배포: `eas.json`, `apps/mobile/app.json`(편집: portone plugin·camera 권한·BILLING 제거/placeholder, scheme/bundleId 유지), `EAS-QA.md`.
- `@dei/shared` 전부: `logger.ts`/`analytics.ts`/`index.ts` + 테스트 + 패키지셋업 (transport SSOT, 도메인 무지).
- `@dei/api` glue만: `client.ts`, `index.ts`(편집: 도메인 export 정리), `__tests__/client.test.ts`, 패키지껍데기.
- supabase glue: `lib/supabase.ts`, `lib/sentry.ts`, `lib/posthog.ts`, `config.toml`(편집: PORTONE_*/PHONE_HASH_SALT 줄 제거), `supabase/.gitignore`.
- CI: `.github/workflows/ci.yml`, `pull_request_template.md`.
- 순수유틸: `lib/utils.ts`(cn), `dateHelpers.ts`, `formatDuration.ts`, `formatters.ts`, `timeOfDay.ts`(경계).

**ZERO (삭제·재생성)**
- `app.json`(루트 빈 stub), `@dei/api`: `database.types.ts`(→`db:gen-types` 재생성), `types.ts`, `schemas/*`, `contract.test.ts`.
- supabase: `seed.sql`/`seed_h2_test.sql`, `migrations/*`(~50개), `migrations_legacy/*`.
- 도메인 워크플로우: `chat-verify.yml`/`e2e.yml`/`integration.yml` = **구조 패턴만 참고** 후 신도메인용 재작성(ver2 `rooms-verify.yml`이 더 가까운 참고).
- `lib/` 도메인 파일(데일리로그·매칭·채팅·큐레이션 등) 전부.

플래그: 7번 표가 `timeOfDay.ts`에서 잘림. **lib/ 잔여 파일 개별 판정 미수신** → 도메인 라우트(`app/(app)/*`)·도메인 컴포넌트(`components/*`)·hooks 판정 누락. 원칙(도메인색=ZERO)으로 일괄 처리 가능하나 경계 파일(useHomeScreen 등 현재 워킹트리 수정분 포함)은 개별 확인 권장.

---

## 5. 민감정보 / 배포 전달 규약

**환경변수 (EXPO_PUBLIC_* = 빌드타임 임베드 → 변경 시 재빌드 필수)**
- 위치: `apps/mobile/.env`(gitignore, 실제 12종) / `.env.example`(tracked 템플릿 14종). **드리프트 존재**: `REVENUECAT_HEART_OFFERING_ID`/`HEART_PRODUCT_ID` 2종이 example에만 → ver2에서 정합(HEART 폐기면 example 제거, 유지면 .env 추가).
- public 안전: SUPABASE_URL/ANON_KEY(RLS 전제). 비밀 취급: SENTRY_DSN, POSTHOG_KEY, REVENUECAT 키류 → `.env`에만.

**Expo / EAS**
- `apps/mobile/app.json`(실설정, tracked): projectId `92ac4c9e-…`, owner `cmdsoftware_developer`, scheme `dei`, bundleId `kr.cmdsoftware.dei`. **OTA(EAS Update) 미구성** — `updates`/`runtimeVersion`/`channel` 전무.
- `eas.json`: development/preview(staging)/production 3프로파일, `appVersionSource: remote`. **OTA 채널 없음.** preview의 `APP_ENV=staging` ≠ EAS `environment=preview` 라벨 불일치(정리후보).

**로컬 비밀(위치만, 값 절대 비출력)**
- `~/.dei/secrets.env`(perm 600, repo 밖): `DEI_SUPABASE_URL/REF/ANON_KEY/SERVICE_ROLE_KEY/DB_URL/GH_TOKEN/SR_KEY`.
- `~/.claude/settings.json` env: 위 중 5종(`DB_URL`·`GH_TOKEN` 미등록 = 차이).
- 정합 확인(값 미출력): 세 출처 모두 ref `sjlzidjnpczysygnlmtk` 일치.
- **최고위험(절대 EXPO_PUBLIC/repo 노출 금지)**: `SERVICE_ROLE_KEY`, `SR_KEY`, `DB_URL`, `GH_TOKEN` — 로컬·CI secret만.

**전달 규약(권고)**
1. 신규 도메인 Edge secrets(PORTONE_* 등)는 placeholder만 두고 실값은 Supabase Edge secrets/CI secret으로. config.toml에 평문 금지.
2. 실DB e2e는 `~/.dei/secrets.env` source → service_role은 cleanup 전용, **앱 경로 검증은 발급 JWT(ES256)로 functions.invoke**(CLAUDE.md 9).
3. OTA 도입 시 `app.json`+`eas.json` 양쪽 동시(channel/runtimeVersion). 미도입이면 "빌드 배포만" 명시.

---

## 6. 갭 · 결정필요 항목 (설계 확정 전 사용자 확인)

| # | 결정 항목 | 선택지 / 영향 |
|---|---|---|
| G1 | **화면 원본 재수신** | S05~S23 본문이 프롬프트에서 잘림. 표 1·DS 역참조가 추정에 의존 → **HTML SSOT 전체 화면 분 재공급 필요**(확정 차단요인). |
| G2 | **S18 "VLOG" 정체** | DS상 S18=부스터 결제(accent boost+later+cta-card)로 보이나 task는 "VLOG 제거예정"이라 표기. 영상로그(ZERO)인지 부스터(KEEP)인지 **개념 확정**. ver2 `booster_grants` 연결 여부 결정. |
| G3 | **DB 네이밍 합치** | A골격(`team`/`group_match`/`room_member`) vs ver2(`group`/`rooms`/`room_members`). 한쪽으로 통일. `matches` 동명회피(→`group_match`)는 확정 권고. |
| G4 | **admin/운영 편성 repo 분리** | ver2는 수동편성(D2) = service_role Edge(`match-admin-create-room`). admin UI를 같은 monorepo 앱으로 둘지 별도 repo로 뺄지. |
| G5 | **DM(1:1) 분리 경계** | 기존 `conversations`/`messages` 보존 결정됨. 과팅 방(N:N)과 1:1 DM이 **공존**하는지, 1:1을 폐기하고 방만 쓸지. 공존이면 splash 5분기·홈 진입 로직에 영향. |
| G6 | **OTA 채널 네이밍** | OTA 도입 여부 + 도입 시 channel명(`production`/`preview`/`staging`)과 runtimeVersion 정책. 미도입이면 명시. |
| G7 | **HEART 상품 드리프트** | `.env` vs `.env.example` HEART 2종 불일치 → 폐기/유지 결정 후 정합. |
| G8 | **team_member 정규화 승격** | A골격은 `team_invite.ACCEPTED` 집합으로 팀원 도출(placeholder). 정규화 `team_member` 테이블 승격 여부 = 개발자 결정 위임됨. |
| G9 | **register-flags 제거 범위** | `package.json` register-flags 줄 제거 시 feature_flag 인프라 전체 폐기인지(ver2 zero-base와 일관). PostHog super property A/B(ce79314 머지분) 연동 영향 확인. |
| G10 | **워킹트리 미커밋 변경분** | 현재 `home.tsx`/`useHomeScreen.ts` 수정 + 신규 H3ErrorContent/테스트 = 큐레이션 도메인(MEMORY: get-curation-feed SSOT). zero-base 전환 시 **폐기 대상**인지 확인. |

---

## 7. 핸드오프 헤더 템플릿 (화면별 자동 채움 필드 매핑)

화면 추출 JSON → 핸드오프 헤더 자동 매핑. `{...}`는 추출 필드 직결, `[추정]`은 검증 필요.

```yaml
---
type: Project
Workspace: "[[personal]]"          # cwd=~/personal/dei → personal
Belongs to:
  - "[[dei]]"
status: Planning
screen_id: {id}                     # S01…
owner: {owner}                      # B
route: {route}                      # routingMeta의 expo-router 경로
---

# {id} {title}

## 목적
{purpose}

## 라우팅
{routingMeta}                       # 진입·분기·뒤로가기·CTA 목적지

## 확정 결정
{decisions[]}                       # 리스트 그대로

## 필수 컴포넌트 (→ @dei/ui 매핑)
{requiredComponents[]} ⇒ {dsPatterns[]}   # 필수/조건부/선택 태그 보존, primitive명 연결

## 계측 이벤트
{events[]}                          # PostHog 이벤트명 (@dei/shared analytics transport)

## 의존성
- data: {dataDeps[]}                # 테이블/컬럼 → 스키마 골격 #번호 cross-link
- server: {serverDeps[]}            # Edge Function / RPC → functions.invoke 경로
- policy: {policyDeps[]}            # 정책모듈

## 후속(followups)
{followups[]}

## 검증 계층 (CLAUDE.md Testing 매핑)
- [ ] unit / component / integration(실Supabase) / e2e-web / e2e-native
- [ ] DB·Edge·auth 변경 시: 발급 JWT(ES256) → 원격배포 Edge → functions.invoke 경로 e2e (규칙 9)
```

자동 채움 가능 필드: `id/title/owner/route/purpose/routingMeta/decisions/requiredComponents/dsPatterns/events/dataDeps/serverDeps/policyDeps/followups` (전부 추출 JSON에 존재). **수동 보강 필요**: dataDeps→스키마#번호 cross-link, serverDeps→ver2 Edge 레퍼런스 매핑, 검증 체크박스.

---

### 확정 차단요인 (1순위)
**G1(S05~S23 화면 원본)** 과 **G2/G3/G5(VLOG 정체·DB 네이밍·DM 분리 경계)** 가 해소되기 전엔 화면 표·스키마 골격이 추정 구간을 포함한다. 이 4건 확정 후 본 핸드오프를 full 23행으로 확장 가능. 나머지(G4·G6~G10)는 병행 진행 가능한 운영 결정.