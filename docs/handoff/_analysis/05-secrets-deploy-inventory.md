Confirmed — all consistent. Here is the complete inventory.

# dei 민감정보 / 배포 파이프라인 인벤토리 (값 전량 마스킹, 위치만)

## (1) EXPO_PUBLIC_* 환경변수 키 목록
파일: `/Users/susan/personal/dei/apps/mobile/.env` (gitignore됨, not-tracked) / `/Users/susan/personal/dei/apps/mobile/.env.example` (git TRACKED, 템플릿)

`.env` 실제 = **12종** (task 가 말한 "13종"보다 1 적음). `.env.example` 템플릿 = **14종** (HEART 2종 추가). 즉 둘 사이 드리프트 존재.

| 키 | .env | .env.example | 분류 |
|---|---|---|---|
| EXPO_PUBLIC_SUPABASE_URL | O | O | Supabase (public) |
| EXPO_PUBLIC_SUPABASE_ANON_KEY | O | O | Supabase anon (public) |
| EXPO_PUBLIC_SENTRY_DSN | O | O | Sentry |
| EXPO_PUBLIC_SENTRY_ENV | O | O | Sentry env 라벨 |
| EXPO_PUBLIC_POSTHOG_KEY | O | O | PostHog |
| EXPO_PUBLIC_POSTHOG_HOST | O | O | PostHog |
| EXPO_PUBLIC_REVENUECAT_IOS_API_KEY | O | O | RevenueCat iOS |
| EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY | O | O | RevenueCat Android |
| EXPO_PUBLIC_REVENUECAT_REFRESH_OFFERING_ID | O | O | RevenueCat offering |
| EXPO_PUBLIC_REVENUECAT_REFRESH_PRODUCT_ID | O | O | RevenueCat product |
| EXPO_PUBLIC_ENABLE_DEV_IDENTITY_BYPASS | O | O | dev 우회 플래그 |
| EXPO_PUBLIC_ENABLE_DEV_PAYMENT_BYPASS | O | O | dev 우회 플래그 |
| EXPO_PUBLIC_REVENUECAT_HEART_OFFERING_ID | **없음** | O | RevenueCat (템플릿에만) |
| EXPO_PUBLIC_REVENUECAT_HEART_PRODUCT_ID | **없음** | O | RevenueCat (템플릿에만) |

드리프트: 템플릿(.env.example)에는 `REVENUECAT_HEART_OFFERING_ID` / `REVENUECAT_HEART_PRODUCT_ID` 2종이 있으나 실제 `.env`에는 없음. ver2 핸드오프 시 둘 중 하나로 정합 필요(HEART 상품 폐기됐으면 example 에서 제거, 살아있으면 .env 에 추가).
모든 키 `EXPO_PUBLIC_*` = 빌드타임 임베드 → 변경 시 재빌드 필수(CLAUDE.md 9-②). anon key 는 RLS 전제 public 값이라 비밀은 아니나 URL/DSN/PostHog/RevenueCat 키는 .env 에만.

## (2) Expo / app.json
주의: repo 루트 `/Users/susan/personal/dei/app.json` 은 빈 스텁(`{"expo":{}}`, not-tracked). **실제 설정은 `/Users/susan/personal/dei/apps/mobile/app.json` (git TRACKED)**.

- EAS projectId: `92ac4c9e-baca-479d-9c1a-a0ac7fff3617` (`extra.eas.projectId`)
- owner: `cmdsoftware_developer`
- slug: `mobile`
- scheme: `dei`
- iOS bundleIdentifier: `kr.cmdsoftware.dei`
- Android package: `kr.cmdsoftware.dei`
- name: `Dei`, version: `1.0.0`
- updates URL: **없음** — `updates` / `runtimeVersion` / `channel` 블록 미설정. 즉 EAS Update(OTA) 미구성 상태(빌드 배포만, OTA 핫픽스 경로 없음).
- 기타 민감 관련: plugins 에 `@sentry/react-native`, `@portone/react-native-sdk`(PG 결제) 포함. Android permissions: BILLING/CAMERA/RECORD_AUDIO.

## (3) eas.json 빌드 프로파일
파일: `/Users/susan/personal/dei/apps/mobile/eas.json` (git TRACKED). cli `appVersionSource: "remote"`.

| 프로파일 | APP_ENV | distribution | 비고 |
|---|---|---|---|
| development | `development` | internal | developmentClient: true |
| preview | `staging` | internal | `environment: "preview"`, ios.simulator=false, android.buildType=apk |
| production | `production` | (store) | autoIncrement: true |

- submit: `production` 프로파일만 정의(내용 비어있음).
- **OTA 채널 유무: 없음.** 어떤 프로파일에도 `channel` 키 없음 → EAS Update 채널 미연결(app.json 의 updates 미설정과 일관). ver2 에서 OTA 쓰려면 `channel`(eas.json) + `updates`/`runtimeVersion`(app.json) 둘 다 추가 필요.
- 참고: `development`/`production` 은 `env.APP_ENV` 만, `preview` 는 `env.APP_ENV: staging` + 별도 `environment: "preview"`(EAS env 그룹) 혼용 — APP_ENV(staging) ≠ EAS environment(preview) 라벨 불일치, ver2 정리 후보.

