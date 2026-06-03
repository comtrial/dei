-- 20260602000020_matching_helpers.sql
-- effective_priority boost + tier 판정. 명세 §4·§5.

-- 대기시간(분)으로 tier 판정 (config 기반)
create or replace function public._tier_of(p_waited_minutes int)
returns int language sql stable set search_path = public as $$
  select case
    when p_waited_minutes < public.match_cfg_int('tier1_minutes', 30) then 0
    when p_waited_minutes < public.match_cfg_int('tier2_minutes', 120) then 1
    else 2
  end;
$$;

-- effective_priority: 오래 기다릴수록 과거로 당겨 정렬 앞단에. boost_minutes 마다 한 단계.
create or replace function public._match_boost(p_enqueued_at timestamptz)
returns timestamptz language sql stable set search_path = public as $$
  select p_enqueued_at - (
    (floor(extract(epoch from (now() - p_enqueued_at)) / 60
       / public.match_cfg_int('boost_minutes', 15)))
    * (public.match_cfg_int('boost_minutes', 15) || ' minutes')::interval
  );
$$;
