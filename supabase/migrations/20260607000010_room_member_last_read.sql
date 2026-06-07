-- 20260607000010_room_member_last_read.sql
-- 방 채팅 unread 점: 사용자별 "마지막 읽음 시각" read marker.
-- last_read_at IS NULL = 아직 한 번도 채팅을 안 봄(미읽음). DEFAULT 없음 의도적.
-- mark_room_read 는 send_room_message 와 동일 패턴(authenticated grant,
-- security definer, auth.uid() 본인 + room_is_member 가드).

alter table public.room_member add column last_read_at timestamptz;

create or replace function public.mark_room_read(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.room_is_member(p_room_id, v_uid) then
    raise exception 'not_room_member' using errcode = '42501';
  end if;
  update public.room_member
    set last_read_at = now()
    where room_id = p_room_id and user_id = v_uid;
end $$;

revoke all on function public.mark_room_read(uuid) from public, anon;
grant execute on function public.mark_room_read(uuid) to authenticated;
