# 채팅 검증 인프라 (e2e)

이 디렉터리는 **"개발자가 폰으로 직접 안 눌러봐도 된다"** 는 확신을 만드는
자동 검증 레이어다. 채팅 9개 스펙 flow(`docs/chat-spec/DEV-SPEC.md`)가
계층별 자동 테스트로 빠짐없이 덮인다.

## 디렉터리

```
apps/mobile/
├── e2e/
│   ├── harness/                # react-native-web 로 *실제* 채팅 스크린 마운트
│   │   ├── App.tsx             #   ?screen= / ?scenario= 로 라우팅·픽스처 선택
│   │   ├── index.tsx           #   SafeAreaProvider 부트
│   │   ├── index.html
│   │   └── mockChatService.ts  #   Supabase 경계만 결정적 모킹 (Docker 불필요)
│   └── playwright/
│       ├── vite.config.ts      # RN→RN-web alias + 경계 shim
│       └── specs/              # CH1/CH2/CH4/CH5 DOM 레벨 assertion
├── __harness_shims__/          # expo-router / auth-provider 등 비결정 경계 shim
├── .maestro/flows/             # 네이티브 E2E (실기기/시뮬레이터)
├── tsconfig.e2e.json           # 하네스 web 타입 타깃 (typecheck 게이트 포함)
└── playwright.config.ts
```

## 테스트 계층 (어디에 무엇을 넣나)

| 계층 | 도구 | 위치 | 무엇을 보장 | 실행 |
|---|---|---|---|---|
| Unit | Vitest | `lib/**/__tests__` | 순수 분기 로직 (route-gate, 글자수, 실패 분류) | `pnpm --filter mobile test:unit` |
| Component | Jest+RNTL | `components/**/__tests__` | 컴포넌트 렌더/상호작용 | `pnpm --filter mobile test:component` |
| Integration | Vitest+로컬 Supabase | `__tests__/integration` | 실제 RLS/RPC/차단/나가기 (서버 계약) | `pnpm --filter mobile test:integration` |
| e2e-web | Playwright | `e2e/playwright/specs` | 실제 채팅 스크린 DOM 레벨 funnel | `pnpm --filter mobile test:e2e:web` |
| e2e-native | Maestro | `.maestro/flows` | 실기기 진입/목록→방/전송 funnel | `pnpm --filter mobile test:e2e` |

### 새 기능 → 어느 계층? (결정 트리)

```
순수 함수 / 분기 판정 (네트워크 없음)?
  └─ 예 → Unit (Vitest, lib/**/__tests__)

RN 컴포넌트의 렌더/이벤트 동작?
  └─ 예 → Component (Jest+RNTL, components/**/__tests__)

Supabase 쿼리/RLS/RPC/Edge 의 서버측 계약?
  └─ 예 → Integration (vitest.integration.config.ts)
          ※ testID 무관. 실제 DB 결과를 assert. 절대 mock 금지.

화면 단위 사용자 흐름(목록·컴포저·다이얼로그·내비게이션)?
  └─ 예 → e2e-web (Playwright, e2e/playwright/specs)
          ※ 셀렉터는 testID. mockChatService 로 데이터 경계만 모킹.

실기기/네이티브 통합(권한·키보드·딥링크 등)이 핵심?
  └─ 예 → e2e-native (Maestro, .maestro/flows). 작게 쪼갤 것.
```

## 왜 Playwright 가 신뢰 가능한가

하네스는 화면을 *재구현하지 않는다*. `e2e/harness/App.tsx` 가
`app/(app)/messages.tsx`(CH1)·`chat-room.tsx`(CH2) 등 **프로덕션 스크린
컴포넌트 그대로** 를 react-native-web 으로 마운트한다. 모킹 경계는 딱
3개뿐:

- `@/lib/chat/chat-service` → `mockChatService` (Supabase/Docker 제거)
- `expo-router` → 내비게이션을 `window.__HARNESS_NAV__` 에 기록
- `@/providers/auth-provider` → 고정 로그인 사용자

따라서 컴포저 글자수·전송 낙관 버블·실패 retry·빈 상태·나가기
다이얼로그·무음 정리 같은 **load-bearing 로직은 실제 코드 경로** 로
검증된다. 서버측 계약(RLS/차단/소프트삭제)은 Playwright 가 아니라
Integration 계층이 *실제 Supabase* 로 검증한다 — 두 계층이 상보적.

## CI 게이트 (`.github/workflows/chat-verify.yml`)

```
lint → typecheck → unit → component → integration → e2e-web → chat-verify(집계)
```

- 각 단계는 직전 단계를 `needs:` — 하나라도 실패하면 머지 차단.
- `chat-verify` 집계 잡을 **branch protection required check** 로 지정.
- **integration 은 skip 이 아니라 실제 실행**: GitHub ubuntu 러너의
  Docker 위에 `supabase start` 로 풀 스택을 띄우고 `supabase status`
  에서 service-role 키를 주입한다. 실행 케이스 수가 0이면(전부 skip)
  게이트를 **FAIL** 시킨다 — PM 검증서의 "통합테스트 skip → 서버
  0검증" 구멍을 구조적으로 차단.

## 로컬에서 게이트 재현

```bash
pnpm verify
```

`scripts/verify.mjs` 가 CI 와 동일 순서로 돈다. 로컬에 Docker/Supabase
가 없으면 integration 단계는 `NOT-RUN-LOCALLY` 로 **정직하게 표시**되고
(통과로 위장하지 않음) CI 가 최종 강제한다. 나머지 5개 단계는 로컬에서
완전히 재현된다.

개별 실행:

```bash
pnpm --filter mobile test:e2e:web                 # Playwright (Chromium 자동 기동)
pnpm --filter mobile test:e2e:web:install         # CI/최초 1회 브라우저 설치
pnpm --filter mobile harness:web                  # 하네스만 띄워 눈으로 확인
#   → http://127.0.0.1:4317/?screen=chat-room&scenario=room-send-fail-retry
```

## testID 규칙

- E2E 셀렉터는 **`testID` 우선**. 텍스트는 i18n/카피 변경에 깨진다.
- 네이밍: `chat-<영역>-<역할>` (예: `chat-composer-send`,
  `chat-list-row-<conversationId>`, `leave-chat-confirm`).
- 새 채팅 UI 추가 시 상호작용 가능한 요소·상태 컨테이너에 testID 부여 후
  Playwright spec 또는 Maestro flow 에 assertion 추가.

## 새 채팅 기능을 올리는 절차

1. 코드 작성 시 위 결정 트리로 **테스트 계층 결정**.
2. 상호작용 요소에 `testID` 부여 (E2E 가 잡을 수 있게).
3. 해당 계층 테스트 추가 (스펙 flow 와 1:1 로 추적되게 주석에 `10-x`/`CHn` 명시).
4. `pnpm verify` 로컬 통과 확인 (integration 은 CI 가 강제).
5. PR → `chat-verify` 게이트 6단계 통과해야 머지 가능.
