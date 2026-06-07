# dei iOS — EAS 빌드·제출 명령 cheat sheet

App Store(iOS) 제출까지의 명령 순서다. **표시된 단계는 사람이 직접 실행**한다
(Apple/Expo 로그인·2FA·인증서 동의가 필요해 자동화/대리 실행 불가).

대상 앱 정보
- bundleIdentifier: `kr.cmdsoftware.dei`
- EAS projectId: `92ac4c9e-baca-479d-9c1a-a0ac7fff3617`
- EAS owner: `cmdsoftware_developer`
- 작업 디렉토리: `/Users/susan/personal/dei/apps/mobile` (아래 모든 `eas` 명령은 여기서 실행)
- eas-cli: 설치 완료 (`eas --version` → `eas-cli/20.1.0`)

---

## 0. 사전 준비 (사람)

### 0-1. App Store Connect 앱 레코드 생성 (사람)
- https://appstoreconnect.apple.com → My Apps → `+` → New App
- Platform: iOS / Bundle ID: `kr.cmdsoftware.dei` (목록에 없으면 0-2 먼저)
- 생성 후 **앱의 "Apple ID"(숫자)** 를 메모 → 이게 `ascAppId` 다.

### 0-2. Apple Developer 콘솔 — Push Notifications capability 등록 (사람, ★중요)
- app.json 에서 `withoutApsEnvironment` 플러그인이 제거되어
  **빌드에 `aps-environment` entitlement 가 다시 포함**된다.
- 따라서 bundle id `kr.cmdsoftware.dei` 에 **Push Notifications capability 가
  켜져 있어야** 빌드 서명/프로비저닝이 성공한다.
  - https://developer.apple.com → Certificates, Identifiers & Profiles →
    Identifiers → `kr.cmdsoftware.dei` → Capabilities → **Push Notifications 체크 → Save**
- 또는 아래 `eas credentials` 가 capability/프로비저닝을 자동 동기화하도록 둘 수도 있으나,
  **Apple 콘솔에서 capability 가 꺼져 있으면 동기화도 실패**할 수 있으니
  콘솔에서 한 번 켜 두는 걸 권장.

---

## 1. eas login (사람 — Expo 계정 인증)
```bash
cd /Users/susan/personal/dei/apps/mobile
eas login          # Expo 계정(cmdsoftware_developer 접근 권한) 로그인. 사람 직접.
eas whoami         # 로그인 확인
```

## 2. 프로덕션 env 가 EAS 서버에 등록됐는지 확인 (사람)
> EAS **클라우드 빌드는 로컬 `.env` 를 읽지 않는다.** `eas.json` 의 빌드 프로파일
> `env` + **EAS 서버에 등록된 env** 만 사용한다. `EXPO_PUBLIC_*` 는 빌드타임에
> 바이너리로 임베드되므로, 값 변경 시 **재빌드 필수**.
```bash
eas env:list production        # production 환경에 등록된 키 확인 (사람)
```
production 빌드에 **반드시 임베드돼야 하는 EXPO_PUBLIC_* 키** (없으면 EAS 서버에 등록):
- `EXPO_PUBLIC_SUPABASE_URL` (원격 프로덕션: `https://sjlzidjnpczysygnlmtk.supabase.co`)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_POSTHOG_KEY` (`phc_...`) / `EXPO_PUBLIC_POSTHOG_HOST` (`https://us.i.posthog.com`)
- `EXPO_PUBLIC_SENTRY_DSN` / `EXPO_PUBLIC_SENTRY_ENV` (**production 빌드에선 `production` 으로 등록 — 로컬 `.env` 는 `development` 임**)
- (RevenueCat 실결제 붙이면) `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` 등

