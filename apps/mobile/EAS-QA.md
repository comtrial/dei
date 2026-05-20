# Dei — EAS QA 배포판 빌드 가이드

각 QA가 **자기 폰에 실제 네이티브 빌드를 설치**해서 **원격 Supabase에 붙은
채로** 테스트하기 위한 절차. `eas build --profile preview` 기준.

> ⚠️ 핵심: `apps/mobile/lib/supabase.ts` 는 `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY`
> 가 없으면 앱 시작 즉시 throw 한다. `.env` 는 gitignore 라 EAS 클라우드
> 빌드에 안 올라간다 → 그래서 **EAS 서버의 `preview` 환경에 env 를
> 등록해뒀다** (`eas env:list preview` 로 확인 가능). 빌드 시 EAS 가
> 자동 주입하므로 git 에 anon key 가 안 남는다. `eas.json` 의
> `preview.env` 에는 `APP_ENV` 만 둔다. env 를 바꾸면 **재빌드 필수**
> (`EXPO_PUBLIC_*` 는 빌드타임 임베드).
>
> env 변경: `eas env:create preview --name <K> --value <V> --force`
> (anon key 는 `--visibility sensitive`). 절대 `eas.json` 에 다시
> 인라인하지 말 것.

## 0. 빌더 사전 준비 (보통 1명)

```bash
npm i -g eas-cli                 # 또는 pnpm dlx eas-cli
eas login                        # Expo 조직 owner: cmdsoftware_developer
cd apps/mobile && eas whoami
```

- EAS projectId `92ac4c9e-baca-479d-9c1a-a0ac7fff3617` (app.json 에 박혀 있음)
- `cmdsoftware_developer` 조직 멤버 계정으로 로그인해야 함

## 1. iOS 기기 등록 (iOS QA가 있을 때만, Android 불필요)

iOS ad-hoc 배포라 테스트 폰 UDID 를 프로비저닝에 등록해야 설치된다:

```bash
cd apps/mobile
eas device:create                # QR → iOS QA 각자 스캔 → 기기 등록
```

기기를 추가할 때마다 iOS 는 **재빌드 필요**. Android 는 이 단계 건너뜀.

## 2. 빌드

```bash
cd apps/mobile
eas build --profile preview --platform android   # apk — 링크 하나로 전원 설치
eas build --profile preview --platform ios       # 1번 기기 등록 후
# 둘 다: --platform all
```

완료 시 EAS 가 설치 페이지 URL + QR 제공. 히스토리: `eas build:list`
또는 https://expo.dev → dei → Builds.

## 3. QA 배포

| 플랫폼 | 방법 |
|---|---|
| Android | EAS 링크/QR 전달 → 폰 브라우저로 apk 다운·설치 ("알 수 없는 출처" 1회 허용) |
| iOS | 1번에서 등록한 기기에만 링크 전달 → Safari 로 설치. 미등록 기기는 설치 불가 |

QA 는 앱 켜면 원격 Supabase(`sjlzidjnpczysygnlmtk`)에 바로 연결된다.
본인인증은 `IDENTITY_BYPASS=true` 라 우회, 결제는 개발자 버튼.

## 4. 배포 전 빌더 자가검증 (CLAUDE.md 규칙 9)

본인 폰에 먼저 설치해 확인 후 QA 푸시:

- [ ] 흰 화면/크래시 없이 켜짐 (= env 주입 성공)
- [ ] 회원가입/로그인 (= 원격 Supabase 연결 + anon key 유효)
- [ ] 채팅 송수신 (= Edge Function `send-message` v5 / `leave-conversation`
      v4 원격 배포본 동작 — 규칙 9 ①③)
- [ ] Sentry 콘솔(`deai-13/react-native`, env=staging) 이벤트 수신

## 자주 막히는 곳

| 증상 | 원인 | 해결 |
|---|---|---|
| 켜자마자 크래시 | `Missing Supabase env vars` | `eas.json preview.env` 손상 여부 확인 후 재빌드 |
| iOS 설치 안 됨 | 기기 미등록 | `eas device:create` → 재빌드 |
| 채팅 "전송 실패" | Edge Function 문제 | `npx supabase functions list` 로 send-message ACTIVE 확인 |
| .env 고쳤는데 그대로 | 빌드타임 임베드 | env 변경은 항상 재빌드 |

## 보안 메모

QA 빌드용 env 는 **EAS 서버 `preview` 환경**에 보관(anon key 는
`sensitive`). 전부 **클라이언트 공개 범위**(anon key, Sentry DSN —
앱 바이너리에도 들어가는 식별자)라 git 에 안 남기는 것 외 추가
민감도는 없다. anon key 보유자는 RLS 가 허용하는 범위의 원격 dev DB
에 접근 가능 → dev DB 에 민감 실데이터를 쌓지 말 것. service_role
키·DB 비번·PortOne/RevenueCat 시크릿은 **없고 있어서도 안 된다**
(QA 빌드에 불필요). 확인: `eas env:list preview`.
