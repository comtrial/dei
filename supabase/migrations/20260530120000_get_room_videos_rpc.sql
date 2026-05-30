create or replace function public.get_room_videos(
  p_room_id uuid,
  p_hour_from smallint,
  p_hour_to   smallint
)
returns setof public.video
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.video
  where room_id  = p_room_id
    and hour_slot between p_hour_from and p_hour_to
    and status   = 'ready'
  order by hour_slot asc, created_at desc;
$$;
