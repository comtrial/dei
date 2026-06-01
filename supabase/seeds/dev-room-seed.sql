-- dev seed: 더미 7명 + room 1 + room_member 7 + video (storage 없는 placeholder)
-- 실행: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seeds/dev-room-seed.sql
-- 또는: supabase db reset (전 마이그레이션 + 이 시드 한꺼번에 — 단 config.toml 의 sql_paths 갱신 필요)
--
-- 본인 user_id 추가는 supabase/seeds/dev-room-join-self.sql 참조.
-- 더미는 로그인 안 함 (auth.users 최소 컬럼만). 본인은 별도 가입 후 join.

begin;

-- 0) 기존 dev 시드 정리 (재실행 가능하게)
delete from public.video where room_id in (
  select id from public.room where ended_reason = 'manual' and id = '00000000-0000-0000-0000-000000000001'
);
delete from public.room_member where room_id = '00000000-0000-0000-0000-000000000001';
delete from public.room where id = '00000000-0000-0000-0000-000000000001';
delete from public.profile where user_id in (
  '11111111-1111-1111-1111-111111111101',
  '11111111-1111-1111-1111-111111111102',
  '11111111-1111-1111-1111-111111111103',
  '11111111-1111-1111-1111-111111111104',
  '11111111-1111-1111-1111-111111111105',
  '11111111-1111-1111-1111-111111111106',
  '11111111-1111-1111-1111-111111111107'
);
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111101',
  '11111111-1111-1111-1111-111111111102',
  '11111111-1111-1111-1111-111111111103',
  '11111111-1111-1111-1111-111111111104',
  '11111111-1111-1111-1111-111111111105',
  '11111111-1111-1111-1111-111111111106',
  '11111111-1111-1111-1111-111111111107'
);

-- 1) 더미 7명 auth.users (로그인 안 함 — 최소 컬럼)
-- handle_new_user trigger 가 profile row 자동 생성. 그 후 update 로 채움.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dummy1@dei.test', crypt('dummy', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11111111-1111-1111-1111-111111111102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dummy2@dei.test', crypt('dummy', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11111111-1111-1111-1111-111111111103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dummy3@dei.test', crypt('dummy', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11111111-1111-1111-1111-111111111104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dummy4@dei.test', crypt('dummy', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11111111-1111-1111-1111-111111111105', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dummy5@dei.test', crypt('dummy', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11111111-1111-1111-1111-111111111106', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dummy6@dei.test', crypt('dummy', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('11111111-1111-1111-1111-111111111107', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dummy7@dei.test', crypt('dummy', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

-- 2) profile 채우기 (handle_new_user trigger 가 생성한 row 를 update)
update public.profile set nickname='지수', gender='female', birth_year=2001, region='서울 강남', bio='카페 좋아함 ☕', is_in_active_room=true
  where user_id='11111111-1111-1111-1111-111111111101';
update public.profile set nickname='민준', gender='male', birth_year=1998, region='서울 마포', bio='러닝 5km/day', is_in_active_room=true
  where user_id='11111111-1111-1111-1111-111111111102';
update public.profile set nickname='서연', gender='female', birth_year=2000, region='서울 성동', bio=null, is_in_active_room=true
  where user_id='11111111-1111-1111-1111-111111111103';
update public.profile set nickname='도현', gender='male', birth_year=1999, region='경기 분당', bio='주말은 등산', is_in_active_room=true
  where user_id='11111111-1111-1111-1111-111111111104';
update public.profile set nickname='하윤', gender='female', birth_year=2002, region='서울 종로', bio='책 ❤️', is_in_active_room=true
  where user_id='11111111-1111-1111-1111-111111111105';
update public.profile set nickname='유준', gender='male', birth_year=1997, region='서울 영등포', bio=null, is_in_active_room=true
  where user_id='11111111-1111-1111-1111-111111111106';
update public.profile set nickname='수아', gender='female', birth_year=2003, region='경기 일산', bio='요리 시작했어요', is_in_active_room=true
  where user_id='11111111-1111-1111-1111-111111111107';

-- 3) room 1개 (active, 7명, 본인 들어오면 8)
insert into public.room (id, status, member_count, active_member_count, expires_at)
values ('00000000-0000-0000-0000-000000000001', 'active', 7, 7, now() + interval '7 days');

-- 4) room_member 7명 active (본인 추가는 별도 SQL)
insert into public.room_member (room_id, user_id, role, status, joined_at) values
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111101', 'member', 'active', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111102', 'member', 'active', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111103', 'member', 'active', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111104', 'member', 'active', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111105', 'member', 'active', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111106', 'member', 'active', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111107', 'member', 'active', now() - interval '2 hours');

-- 5) video — 현재 시간대 + 직전 시간대 두 hour_slot, 멤버마다 1개씩.
--    storage_path/thumbnail_path = null → grid 에서 placeholder 셀 (signed URL 안 만들어짐)
--    실 영상 보려면 storage 에 파일 + path 채워야. 본인 영상은 S11 으로 직접 촬영해서 자연 생성.
do $$
declare
  current_hour smallint := extract(hour from now() at time zone 'Asia/Seoul')::smallint;
  prev_hour smallint := ((extract(hour from now() at time zone 'Asia/Seoul')::int + 23) % 24)::smallint;
begin
  -- 현재 시간대: 7명 중 5명만 (몇 명 빈 셀로 보이게)
  insert into public.video (room_id, user_id, storage_path, thumbnail_path, duration_ms, hour_slot, status, created_at) values
    ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111101', null, null, 2800, current_hour, 'ready', now() - interval '5 minutes'),
    ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111102', null, null, 3000, current_hour, 'ready', now() - interval '12 minutes'),
    ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111104', null, null, 2500, current_hour, 'ready', now() - interval '25 minutes'),
    ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111105', null, null, 3000, current_hour, 'ready', now() - interval '40 minutes'),
    ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111107', null, null, 2700, current_hour, 'ready', now() - interval '50 minutes');

  -- 직전 시간대: 4명
  insert into public.video (room_id, user_id, storage_path, thumbnail_path, duration_ms, hour_slot, status, created_at) values
    ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111101', null, null, 3000, prev_hour, 'ready', now() - interval '70 minutes'),
    ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111103', null, null, 2900, prev_hour, 'ready', now() - interval '75 minutes'),
    ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111106', null, null, 2400, prev_hour, 'ready', now() - interval '90 minutes'),
    ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111107', null, null, 3000, prev_hour, 'ready', now() - interval '100 minutes');
end $$;

commit;

-- 결과 확인
select 'room' as kind, count(*) as n from public.room where id='00000000-0000-0000-0000-000000000001'
union all
select 'profile', count(*) from public.profile where user_id::text like '11111111-1111-1111-1111-1111111111%'
union all
select 'room_member', count(*) from public.room_member where room_id='00000000-0000-0000-0000-000000000001'
union all
select 'video', count(*) from public.video where room_id='00000000-0000-0000-0000-000000000001';
