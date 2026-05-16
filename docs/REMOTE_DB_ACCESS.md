# 원격 Supabase DB 접근 가이드

> 운영/스테이징 원격 Supabase DB에 직접 접속해야 할 때 (테스트 데이터 생성, 디버깅, 임시 패치 등).
> 일반 개발은 로컬 supabase 사용을 권장합니다 → [`LOCAL_DEV_DB_SETUP.md`](./LOCAL_DEV_DB_SETUP.md).

---

## 1. 사전 준비

### 1.1 필요한 정보 (Supabase Dashboard에서)

| 항목 | 값 / 위치 |
|---|---|
| Project ref | `sjlzidjnpczysygnlmtk` (`.env`의 `EXPO_PUBLIC_SUPABASE_URL`의 서브도메인) |
| Region | `ap-northeast-1` (Tokyo) — Pooler 호스트는 `aws-1-ap-northeast-1.pooler.supabase.com` |
| Database password | Dashboard → **Project Settings → Database → Reset database password**에서 신규 발급 |
| Pooler 포트 | `6543` (transaction mode, 권장) / `5432` (session mode) |
| Pooler username | `postgres.<project_ref>` ← **`postgres`가 아님**, 반드시 점 + project_ref 붙임 |

> ⚠️ **DB password는 절대 git / Slack / 문서 / 스크린샷에 평문으로 남기지 마세요.** 사용 후 즉시 rotate.

### 1.2 필요한 도구

- **Docker** (이미 설치되어 있음 - psql client만 일회성으로 띄움)
- 또는 `brew install libpq` 후 PATH에 `/opt/homebrew/opt/libpq/bin` 추가

---

## 2. 접속 방식

### 방식 A. Docker로 일회성 psql (권장)

password는 환경변수로 주입 (shell history / `ps`에 안 남게):

```bash
# password 입력받기 (입력 시 화면에 안 보임)
read -rs SUPA_PWD
export SUPA_PWD

# 단일 쿼리
docker run -i --rm postgres:16 psql \
  "postgresql://postgres.sjlzidjnpczysygnlmtk:${SUPA_PWD}@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres" \
  -c "SELECT count(*) FROM public.profiles"

# 인터랙티브 세션
docker run -it --rm postgres:16 psql \
  "postgresql://postgres.sjlzidjnpczysygnlmtk:${SUPA_PWD}@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres"

# SQL 파일 실행
docker run -i --rm -v "$PWD/somefile.sql:/tmp/q.sql" postgres:16 psql \
  "postgresql://postgres.sjlzidjnpczysygnlmtk:${SUPA_PWD}@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres" \
  -f /tmp/q.sql

# 작업 끝나면 변수 지우기
unset SUPA_PWD
```

> **왜 Direct (`db.<ref>.supabase.co:5432`)는 안 되나?**
> Supabase의 direct endpoint는 **IPv6 전용**이라 IPv4-only 네트워크나 Docker 기본 네트워크에서 `could not translate host name` 으로 실패합니다. 항상 Pooler를 쓰세요.

### 방식 B. Supabase CLI

```bash
# 최초 1회 — Dashboard에서 access token 발급 (Account → Access Tokens)
supabase login

# 프로젝트 link
supabase link --project-ref sjlzidjnpczysygnlmtk

# 원격 쿼리
supabase db remote commit  # 마이그레이션
supabase db dump --data-only  # 데이터 덤프
```

### 방식 C. Supabase Dashboard SQL Editor

가장 안전 (로컬에 password 노출 0). 일회성 / 가볍게 쓰는 용도. Dashboard → SQL Editor → 쿼리 작성 → Run.

---

## 3. 자주 쓰는 패턴

### 3.1 본인(또는 특정 유저) 찾기

```sql
-- nickname / phone 검색
SELECT u.id, u.phone, u.created_at::date AS joined,
       p.nickname, p.gender, p.region_sido
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.nickname ILIKE '%검색어%'
   OR u.phone LIKE '%010xxxx%'
   OR u.id::text LIKE '637f%'
ORDER BY u.created_at DESC
LIMIT 20;
```

### 3.2 받은 좋아요 테스트 데이터 생성

