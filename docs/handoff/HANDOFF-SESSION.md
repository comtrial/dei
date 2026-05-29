# dei 1차 셋팅 핸드오프 — 세션 인수인계 (2026-05-29)

> **다음 세션 에이전트에게:** 이 문서 하나로 컨텍스트 유실 없이 이어받는다.
> 먼저 이 문서를 끝까지 읽고, 아래 "다음 액션"부터 시작하라.
> 작업 브랜치: **`release/dei-ver2`** (main 에서 분기, 이미 체크아웃돼 있음).

---

## 0. 한 줄 요약

main 의 검증된 플랫폼 인프라만 cherry-pick 하고 도메인·디자인을 백지(zero-base)에서
재구성하는 "과팅/방" 도메인 1차 셋팅. v4 디자인 시스템(`@dei/ui`)을 HTML SSOT 그대로
구현하고 23화면을 핸드오프 헤더 달린 빈 스캐폴딩으로 만들어 개발자 B·C 에게 넘긴다.
**Phase 0~4 완료. Phase 3 테스트 잔결함 + Phase 5/6/7 남음.**

---

## 1. 반드시 먼저 읽을 문서 (이미 repo 에 있음)

| 문서 | 내용 |
|---|---|
| `docs/superpowers/specs/2026-05-29-dei-1차-셋팅-핸드오프-design.md` | **설계 spec (SSOT).** 결정 D-01~D-14, cherry-pick 경계, DS, 스키마, 화면 |
| `docs/superpowers/plans/2026-05-29-dei-1차-셋팅-핸드오프.md` | **구현 계획 Phase 0~7** (각 Step 명령·검증 게이트 포함) |
| `docs/handoff/_analysis/06-ds-element-coverage.md` | **DS 커버리지 매트릭스** — 31화면 × 컴포넌트, primitives 21 + patterns 16 (미커버 0) |
| `docs/handoff/_analysis/screens-extracted.json` | **31화면 추출 데이터** (담당자/route/목적/필수컴포넌트/이벤트/서버의존/정책의존) — Phase 6 화면 헤더 자동 채움용 |
| `docs/handoff/_analysis/02-schema-skeleton.md` | 스키마 골격 + 작업자 충돌 매트릭스 |
| `docs/handoff/_analysis/05-secrets-deploy-inventory.md` | env 키/EAS/Supabase 식별자 (값 마스킹) |

**디자인·화면 SSOT (repo 밖, 사용자 보유):** `/Users/susan/Downloads/all-screens (3).html`
— 모든 토큰·화면 시각요소의 원천. 디자인 관련은 무조건 이걸 참조. main 옛 디자인 참조 금지.

---

## 2. 확정된 핵심 결정 (절대 뒤집지 말 것 — 사용자 합의 완료)

- **D-03/04 디자인 SSOT = 위 HTML.** main 디자인 소스 참조 금지. 화면은 **무조건 `@dei/ui`
  토큰·컴포넌트만** import. raw 스타일(inline style/raw hex/StyleSheet.create) 금지 — ESLint 강제(이미 동작).
- **D-08 DM(1:1) 완전 제거.** 단체 채팅 단일 + **@멘션 귓속말**(`message.whisper_to_user_id`)로만
  개인 챗. DM 은 나중에 별도 화면(이번 미구현). 스키마에 `direct_message` 없음.
- **D-09 DB 네이밍 = A 골격** (`team`/`group_match`/`room_member`). dei-ver2 SQL 은 RLS·RPC 로직만 참고.
- **D-10 Admin 이번 제외.** service_role Edge/RPC 골격 + 핸드오프 마커만.
- **D-11 OTA 구성 추가됨** (app.json updates+runtimeVersion, eas.json channel).
- **D-12 알림·PortOne·영상 = 이식 안 함.** 인터페이스 경계 + placeholder stub 만. 다른 개발자 담당.
- **D-13 민감정보:** EAS projectId `92ac4c9e-baca-479d-9c1a-a0ac7fff3617`, owner `cmdsoftware_developer`,
  bundle `kr.cmdsoftware.dei`, Supabase ref `sjlzidjnpczysygnlmtk`. 실 시크릿은 repo 밖
  (`apps/mobile/.env`, `~/.dei/secrets.env` chmod600 — `source` 해서 사용).
- **사용자 추가 요구:** "DS 안 쓰면 PR 이 CI 에서 튕기도록" → Phase 7 `rooms-verify.yml` 의
  `ds-enforce` 잡으로 박을 것 (ESLint DS 강제 lint 를 required check 로).

---

