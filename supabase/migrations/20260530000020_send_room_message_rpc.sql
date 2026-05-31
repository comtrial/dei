-- 20260530000020_send_room_message_rpc.sql
-- S13a 메시지 전송 RPC (Edge의 폴백 + 트랜잭션 단일 경로). authenticated grant,
-- 내부 auth.uid()=발신자. 반드시 supabaseAsUser(user JWT)로 호출(service_role 호출 시 auth.uid()=NULL -> 거절).
-- 글자수=code point(char_length), 귓속말 가드(self/active/block) 서버 재검증.

create or replace function public.send_room_message(
  p_room_id uuid,
  p_body text,
  p_whisper_to_user_id uuid default null,
  p_client_msg_id uuid default null
) returns public.message
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(p_body);
  v_msg public.message;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.room_is_member(p_room_id, v_uid) then
    raise exception 'not_room_member' using errcode = '42501';
  end if;
  if not exists (select 1 from public.room r where r.id = p_room_id and r.status = 'active') then
    raise exception 'room_not_active' using errcode = 'P0002';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 500 then
    raise exception 'body_length' using errcode = '22001';
  end if;
  if p_whisper_to_user_id is not null then
    if p_whisper_to_user_id = v_uid then
      raise exception 'invalid_whisper_target:self' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.room_member rm
      where rm.room_id = p_room_id and rm.user_id = p_whisper_to_user_id and rm.status = 'active'
    ) then
      raise exception 'invalid_whisper_target:not_member' using errcode = '22023';
    end if;
    if public.is_blocked_between(v_uid, p_whisper_to_user_id) then
      raise exception 'invalid_whisper_target:blocked' using errcode = '22023';
    end if;
  end if;

  insert into public.message (room_id, user_id, body, whisper_to_user_id, client_msg_id, status)
  values (p_room_id, v_uid, v_body, p_whisper_to_user_id, p_client_msg_id, 'sent')
  on conflict (room_id, user_id, client_msg_id) where client_msg_id is not null
  do nothing
  returning * into v_msg;

  if v_msg.id is null then
    -- 멱등 충돌: 기존 행 반환
    select * into v_msg from public.message
      where room_id = p_room_id and user_id = v_uid and client_msg_id = p_client_msg_id;
  elsif p_whisper_to_user_id is not null then
    insert into public.message_mention (message_id, user_id)
    values (v_msg.id, p_whisper_to_user_id)
    on conflict do nothing;
  end if;

  return v_msg;
end $$;

revoke all on function public.send_room_message(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.send_room_message(uuid, text, uuid, uuid) to authenticated;