```sql
-- <self_uuid>에 4건의 pending received likes 생성
INSERT INTO public.likes (from_user_id, to_user_id, liked_at, expires_at, status, read_at, attached_log_id)
VALUES
  ('11111111-1111-1111-1111-111111111101', '<self_uuid>',  -- 민지 F 서울
   NOW() - INTERVAL '30 minutes', NOW() + INTERVAL '6 days 23 hours', 'pending', NULL, NULL),
  ('11111111-1111-1111-1111-111111111103', '<self_uuid>',  -- 지호 M 경기
   NOW() - INTERVAL '2 hours',    NOW() + INTERVAL '5 days',          'pending', NULL, NULL),
  ('11111111-1111-1111-1111-111111111106', '<self_uuid>',  -- 하늘 F 인천 (만료 임박 케이스)
   NOW() - INTERVAL '6 days 6 hours', NOW() + INTERVAL '18 hours',     'pending', NULL, NULL);
```

> `expires_at` 이 `NOW()` 보다 작으면 앱에서 안 보임 (`useLikesList.ts`의 `gt('expires_at', now)` 필터).
> 24시간 미만이면 "만료 임박" 빨간 표시 (`hoursUntil < 24`).

### 3.3 seed 유저 (auth.users + profile 모두 보유 — FK 안전)

```sql
SELECT user_id, nickname, gender, region_sido
FROM public.profiles
WHERE user_id::text LIKE '11111111-%'
ORDER BY user_id;
```

| user_id | nickname | gender | 비고 |
|---|---|---|---|
| `11111111-...-101` | 민지 | F | 서울 |
| `11111111-...-102` | 수현 | M | 서울 |
| `11111111-...-103` | 지호 | M | 경기 |
| `11111111-...-104` | 예린 | F | 서울 |
| `11111111-...-105` | 도윤 | M | 부산 |
| `11111111-...-106` | 하늘 | F | 인천 |
| `11111111-...-107` | 준서 | M | 대구 |
| `11111111-...-108` | 서아 | F | 서울 |
| `11111111-...-109` | 은우 | M | 경기 |

### 3.4 매칭 만들기 (받은 좋아요 → 수락 시뮬레이션)

```sql
-- 1) like를 accepted로 마킹
UPDATE public.likes
SET status = 'accepted', responded_at = NOW()
WHERE id = '<like_uuid>'
RETURNING from_user_id, to_user_id;

-- 2) matches 행 생성 (실제 앱은 RPC가 자동 처리. 수동 시뮬레이션 시에만)
INSERT INTO public.matches (user_a_id, user_b_id, source_like_id, matched_at)
VALUES ('<from>', '<to>', '<like_uuid>', NOW());
```

### 3.5 모든 테스트 좋아요 일괄 삭제

```sql
DELETE FROM public.likes
WHERE to_user_id = '<self_uuid>'
  AND from_user_id::text LIKE '11111111-%';
```

---

## 4. 보안 체크리스트

- [ ] 사용 후 **password rotate** (Dashboard → Reset database password)
- [ ] **환경변수로만 password 전달** — CLI 인자나 URL 평문 금지 (`ps -ef`에 노출됨)
- [ ] 작업 끝나면 `unset SUPA_PWD` + `history -c` (zsh) / `history -p` (zsh) 로 shell history 정리
- [ ] service_role key / db password를 **`.env`에 평문 커밋 금지**. 필요시 1Password 같은 secret manager
- [ ] 운영 DB에 직접 INSERT/UPDATE 전 반드시 **transaction 시뮬레이션** (`BEGIN; ... ROLLBACK;`) 또는 백업
- [ ] postgres user는 **RLS를 우회**합니다 → 의도치 않은 데이터 변경 주의

---

## 5. 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| `could not translate host name "db.xxx.supabase.co"` | Direct connection이 IPv6 only | Pooler URL로 변경 (`aws-1-ap-northeast-1.pooler.supabase.com:6543`) |
| `Tenant or user not found` | username/리전 오타 | username을 `postgres.<project_ref>` 형식으로, 리전은 Dashboard에서 확인 |
| `password authentication failed` | password 오류 또는 rotate됨 | Dashboard → Reset database password로 신규 발급 |
| `psql: command not found` | 로컬에 libpq 없음 | Docker 사용 (`docker run -i --rm postgres:16 psql ...`) |
| `relation "public.xxx" does not exist` | 마이그레이션 미적용 또는 schema 오타 | `pnpm db:gen-types`로 타입 동기화, schema 확인 |
| 쿼리는 통과하는데 폰 앱에 데이터 안 보임 | RLS 정책 / `expires_at` 만료 / `status` 불일치 | `useLikesList.ts` 같은 hook의 쿼리 조건 확인 |

---

## 6. 참고

- 로컬 dev DB: [`LOCAL_DEV_DB_SETUP.md`](./LOCAL_DEV_DB_SETUP.md)
- DB 스키마 전체: [`DB_스키마.md`](./DB_스키마.md)
- 환경변수 명세: [`tech-stack.md`](./tech-stack.md), `apps/mobile/.env.example`
