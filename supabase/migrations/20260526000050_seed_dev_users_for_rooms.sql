-- Dev seed — 로컬 supabase 에서 새 도메인 시나리오 테스트용 유저 6명.
--
-- 이 시드는 **로컬 환경 한정**. `supabase db reset` 이 마이그레이션 끝에
-- 호출하여 적용된다. Remote 배포 시 이 마이그레이션이 적용되면 dev 시드가
-- 들어가지만 (a) 모든 row 가 idempotent (`on conflict do nothing`),
-- (b) 이메일이 `*@example.test` 인 시드 유저만 추가하므로 운영 데이터를
-- 건드리지 않는다.
--
-- 실DB e2e (CLAUDE.md 규칙 7) 의 `e2e-*@example.test` 패턴과 충돌하지 않게
-- 시드 유저는 `seed-*@example.test` prefix 사용.

do $$
declare
  v_users record;
  v_user_id uuid;
begin
  for v_users in
    select * from (values
      ('seed-male-leader@example.test', '시드남리더', 'M', '1998-03-15'::date),
      ('seed-male-friend-1@example.test', '시드남친구1', 'M', '1998-06-20'::date),
      ('seed-male-friend-2@example.test', '시드남친구2', 'M', '1999-02-10'::date),
      ('seed-female-leader@example.test', '시드여리더', 'F', '1999-05-05'::date),
      ('seed-female-friend-1@example.test', '시드여친구1', 'M', '1998-09-12'::date),
      ('seed-female-friend-2@example.test', '시드여친구2', 'F', '2000-01-25'::date)
    ) as t(email, nickname, gender, birth_date)
  loop
    -- auth.users 에 row 가 있는지 확인
    select id into v_user_id
      from auth.users where email = v_users.email
      limit 1;

    if v_user_id is null then
      -- 로컬 supabase 의 auth.users 는 service_role 로만 insert 가능.
      -- 시드 단계에선 supabase admin context 라 가정하고 minimal insert.
      v_user_id := gen_random_uuid();
      insert into auth.users (
        id, instance_id, aud, role, email,
        email_confirmed_at, encrypted_password,
        created_at, updated_at
      )
      values (
        v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        v_users.email,
        now(),
        '$2a$10$placeholder.hash.for.seed.password.only',  -- 로그인 불가 hash (dev test 에서 password grant 안 함)
        now(), now()
      )
      on conflict (id) do nothing;
    end if;

    -- profiles upsert
    insert into public.profiles (
      user_id, nickname, gender, birth_date
    )
    values (
      v_user_id, v_users.nickname, v_users.gender, v_users.birth_date
    )
    on conflict (user_id) do update set
      nickname   = excluded.nickname,
      gender     = excluded.gender,
      birth_date = excluded.birth_date;
  end loop;

exception
  when others then
    -- 시드는 best-effort. auth.users insert 실패 등은 무시 (테스트 환경에서만
    -- 사용되고, 운영 마이그레이션 시 동일 row 가 이미 있으면 skip).
    raise notice 'seed_dev_users_for_rooms skipped due to: %', sqlerrm;
end;
$$;
