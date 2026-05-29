# dei 1차 셋팅 핸드오프 — 최종 보고서 (2026-05-29)

> release/dei-ver2. 본 세션은 핸드오프 이어받아 **Phase 3 잔결함 → Phase 5 →
> Phase 6 → Phase 7 → 전체 재검증** 을 완료했다. 아래는 요구사항 재검증 +
> 산출물 + 검증 결과 + 누락/미결 + 다음 단계.

---

## 1. 작업 리스트(A-1~A-7 + B·C) → 충족 여부

| # | 작업 | Phase | 상태 | 근거 |
|---|---|---|---|---|
| A-1 | 레포·환경 토대 (cherry-pick 인프라) | P1 | ✅ | `@dei/ui` workspace, OTA, config.toml 정리 (이전 세션) |
| A-2 | 디자인 시스템 강제 | P2 토큰 + ESLint + P3 컴포넌트 | ✅ | 토큰 vitest 10건, 컴포넌트 jest 292건, ds-enforce PASS |
| A-3 | 데이터 골격 | P4 스키마 + RLS | ✅ | 원격 ref 에 **21테이블** REST 재확인, `Database` 타입 export 복구 |
| A-4 | 공통 아키텍처 | P5 라우팅/인증/realtime/권한/taxonomy | ✅ | app/_layout + 그룹 + splash, auth-provider 재작성, lib 4종 |
| A-5 | 배포 영역 | P1 OTA/EAS + P7 문서 | ✅ | app.json updates/runtimeVersion, eas channel, SECRETS.md |
| A-6 | 정책 모듈 | P7 policy config | ✅ | `@dei/shared` POLICY + REPORT_CATEGORIES, policy.test 7건 |
| A-7 | 화면 스캐폴딩 | P6 23화면(변형 31) + 헤더 | ✅ | app .tsx 30화면 + splash, screens MD 29, 헤더 전수 완비 |
| B | 화면 할당 | P6 (owner = screens JSON) | ✅ | 각 파일 헤더 `담당자:` + screen-route-map.json |
| C | 헤더 템플릿 | P6 (spec §6.2) | ✅ | 담당자/목적/의존DS/데이터/이벤트/서버L1/정책L2/와이어프레임 |

---

## 2. 본 세션 산출물 (커밋)

| 커밋 | 내용 |
|---|---|
| `cc855c6` | **Phase 3 마무리** — jest 3파일 잔결함 + cn() 토큰 머지 버그 픽스 |
| `8982bd2` | **Phase 5** — 아키텍처 골격(라우팅/인증/realtime/권한/taxonomy/stub) |
| `657f5f1` | **Phase 6** — 화면 30개 스캐폴딩 + 헤더 + screens MD 29 (워크플로우 fan-out) |
| `b43e521` | **Phase 7** — README/SECRETS + policy config + verify 게이트 |

(이전 세션: Phase 0~4 = `7d3aab5`~`a4c865b`.)

---

## 3. 검증 결과 (재실행, 증거)

| 검증 | 명령 | 결과 |
|---|---|---|
| 타입 | `pnpm -F mobile exec tsc --noEmit` | ✅ PASS |
| DS 강제 | `pnpm ds-enforce` (`eslint app --max-warnings=0`) | ✅ PASS — raw hex/inline style/StyleSheet 전수 **0** |
| 토큰 | `pnpm -F @dei/ui exec vitest run` | ✅ 10/10 |
| 컴포넌트 | `pnpm -F @dei/ui exec jest` | ✅ 292/292 (37 suites) |
| shared | `pnpm -F @dei/shared test` | ✅ 22/22 (logger/analytics/policy) |
| 통합 게이트 | `pnpm verify` | ✅ ds-enforce/lint/typecheck/unit/component PASS · integration NOT-RUN-LOCALLY |
| 원격 스키마 | REST openapi introspection | ✅ 21테이블 |
| 화면 파일 | `find apps/mobile/app -name '*.tsx'` | ✅ 35 (레이아웃4+splash1+화면30) · 헤더 전수 완비 |

