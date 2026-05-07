# 로컬 개발 DB 셋업 가이드

> 로컬에서 홈 화면(H2/H3)을 테스트하려면 아래 순서대로 실행하세요.

---

## 1. Supabase 로컬 시작 & 마이그레이션 적용

```bash
pnpm db:start   # 처음 실행하는 경우
pnpm db:reset   # 마이그레이션 전체 적용 + seed.sql 실행
```

`pnpm db:reset` 은 아래 마이그레이션을 순서대로 적용합니다:

| 파일 | 내용 |
|------|------|
| `20260425090000_eligibility_safety_foundation.sql` | 기본 인증/계정 테이블 |
| `20260501000000_local_dev_skip_onboarding.sql` | 로컬 온보딩 스킵 함수 |
| `20260503000001_create_logs_table.sql` | `logs`, `daily_logs` 테이블 |
| `20260503000002_create_curation_pool.sql` | `curation_pool` 테이블 |
| `20260503000003_likes_and_pool_rls.sql` | `likes` 테이블 + RLS 정책 |

---

## 2. H2 테스트 데이터 삽입

큐레이션 카드 3장(H2 화면) 확인을 위해 테스트 유저와 로그를 삽입합니다.

```bash
supabase db query --file supabase/seed_h2_test.sql
```

삽입 내용:

| 구분 | 이름 | 성별 | 설명 |
|------|------|------|------|
| 큐레이션 유저 | 민준 | M | curation_pool 등록 (어제/오늘 날짜) |
| 큐레이션 유저 | 지현 | F | curation_pool 등록 (어제/오늘 날짜) |
| 큐레이션 유저 | 서연 | F | curation_pool 등록 (어제/오늘 날짜) |
| 내 로그 (dev) | 승태 | M | 새벽+오전 2건 → 로그 미완성 상태 |

> **참고**: 풀 날짜는 정오(12:00) 기준으로 달라집니다.
> - 오전(~11:59) → 어제 날짜 풀 조회
> - 오후(12:00~) → 오늘 날짜 풀 조회
>
> `seed_h2_test.sql` 은 어제/오늘 양쪽 날짜에 모두 삽입하므로 시간대 무관하게 테스트 가능합니다.

---

## 3. H2 화면 상태별 테스트

### H2-A (로그 미완성 — 영상 미표시)

삽입 직후 상태입니다. 로그가 2개(새벽+오전)라 미완성 → 빈 화면 + B2 배너 표시.

### H2-B (로그 완성 — 카드 3장 표시 + 좋아요 활성)

낮 시간대 로그를 추가 삽입하면 완성(3/3)이 되어 카드가 보입니다:

```bash
supabase db query "
INSERT INTO public.logs (user_id, video_url, hour_slot, duration_sec, "검수_YN", "검수_상태", recorded_at)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  '', 14, 2, 'N', 'PENDING',
  '$(date -u +%Y-%m-%d)T14:00:00+00'
);"
```

---

## 4. 영상 재생 테스트 (샘플 영상 업로드)

카드에서 실제 영상을 재생하려면 Supabase Storage에 파일을 업로드해야 합니다.

### 4-1. logs 버킷 생성

```bash
SERVICE_KEY=$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d'"' -f2)

curl -X POST "http://127.0.0.1:54321/storage/v1/bucket" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"logs","name":"logs","public":true}'
```

### 4-2. 영상 파일 업로드

```bash
SERVICE_KEY=$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d'"' -f2)

curl -X POST "http://127.0.0.1:54321/storage/v1/object/logs/test/sample.mp4" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: video/mp4" \
  --data-binary @"/path/to/your/video.mp4"
```

### 4-3. curation_pool video_path 업데이트

```bash
supabase db query "
UPDATE public.curation_pool
SET video_path = 'test/sample.mp4'
WHERE pool_date IN (
  CURRENT_DATE,
  CURRENT_DATE - INTERVAL '1 day'
);"
```

---

## 5. 데이터 초기화

처음부터 다시 시작하려면:

```bash
pnpm db:reset
```

마이그레이션이 재적용되고 seed.sql 의 dev 유저(`dev@dei.local`)만 남습니다. 이후 2~4번 단계를 다시 진행하세요.

---

## 로컬 개발 계정

| 항목 | 값 |
|------|-----|
| 이메일 | `dev@dei.local` |
| 비밀번호 | `dei-local-dev-password` |
| UUID | `00000000-0000-4000-8000-000000000001` |
