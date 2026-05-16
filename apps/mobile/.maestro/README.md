# Maestro E2E

End-to-end flows that drive a real iOS simulator or Android emulator with the
mobile app installed.

## Local

1. 빌드된 앱이 시뮬레이터/에뮬레이터에 설치돼 있어야 합니다.
   ```bash
   pnpm --filter mobile ios     # 또는 android
   ```
2. Maestro CLI 설치 (한 번만):
   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```
3. 플로우 실행:
   ```bash
   pnpm --filter mobile test:e2e                          # 전체
   maestro test apps/mobile/.maestro/flows/sign-in.yaml    # 단일
   ```

## 플로우 목록

| 파일 | 스펙 | 검증 funnel |
|---|---|---|
| `sign-in.yaml` | (auth) | OTP 로그인 happy path |
| `chat-10a-entry-gate.yaml` | 10-A / CH0 | 채팅 진입 단일 게이트 통과 → CH2 |
| `chat-10b-list-to-room.yaml` | 10-B / CH1→CH2 | DM 탭 → 목록 → 행 tap → 채팅방 |
| `chat-10e-send-message.yaml` | 10-E / CH2 | 컴포저 입력 → 전송 → 버블 확정 |

> 채팅 flow 들은 로그인+온보딩 완료 + 매칭/대화 1건 이상 시드 상태를
> 전제한다 (없으면 CH3 빈 상태로 분기). 실패 retry·차단·종료 같은
> 비결정/부작용 경로의 *결정적* 검증은 Playlight(e2e-web) + Vitest
> integration 이 담당하고, Maestro 는 네이티브 happy-path funnel 만 본다.
> 계층 분담 근거: `apps/mobile/e2e/README.md`.

## CI

`.github/workflows/e2e.yml` 가 EAS preview 빌드를 트리거한 뒤 Maestro Cloud
로 결과 아티팩트와 영상을 업로드합니다. CI 에 `MAESTRO_CLOUD_API_KEY`
secret 필요.

## 작성 가이드

- 셀렉터는 `id:` (testID prop) 우선, fallback 으로 `text:`. 텍스트만 의존하면
  i18n 변경 시 깨집니다.
- 새 플로우는 `flows/<feature>.yaml` 로 추가하고 README 의 목록에 등록.
- 플로우는 가능한 작게 — 큰 시나리오 1개보다 작은 시나리오 여러 개가 디버깅
  쉬움.