> **integration 은 로컬 Docker 부재로 NOT-RUN-LOCALLY** (정직 표기). CI(`verify.yml`)가
> 로컬 supabase 컨테이너로 실제 실행하며 0건 시 FAIL. — 이건 게이트 설계상 의도된 동작.

---

## 4. 원래 계획 대비 의도된 편차 (보고)

핸드오프 plan 을 그대로 따르되, 실제 코드 상태와 맞춰 다음을 **판단·조정**했다.
모두 근거를 코드 주석/문서에 남겼다.

1. **cn() 는 "테스트만 수정" 이 아니라 실제 버그였다.** Text variant=logo 가
   `text-display`(커스텀 36px 토큰)를 tailwind-merge 충돌로 잃던 런타임 버그.
   `extendTailwindMerge` 로 커스텀 font-size 등록(impl 1줄) — 핸드오프 노트의
   진단이 불완전했음을 보고하고 올바른 픽스 적용. (커밋 `cc855c6`)

2. **(app) 그룹 = 탭이 아닌 Stack.** plan 은 "탭" 이라 적었으나 HTML SSOT 동선에
   영구 하단 탭바가 없다(home 상단바+아바타). SSOT 충실(D-03) 위해 Stack.
   ((app)/_layout.tsx 주석)

3. **Phase 0 누락분 정리.** 옛 도메인 통합테스트 7개·register-flags·use-theme-color
   (삭제 모듈 참조)와 dead 스크립트가 zero-base 삭제에서 빠져있어 제거. `@dei/api`
   Database export(Phase 4 완료 보고됐으나 실제 주석처리됨) 복구.

4. **빈 테스트 스위트 게이트 통과.** 도메인 테스트가 0 인 패키지(@dei/api, mobile)에
   `--passWithNoTests`. 게이트가 "테스트 없음" 으로 FAIL 하지 않게.

5. **`pnpm verify` 를 rooms 게이트로 재작성.** 옛 `verify.mjs` 는 삭제된 채팅
   도메인의 6단계 게이트(e2e-web 포함)였음. ds-enforce 선두 추가 + e2e-web 제거.

6. **사용자 결정 반영:** e2e Playwright 하네스(옛 채팅 도메인)는 **참고용 유지**
   (메인 typecheck/verify 제외, `typecheck:e2e` 로 분리, README 경고). 도메인
   통합테스트만 삭제. (대화 중 AskUserQuestion 으로 확정)

---

## 5. 미결 / 다음 담당자 액션 (누락 아님 — 의도된 핸드오프 경계)

| 항목 | 담당 | 비고 |
|---|---|---|
| 알림/PortOne/영상 실구현 | A인프라/B/C | stub(`*.stub.ts`)만. D-12 경계대로 |
| splash 5분기 부트스트랩 조회 | B | `app/index.tsx` TODO(B) — 현재 세션 유무 골격 분기 |
| auth 익명→PortOne 승격 | B | `auth-provider.promoteWithIdentity` placeholder |
| TanStack Query Provider | 첫 데이터 화면 담당 | 스캐폴딩 단계라 미설치(미사용 의존 회피, README §7) |
| e2e Playwright 하네스 재구성 | C | 옛 채팅용 — 방/채팅 화면으로 재작성 시 verify 게이트에 e2e-web 추가 |
| 정책 config 테이블화 | 운영 도입 시 | 현재 POLICY 는 타입 고정 기본값/폴백(서버 config 가 최종 SSOT) |
| Admin | A/PM | D-10 이번 제외 |
| HEART env 드리프트 | 결제 담당 | .env.example↔.env 정합 (SECRETS.md §2) |
| Edge Function 배포 | 백엔드 변경 시 | 마이그레이션≠배포 (CLAUDE.md 8·9, README §9) |

---

## 6. 결론

요구한 A-1~A-7 + B·C 항목 **전부 충족**. 확정 결정(D-01~D-14) 미준수 0.
검증 게이트 전 계층 GREEN(integration 은 Docker 부재로 로컬 NOT-RUN, CI 강제).
화면 raw 스타일 0 으로 DS 강제 성립. B·C 는 `docs/handoff/README.md` →
화면 헤더/`screens/S*.md` 순으로 읽고 바로 구현 시작 가능.
