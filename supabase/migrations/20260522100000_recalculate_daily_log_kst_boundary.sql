-- Keep daily-log recalculation aligned with the product date boundary.
-- Callers pass a KST date, so counting must use the same KST date instead of
-- UTC midnight boundaries.

create or replace function public.recalculate_daily_log_for_date(
  p_user_id uuid,
  p_log_date date
)
returns public.daily_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_distinct_hours int;
  v_total_logs int;
  v_row public.daily_logs;
begin
  select
    count(distinct hour_slot),
    count(*)
  into v_distinct_hours, v_total_logs
  from public.logs
  where user_id = p_user_id
    and (recorded_at at time zone 'Asia/Seoul')::date = p_log_date;

  if v_total_logs = 0 then
    delete from public.daily_logs
     where user_id = p_user_id
       and log_date = p_log_date;
    return null;
  end if;

  insert into public.daily_logs (user_id, log_date, status, updated_at)
  values (
    p_user_id,
    p_log_date,
    case when v_distinct_hours >= 3 then 'COMPLETED' else 'INCOMPLETE' end,
    now()
  )
  on conflict (user_id, log_date) do update
  set status = excluded.status,
      updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.recalculate_daily_log_for_date(uuid, date) from public;
grant execute on function public.recalculate_daily_log_for_date(uuid, date) to authenticated;