## (4) 로컬 비밀 저장소 (위치만, 값 절대 비출력)
- `~/.dei/secrets.env` (perm `600`, repo 밖) — 키: `DEI_SUPABASE_URL`, `DEI_SUPABASE_REF`, `DEI_ANON_KEY`, `DEI_SERVICE_ROLE_KEY`, `DEI_DB_URL`, `DEI_GH_TOKEN`, `SR_KEY`. (`source` 해서 사용)
- `~/.claude/settings.json` 의 `env` — 등록 키: `DEI_SUPABASE_URL`, `DEI_SUPABASE_REF`, `DEI_ANON_KEY`, `DEI_SERVICE_ROLE_KEY`, `SR_KEY`. (`DEI_DB_URL`, `DEI_GH_TOKEN` 은 secrets.env 에만 있고 settings.json 엔 미등록 — 차이점.)
- 정합성 확인(값 미출력): `DEI_SUPABASE_REF` == `sjlzidjnpczysygnlmtk` MATCH, `.env` 의 `EXPO_PUBLIC_SUPABASE_URL` 호스트 ref == `sjlzidjnpczysygnlmtk` MATCH. 세 출처(secrets.env / settings.json / mobile .env) 모두 동일 프로젝트 ref 가리킴.
- 민감도: `DEI_SERVICE_ROLE_KEY`, `SR_KEY`, `DEI_DB_URL`(DB 직결 문자열), `DEI_GH_TOKEN` = **최고위험(RLS 우회/풀권한)**, 절대 앱/repo/EXPO_PUBLIC 에 노출 금지 — 로컬·CI secret 에만.

## (5) release/dei-ver2 핸드오프 민감정보 전달 규약 (초안)
1. **repo 에는 키 "이름"만, 값은 0개.** `apps/mobile/.env.example`(TRACKED)를 단일 키 목록 SSOT 로 유지. 위 (1) 드리프트(HEART 2종) 먼저 해소 후 ver2 로 가져갈 것 — example 14종/실제 12종을 일치시켜 "EXPO_PUBLIC 13종" 같은 모호한 카운트 방지.
2. **실값 전달 경로 2채널, repo 우회:**
   - 앱 빌드타임용 public 12~14종 → 신규 워크스페이스의 `apps/mobile/.env` 에 수기/안전채널(1Password 등) 복사. git `.gitignore` 에 `.env`(루트), `apps/mobile/.gitignore` 에 `.env*.local` 이미 존재 — `.env` 자체가 무시되는지 ver2 에서 재확인(현재 mobile/.gitignore 는 `.env*.local` 만 있어 `.env` 는 루트 `.gitignore` 의 `.env` 패턴에 의존).
   - 서버/관리자용 service_role·DB_URL·GH_TOKEN·SR_KEY → `~/.dei/secrets.env`(perm 600) 그대로 공유, repo 밖 유지. `source ~/.dei/secrets.env` 패턴 동일 사용. 추가로 `~/.claude/settings.json env` 에도 동일 5종 동기화(현 차이: DB_URL/GH_TOKEN 미등록 — 필요 시 추가).
3. **커밋 금지 목록 명문화(ver2 CLAUDE.md 또는 PR 체크):** 절대 커밋 금지 = `apps/mobile/.env`, `~/.dei/secrets.env`, service_role/anon 외 일체 토큰, Sentry `SENTRY_AUTH_TOKEN`. 허용 커밋 = `.env.example`, `app.json`, `eas.json`(채널/projectId 만, 시크릿 없음).
4. **빌드타임 임베드 주의 전달:** `EXPO_PUBLIC_*` 변경 = 재빌드 필요(실행 중 앱은 옛 백엔드 봄, CLAUDE.md 9-②). ver2 에서 Supabase 프로젝트를 새로 파면 URL/anon/service_role/REF/DB_URL 5출처(.env, .env.example 주석, secrets.env, settings.json, eas env) 전부 갱신 + 재빌드.
5. **OTA 미구성 인지:** 현재 app.json/eas.json 모두 updates·channel 없음. ver2 가 EAS Update 도입 시 `channel`(eas.json profile)·`updates.url`+`runtimeVersion`(app.json) 신규 추가 — 이때 채널명도 시크릿 아님(커밋 가능).
6. **검증 게이트:** ver2 전환 후 `pnpm smoke:sentry`(DSN 임베드 확인) + Supabase ref 정합(secrets/settings/.env 세 출처 동일 ref) + `git ls-files`로 `.env`/`secrets.env` non-tracked 재확인을 핸드오프 체크리스트로.

참고 파일 경로(모두 절대경로): `/Users/susan/personal/dei/apps/mobile/.env`, `/Users/susan/personal/dei/apps/mobile/.env.example`, `/Users/susan/personal/dei/apps/mobile/app.json`(실제 Expo config), `/Users/susan/personal/dei/app.json`(빈 스텁), `/Users/susan/personal/dei/apps/mobile/eas.json`, `/Users/susan/.dei/secrets.env`, `/Users/susan/.claude/settings.json`.