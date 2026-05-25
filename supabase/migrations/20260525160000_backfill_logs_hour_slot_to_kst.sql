-- Backfill: logs.hour_slot 의 UTC→KST 정합성 복원
--
-- 배경:
--   2026-05-23 머지된 finalize-log Edge Function 이관 시 hour_slot 계산을 실수로
--   `recordedAt.getUTCHours()` 로 작성. 클라이언트 조회 측 (useTodayClip,
--   useTodayLogs, useProfileFeed 등) 은 모두 폰 로컬 시계(KST)로 hour_slot 을
--   비교하므로 mismatch 발생:
--     - "이미 OO시에 촬영된 로그가 있습니다" overwrite dialog 가 안 뜸
--     - 같은 KST 시 슬롯에 중복 row 누적 (cleanup select 도 mismatch)
--     - 프로필/홈에서 시간 표시가 9시간 어긋남 (한국 사용자 한정 사실상 항상)
--
--   Edge Function 자체는 동일 머지에서 KST 기준으로 수정 + 재배포. 본 마이그레이션은
--   이관 후 잘못 박힌 기존 row 의 hour_slot 만 복원한다.
--
-- 안전성:
--   - WHERE 조건이 "hour_slot 이 recorded_at 의 UTC hour 와 정확히 일치하면서
--     KST hour 와는 다른 row" 만 잡아 finalize-log 버그로 발생한 row 만 정확히
--     타겟. 의도적으로 다른 hour_slot 으로 채워진 row (테스트/seed) 는 영향 없음.
--   - 영향 row 수는 현재 1 (배포 시점 기준). 본 마이그레이션 자체는 멱등.
--
-- 후속:
--   - daily_log 집계는 hour_slot 분포에 의존 (KST 자정 경계 + distinct hour_slot
--     count). 영향 받은 user 들에 한해 recalculate_daily_log 를 호출해 동기화.

-- UPDATE 의 RETURNING 으로 실제 영향 받은 user_id 를 임시 테이블에 모은 후
-- 그 user 들만 재계산. 모든 user 를 돌리는 건 비용/부수효과(rpc 의 다른 side
-- effect 가 생기면 무관한 user 까지 영향) 측면에서 회피.
create temp table _backfilled_users (user_id uuid primary key) on commit drop;

with updated as (
  update public.logs
  set hour_slot = extract(hour from recorded_at at time zone 'Asia/Seoul')::int
  where hour_slot = extract(hour from recorded_at)::int
    and hour_slot <> extract(hour from recorded_at at time zone 'Asia/Seoul')::int
  returning user_id
)
insert into _backfilled_users (user_id)
select distinct user_id from updated
on conflict do nothing;

-- 영향 받은 user 만 일별 집계 재계산. recalculate_daily_log 는 security definer +
-- 본인 row 전수 재집계라 idempotent.
do $$
declare
  uid uuid;
begin
  for uid in select user_id from _backfilled_users loop
    perform public.recalculate_daily_log(uid);
  end loop;
end;
$$;