## 3. 완료된 것 (커밋됨, release/dei-ver2)

```
a4c865b Phase 3 — DS 37 컴포넌트 전부 (primitives 21 + patterns 16)
df1c60a Phase 3 (1/2) — DS 16개 + cn 유틸 + jest/vitest 셋업
d46bb71 Phase 4 — rooms v2 스키마 골격 원격 push + 타입
1d960dc Phase 2.5 — 31화면 시각요소 전수 추출 + 커버리지 매트릭스
c0746bd Phase 2 — v4 토큰(HTML SSOT) + NativeWind preset + DS 강제 ESLint
e9c30a5 Phase 1 — 인프라 정리 + @dei/ui 스캐폴드 + OTA
7d3aab5 Phase 0 — 도메인·디자인 코드 일괄 삭제 (zero-base)
69ed4e4 / a93ae8f — 계획 + spec + 분석 산출물
```

- **Phase 0** ✅ 도메인·디자인 258파일 삭제. 인프라만 보존.
- **Phase 1** ✅ `@dei/ui` 패키지 생성, app.json(PortOne/camera/video plugin·BILLING 제거 + OTA),
  eas.json channel, config.toml PORTONE secret 제거, mobile 에 `@dei/ui` workspace 의존.
- **Phase 2** ✅ `packages/ui/src/tokens/` (color #FF2D6F 등 HTML 값 그대로, radius/shadow/typography/
  spacing + glass 토큰) + `preset.ts`(NativeWind) + `global.css`/`tailwind.config.js` 재생성 +
  `eslint.config.js` DS 강제 룰(inline style/raw hex/StyleSheet.create 금지, app+components 대상, 동작 확인됨).
- **Phase 2.5** ✅ 커버리지 매트릭스 (258 인스턴스 → 167 별칭 → 37 컴포넌트, 미커버 0).
- **Phase 3** ✅(구현)/⚠️(테스트 일부) `packages/ui/src/primitives/` 21개 + `patterns/` 16개.
  **typecheck 통과(EXIT_CODE=0, 88파일).** vitest 토큰 10건 통과. **jest 컴포넌트 테스트
  285+/292 통과, 단 3개 파일 6~7건 실패 (아래 4번 참조).**
- **Phase 4** ✅ 원격 push 완료. `supabase/migrations/` 3개:
  `20260529000000_drop_legacy_all.sql`(기존 36테이블 cascade 제거),
  `20260529000010_rooms_v2_baseline.sql`(A 골격 21테이블 + room_is_member 단일 RLS 게이트 +
  realtime room/room_member/message + 헬퍼),
  `20260529000020_rooms_v2_rls.sql`(27 정책). 원격 ref `sjlzidjnpczysygnlmtk` 에 적용 검증됨
  (REST introspection 으로 21테이블 확인). `packages/api/src/database.types.ts` gen-types 로 재생성(23 Row).
  `packages/api/src/index.ts` 에 `Database` export 복구됨.

---

## 4. 남은 작업 (다음 액션 순서대로)

### (A) Phase 3 마무리 — jest 테스트 3파일 잔결함 수정 [작은 작업]
**컴포넌트 구현은 정상(typecheck 통과). 테스트 단언이 구현과 안 맞는 것뿐.** 실제 구현 기준으로
테스트를 고친다 (구현을 바꾸지 말 것):
- `packages/ui/src/primitives/__tests__/Text.test.tsx`: logo variant 단언이 `text-display`를
  기대하나, 실제 `VARIANT_CLASS.logo = 'text-display font-black tracking-tighter'` 이므로
  **테스트 className 분해 방식 문제.** 실제 렌더된 className 문자열을 `toContain` 으로 느슨히 검증하도록 수정.
- `packages/ui/src/primitives/__tests__/Radio.test.tsx`: `dotClass` 헬퍼가
  `getByTestId('rd').props.children.props.className` 로 접근 → children 이 배열/구조 달라
  `undefined.className`. Radio.tsx 실제 구조(`<Pressable testID><View dot><View inset/></View></Pressable>`)에
  맞게 children 접근 경로 수정 (children 이 단일 View 인지 배열인지 확인 후).
- `packages/ui/src/primitives/__tests__/Spinner.test.tsx`: `getByRole('progressbar')` 실패 —
  Spinner.tsx 는 `accessibilityRole="progressbar"` 인데 RNTL/jest-expo 에서 role 쿼리 매핑 차이.
  `getByLabelText('로딩 중')` 또는 testID 기반으로 단언 변경.
