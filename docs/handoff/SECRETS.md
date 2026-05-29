# 민감정보 / 배포 전달 체크리스트 (값 0개 — 위치·규약만)

> release/dei-ver2 핸드오프. **이 문서에 실제 시크릿 값은 절대 적지 않는다.**
> 키 이름·저장 위치·전달 규약만. 근거: spec §8, 분석 `_analysis/05-secrets-deploy-inventory.md`.

---

## 1. 식별자 (repo 에 들어가도 되는 비-시크릿)

`apps/mobile/app.json` · `apps/mobile/eas.json` 에 커밋돼 있다(시크릿 아님).

| 항목 | 값 위치 |
|---|---|
| EAS projectId | `app.json` extra.eas.projectId (`92ac4c9e-…`) |
| owner / slug / scheme | `app.json` (`cmdsoftware_developer` / `mobile` / `dei`) |
| bundleId / package | `kr.cmdsoftware.dei` |
| Supabase ref | `sjlzidjnpczysygnlmtk` (supabase/.temp, secrets.env) |
| OTA updates URL / runtimeVersion | `app.json` updates·runtimeVersion (Phase 1 에서 추가됨) |
| EAS 채널 | `eas.json` 각 프로파일 channel (development/preview/production) |

---

## 2. 빌드타임 public 키 (`EXPO_PUBLIC_*`)

- **SSOT(키 목록) = `apps/mobile/.env.example`** (git TRACKED, 값은 플레이스홀더).
- 실값 = `apps/mobile/.env` (**gitignore, 커밋 금지**). 안전채널(1Password 등)로만 공유.
- ⚠️ **빌드타임 임베드**: `EXPO_PUBLIC_*` 는 빌드 시 번들에 박힌다. 변경 시
  **재빌드 필수** — 실행 중 앱은 옛 값(옛 백엔드)을 본다 (CLAUDE.md 규칙 9-②).
- ⚠️ **HEART 드리프트(분석 05 지적)**: `.env.example` 의
  `EXPO_PUBLIC_REVENUECAT_HEART_OFFERING_ID/PRODUCT_ID` 2종이 실제 `.env` 에
  없을 수 있다. dei-ver2 는 결제=후속(B·D-12)이라 RevenueCat 키 전반이
  *참고용* 이다. 결제 도입 담당이 example↔.env 를 정합시킬 것.

> anon key 는 RLS 전제의 public 값이라 비밀은 아니지만, 그래도 `.env` 로만 둔다.

---

## 3. 서버/관리자용 시크릿 (repo 밖, 최고위험)

`~/.dei/secrets.env` (perm 600, `source` 해서 사용). repo·앱·`EXPO_PUBLIC_*` 에 **절대 노출 금지**.

| 키 | 비고 |
|---|---|
| `DEI_SUPABASE_URL` / `DEI_SUPABASE_REF` / `DEI_ANON_KEY` | 프로젝트 식별 |
| `DEI_SERVICE_ROLE_KEY` / `SR_KEY` | **RLS 우회 풀권한** — CI secret·로컬만 |
| `DEI_DB_URL` | DB 직결 문자열 — 최고위험 |
| `DEI_GH_TOKEN` | GitHub 토큰 |

`~/.claude/settings.json` env 에도 일부 동기화(`DB_URL`/`GH_TOKEN` 은 secrets.env 에만).

---

## 4. 절대 커밋 금지 목록

```
apps/mobile/.env          (실 public 값)
~/.dei/secrets.env        (service_role/DB_URL/GH_TOKEN)
service_role / SR_KEY     (어떤 형태로든)
SENTRY_AUTH_TOKEN         (소스맵 업로드용 CI 전용)
```

허용 커밋 = `.env.example`(값 0) · `app.json` · `eas.json`(채널/projectId, 시크릿 0).

---

## 5. 핸드오프 검증 체크리스트

- [ ] `git ls-files | grep -E '\.env$|secrets\.env'` → **0건** (시크릿 비추적 확인)
- [ ] Supabase ref 정합: `.env` URL host · `~/.dei/secrets.env` `DEI_SUPABASE_REF` ·
      `supabase/.temp` 세 출처가 모두 `sjlzidjnpczysygnlmtk`
- [ ] `pnpm smoke:sentry` → `environment=smoke-test` 1건 발송 확인 (DSN 임베드 검증)
- [ ] 새 Supabase 프로젝트로 갈 경우: URL/anon/service_role/REF/DB_URL 5출처
      (`.env`, `.env.example` 주석, `secrets.env`, `settings.json`, EAS env) 전부 갱신 + **재빌드**
- [ ] OTA 채널 변경 시 `eas.json` channel ↔ `app.json` updates 정합 (채널명은 시크릿 아님)