등록 예시 (값은 사람이 채움):
```bash
eas env:create production --name EXPO_PUBLIC_SUPABASE_URL --value "https://sjlzidjnpczysygnlmtk.supabase.co" --visibility plaintext
eas env:create production --name EXPO_PUBLIC_SENTRY_ENV --value "production" --visibility plaintext
# ...나머지 키 동일 패턴
```
> ★ 절대 production 에 `EXPO_PUBLIC_ENABLE_DEV_IDENTITY_BYPASS` /
> `EXPO_PUBLIC_ENABLE_DEV_PAYMENT_BYPASS` 를 등록하지 말 것 (dev 우회 플래그).
> 로컬 `.env` 에는 `..._IDENTITY_BYPASS=true` 로 있지만 **로컬 `.env` 는
> 클라우드 빌드에 안 들어가므로** 그대로 둬도 production 빌드엔 영향 없다.
> (단, 로컬 `eas build --local` 을 쓸 경우엔 로컬 env 가 섞일 수 있으니 그땐 주의.)

## 3. iOS 자격증명 설정 (사람 — Apple 로그인/2FA)
```bash
eas credentials -p ios
```
- Distribution Certificate / Provisioning Profile 생성·동기화.
- **Push capability 포함 프로비저닝**이 만들어지는지 확인 (0-2 의 capability 가 켜져 있어야 함).
- "Push Notifications" 관련 키(APNs Key) 동기화 프롬프트가 나오면 진행.

## 4. preview 빌드로 실기 검증 (사람)
```bash
eas build -p ios --profile preview
```
- internal distribution(.ipa). TestFlight 없이 등록 기기에 설치해 실기 점검.
- 빌드 완료 후 QR/링크로 디바이스 설치 → 핵심 플로우(로그인·매칭·채팅·결제) 확인.

## 5. production 빌드 (사람)
```bash
eas build -p ios --profile production
```
- App Store 제출용 빌드. `autoIncrement: true` 라 빌드 번호 자동 증가.
- `appVersionSource: remote` 이므로 버전은 EAS 가 관리.

## 6. App Store 자동 제출 (사람)
> 사전 조건: 0-1 에서 만든 `ascAppId` 를 **`eas.json` 의
> `submit.production.ios.ascAppId`** 에 채워야 한다 (현재 placeholder).
```bash
eas submit -p ios --profile production
```
- `eas.json` 에 `appleId` / `appleTeamId` 가 placeholder 면 **인터랙티브로
  자격증명을 물어본다**(App Store Connect API Key 방식 권장 — 더 안전).
  API Key(.p8 + Key ID + Issuer ID) 를 쓰면 `appleId`/2FA 없이 제출 가능.
- 가장 최근 production 빌드를 골라 App Store Connect 에 업로드.

---

## eas.json 에 사람이 채워야 할 placeholder
현재 `apps/mobile/eas.json` → `submit.production.ios`:
| 필드 | 채울 값 | 출처 |
|------|---------|------|
| `ascAppId` | `REPLACE_ME_ASC_APP_ID` | App Store Connect 앱의 "Apple ID"(숫자) — 0-1 |
| `appleId` | `REPLACE_ME_APPLE_ID_EMAIL` | Apple 계정 이메일 (API Key 방식이면 생략 가능) |
| `appleTeamId` | `REPLACE_ME_APPLE_TEAM_ID` | Apple Developer Team ID (10자 영숫자) |

> 권장: `appleId`/`appleTeamId` 대신 **App Store Connect API Key** 사용.
> `eas submit` 이 인터랙티브로 API Key(.p8) 경로를 물어보면 그걸 쓰는 게 2FA 없이 안전하다.
> 최소한 `ascAppId` 만이라도 미리 채워두면 제출이 매끄럽다.

---

## 요약: "사람이 직접 실행" 명령 (인증·2FA·Apple 동의 필요)
1. App Store Connect 앱 레코드 생성 → `ascAppId` 확보
2. Apple Developer 콘솔에서 `kr.cmdsoftware.dei` **Push Notifications capability ON**
3. `eas login` / `eas whoami`
4. `eas env:list production` (+ 누락 키 `eas env:create`)
5. `eas credentials -p ios`
6. `eas build -p ios --profile preview` (실기 검증)
7. `eas build -p ios --profile production`
8. `eas.json` 에 `ascAppId` 등 placeholder 채우기
9. `eas submit -p ios --profile production`