- 빠른 진단: `cd /Users/susan/personal/dei && pnpm -F @dei/ui exec jest --json 2>/dev/null | grep '"testResults"' | tail -1 | <node 파서>` (전체 jest 반복 실행 금지 — 무겁다. 파일 단위로 `jest Radio` 처럼 좁혀라).
- 완료 후 커밋: `feat(ui): Phase 3 — jest 컴포넌트 테스트 잔결함 수정`.

### (B) Phase 5 — 아키텍처 골격 + placeholder stub
계획 문서 Phase 5 참조. `apps/mobile/` 에 생성:
- `app/_layout.tsx`(루트+providers), `app/(auth)/_layout.tsx`, `app/(onboarding)/_layout.tsx`,
  `app/(app)/_layout.tsx`(탭), `app/index.tsx`(S01 5분기 splash 라우터 골격).
- `providers/auth-provider.tsx`·`root-gate.tsx` 편집 (Supabase Auth 익명→PortOne 승격 placeholder + `logger.setUser`).
- `lib/permissions.ts`(PermissionGate: 카메라/알림 + 시스템설정 deeplink),
  `lib/realtime.ts`(`roomChannel(roomId)` = `room:${roomId}` 규약),
  `lib/analytics-taxonomy.ts`(screens-extracted.json 의 events 를 상수로).
- placeholder stub: `lib/notifications.stub.ts`/`portone.stub.ts`/`video.stub.ts`
  (시그니처 + `throw new Error('handoff: <담당> 구현 예정')` + 헤더 주석).
- 검증: `pnpm -F mobile exec tsc --noEmit`. 커밋.
- ⚠️ 삭제된 hooks 중 순수 3개 보존됨: `hooks/use-color-scheme.ts`, `use-color-scheme.web.ts`,
  `use-theme-color.ts` — `use-theme-color.ts` 가 삭제된 `constants/theme.ts` 를 import 하면 깨질 수 있으니 확인.

### (C) Phase 6 — 23화면 스캐폴딩 + 헤더 [Workflow fan-out 권장]
`screens-extracted.json` 의 31개(변형 포함) 화면 데이터로 빈 화면 + 핸드오프 헤더 주석 생성.
- route 는 spec §6.1 표 참조 (S01→`(app)/index`, S02→`(auth)/terms`, S13a→`(app)/room/[roomId]/chat`(A 담당) 등).
- 각 파일: 헤더 주석(담당자/목적/의존 DS 컴포넌트/데이터/이벤트/서버/정책/와이어프레임) +
  `@dei/ui` import + 최소 렌더(제목 + "핸드오프: {owner} 구현 예정") + **raw 스타일 0**.
- 헤더 템플릿 = spec §6.2. owner/route/목적 등은 JSON 에서 자동 채움.
- `docs/handoff/screens/S01.md ~ S23.md` 도 같이 생성.
- 검증: `pnpm -F mobile exec tsc --noEmit` + `pnpm -F mobile exec eslint app`(DS 강제, raw 0). 커밋.

### (D) Phase 7 — 핸드오프 문서 + 정책 config + CI 게이트
- `docs/handoff/README.md`: 전체 아키텍처 온보딩 (작업자 모델/cherry-pick 경계/@dei/ui 사용법/
  스키마 충돌 매트릭스/화면 인벤토리/Realtime 규약/env/배포/"화면 개발 시작법").
- `.github/workflows/rooms-verify.yml`: `ds-enforce(lint) → typecheck → unit → component` 직렬
  needs 체인 + 집계 잡. **ds-enforce 가 `pnpm -F mobile exec eslint app components --max-warnings=0`
  로 DS 강제** (사용자 요구 "DS 안 쓰면 튕기기"). 이건 아직 안 만들어짐 — 작성 필요.
- 정책 config 모듈 (`packages/shared/src/policy.ts` 또는 config): 매칭 파라미터/24h/면제권가격/
  신고6카테고리/약관/팀최대/새벽알림0~7KST/킬스위치 + auto-kick `ceil((n-1)/2)` + 블러게이트 24h.
  (dei-ver2 `decisions.md` D1~D11 참고 — `git show origin/dei-ver2:docs/rooms-spec/decisions.md`).
- `docs/handoff/SECRETS.md`: env 키 목록(값 0)/위치/커밋금지/HEART 드리프트/OTA 채널.
- 검증: `pnpm verify`(integration 은 Docker 없으면 NOT-RUN). 커밋.

