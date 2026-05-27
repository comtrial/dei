-- Phase 3C-2: create_group RPC 빈 배열 허용 (solo-join 지원)
--
-- 기존 가드: p_nicknames is null or array_length(p_nicknames, 1) is null
-- → 빈 배열('{}'::text[]) 도 에러로 취급해 솔로 참여 불가능.
--
-- 변경: null 만 거부. 빈 배열 → size=1 (본인만) 묶음 생성 허용.
-- array_length('{}'::text[], 1) = NULL 이므로 coalesce(…, 0) 으로 안전 처리.

create or replace function public.create_group(p_nicknames text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leader_id uuid := auth.uid();
  v_group_id  uuid;
  v_member_id uuid;
  v_size      smallint;
  v_nick      text;
begin
  if v_leader_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  -- 빈 배열(솔로 참여)은 허용. null 만 거부.
  if p_nicknames is null then
    raise exception 'nicknames must not be null (pass empty array for solo join)' using errcode = '22023';
  end if;

  -- 본인 포함 최소 1(솔로), 최대 4 (그룹 size)
  v_size := coalesce(array_length(p_nicknames, 1), 0)::smallint + 1;
  if v_size > 4 then
    raise exception 'group too large (max 4 including leader)' using errcode = '22023';
  end if;

  insert into public.groups (leader_id, size, status)
  values (v_leader_id, v_size, 'forming')
  returning id into v_group_id;

  insert into public.group_members (group_id, profile_id, role)
  values (v_group_id, v_leader_id, 'leader');

  -- 빈 배열이면 foreach 루프는 자동으로 실행되지 않음 (PG 안전)
  foreach v_nick in array p_nicknames loop
    select user_id into v_member_id
      from public.profiles
     where nickname_lower = lower(trim(v_nick))
     limit 1;

    if v_member_id is null then
      raise exception 'nickname not found: %', v_nick using errcode = 'P0002';
    end if;
    if v_member_id = v_leader_id then
      raise exception 'cannot invite self' using errcode = '22023';
    end if;

    insert into public.group_members (group_id, profile_id, role)
    values (v_group_id, v_member_id, 'member')
    on conflict (group_id, profile_id) do nothing;
  end loop;

  return v_group_id;
end;
$$;