### (E) 전체 재검증 + 최종 보고서
사용자 요구: "내가 요청한 모든 요구사항 재검증(제대로 구현됐는지) + 최종 보고서, 누락 확인".
- 작업 리스트 A-1~A-7 + B(화면 할당) + C(헤더 템플릿) 전부 매핑 체크.
- 검증 명령: `pnpm -F mobile exec tsc --noEmit`, `pnpm -F @dei/ui test`(vitest+jest),
  `pnpm -F mobile exec eslint app components`, 원격 스키마 21테이블 재확인.
- `docs/handoff/FINAL-REPORT.md` 작성: Phase별 산출물·검증 결과·누락/미결·다음 단계.

---

## 5. 환경·도구 주의사항 (실제로 막혔던 것)

- **로컬 Docker 미가동** → `pnpm db:reset`(로컬 supabase) 불가. Phase 4 는 원격 push 로 처리했음.
  로컬 검증 필요 시 사용자에게 Docker 기동 요청.
- **supabase CLI = `npx --yes supabase@latest`** (전역 미설치). 프로젝트는 `sjlzidjnpczysygnlmtk` 에 링크됨(`supabase/.temp`).
- **시크릿 사용:** `source ~/.dei/secrets.env` → `$DEI_SUPABASE_URL/$DEI_SUPABASE_REF/$DEI_ANON_KEY/
  $SR_KEY(service_role)/$DEI_DB_URL`. `~/.claude/settings.json` env 에도 일부 등록됨. **값 평문 출력·커밋 금지.**
- **psql / pg 모듈 없음** → 원격 introspection 은 REST openapi(`curl .../rest/v1/?apikey=$SR_KEY -H "Accept: application/openapi+json"`) 로.
- **테스트 영역 분리(중요):** vitest = `*.test.ts`(토큰/로직, node), jest-expo+RNTL = `*.test.tsx`(컴포넌트).
  `packages/ui/vitest.config.ts` 는 `*.test.ts` 만 include(수정 완료). 섞으면 vitest 가 .tsx 를 못 돌림.
- **jest 전체 실행은 무겁다(수 분).** 파일 단위로 좁혀 실행(`jest Radio`). 반복 전체 실행 금지.
- **Workflow 도구 fan-out 시:** 에이전트가 "완료" 보고해도 **실제 파일 생성 여부를 꼭 검증**하라
  (이전에 워크플로우가 "37개 완성" 보고했지만 실제로 16개만 생성된 적 있음 — `ls` 로 카운트 확인 필수).
- **워크플로우와 직접 작업 병렬 시 디렉토리 분리:** 워크플로우가 `packages/ui/` 쓰면 너는
  `supabase/`·`app/`·`docs/` 등 다른 곳을 건드려 충돌 회피.

---

## 6. 작업 리스트 → Phase 매핑 (재검증 체크리스트용)

| 작업리스트 | Phase | 상태 |
|---|---|---|
| A-1 레포·환경 토대 | P1 (cherry-pick) | ✅ |
| A-2 디자인 시스템 강제 | P2 토큰 + ESLint + P3 컴포넌트 | ✅(테스트 잔결함) |
| A-3 데이터 골격 | P4 스키마 16+테이블 + RLS | ✅ |
| A-4 공통 아키텍처 | P5 라우팅/인증/realtime/권한/taxonomy | ⏳ |
| A-5 배포 영역 | P1 OTA/EAS + P7 문서 | ✅(OTA)/⏳(문서) |
| A-6 정책 모듈 | P7 policy config | ⏳ |
| A-7 화면 스캐폴딩 | P6 23화면 + 헤더 | ⏳ |
| B 화면 할당 / C 헤더 템플릿 | P6 (screens-extracted.json + spec §6.2) | ⏳ |

---

## 7. 다음 세션 첫 메시지로 쓸 프롬프트 (복붙용)

> `release/dei-ver2` 브랜치에서 dei 1차 셋팅 핸드오프를 이어서 완성해줘.
> 먼저 `docs/handoff/HANDOFF-SESSION.md` 를 끝까지 읽고, 거기 "4. 남은 작업" 의
> (A)→(B)→(C)→(D)→(E) 순서대로 진행해. 확정 결정(2번)은 뒤집지 말고,
> 디자인은 무조건 HTML SSOT(`/Users/susan/Downloads/all-screens (3).html`)와
> `@dei/ui` 만 쓴다. 화면은 raw 스타일 0. 다이내믹 워크플로우(Workflow 도구)로
> fan-out 하되 워크플로우가 "완료" 보고해도 실제 파일 생성을 `ls` 로 검증해.
> 마지막에 전체 재검증 + `docs/handoff/FINAL-REPORT.md` 작성.
