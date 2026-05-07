-- H2 테스트용 시드 데이터
-- 큐레이션 유저 3명 + 오늘 로그 + 내 로그(2 시간대 = H2-A 미완성 상태)
-- 실행: supabase db query --file supabase/seed_h2_test.sql

do $$
declare
  dev_user_id    uuid := '00000000-0000-4000-8000-000000000001';
  user1_id       uuid := '11111111-1111-4000-8000-000000000001';
  user2_id       uuid := '22222222-2222-4000-8000-000000000002';
  user3_id       uuid := '33333333-3333-4000-8000-000000000003';
  log1_id        uuid;
  log2_id        uuid;
  log3_id        uuid;
  today_date     date := '2026-05-03';
begin

  -- ──────────────────────────────────────────────
  -- 1. 큐레이션 테스트 유저 3명 생성 (auth.users)
  -- ──────────────────────────────────────────────
  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user, is_anonymous
  ) values
    ('00000000-0000-0000-0000-000000000000', user1_id, 'authenticated', 'authenticated',
     'test1@dei.local', crypt('test-password', gen_salt('bf')), now(),
     '', '', '', '', '', '', '', '',
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
     now(), now(), false, false),
    ('00000000-0000-0000-0000-000000000000', user2_id, 'authenticated', 'authenticated',
     'test2@dei.local', crypt('test-password', gen_salt('bf')), now(),
     '', '', '', '', '', '', '', '',
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
     now(), now(), false, false),
    ('00000000-0000-0000-0000-000000000000', user3_id, 'authenticated', 'authenticated',
     'test3@dei.local', crypt('test-password', gen_salt('bf')), now(),
     '', '', '', '', '', '', '', '',
     '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
     now(), now(), false, false)
  on conflict (id) do nothing;

  -- ──────────────────────────────────────────────
  -- 2. 프로필 등록
  -- ──────────────────────────────────────────────
  -- 내 프로필 (dev user)
  update public.profiles
     set nickname = '승태', gender = 'M'
   where user_id = dev_user_id;

  -- 큐레이션 유저 프로필
  insert into public.profiles (user_id, nickname, gender, created_at, updated_at)
  values
    (user1_id, '민준', 'M', now(), now()),
    (user2_id, '지현', 'F', now(), now()),
    (user3_id, '서연', 'F', now(), now())
  on conflict (user_id) do update
    set nickname = excluded.nickname,
        gender       = excluded.gender,
        updated_at   = now();

  -- ──────────────────────────────────────────────
  -- 3. 큐레이션 유저 로그 (각 1건)
  -- ──────────────────────────────────────────────
  insert into public.logs (user_id, video_url, hour_slot, duration_sec, "검수_YN", "검수_상태", recorded_at)
  values
    (user1_id, '', 14, 2, 'Y', 'APPROVED', (today_date || 'T14:00:00+00')::timestamptz)
  returning id into log1_id;

  insert into public.logs (user_id, video_url, hour_slot, duration_sec, "검수_YN", "검수_상태", recorded_at)
  values
    (user2_id, '', 10, 2, 'Y', 'APPROVED', (today_date || 'T10:00:00+00')::timestamptz)
  returning id into log2_id;

  insert into public.logs (user_id, video_url, hour_slot, duration_sec, "검수_YN", "검수_상태", recorded_at)
  values
    (user3_id, '', 19, 2, 'Y', 'APPROVED', (today_date || 'T19:00:00+00')::timestamptz)
  returning id into log3_id;

  -- ──────────────────────────────────────────────
  -- 4. 큐레이션 풀 등록 (오늘 날짜)
  -- ──────────────────────────────────────────────
  insert into public.curation_pool (user_id, log_id, pool_date, "검수_YN", "차단_YN")
  values
    (user1_id, log1_id, today_date, 'Y', 'N'),
    (user2_id, log2_id, today_date, 'Y', 'N'),
    (user3_id, log3_id, today_date, 'Y', 'N')
  on conflict do nothing;

  -- ──────────────────────────────────────────────
  -- 5. 내 로그 2건 (새벽 + 오전 = H2-A 미완성)
  -- ──────────────────────────────────────────────
  insert into public.logs (user_id, video_url, hour_slot, duration_sec, "검수_YN", "검수_상태", recorded_at)
  values
    (dev_user_id, '', 2,  2, 'N', 'PENDING', (today_date || 'T02:00:00+00')::timestamptz),
    (dev_user_id, '', 8,  2, 'N', 'PENDING', (today_date || 'T08:00:00+00')::timestamptz)
  on conflict do nothing;

  raise notice '✅ H2 테스트 데이터 삽입 완료';
  raise notice '  큐레이션 유저: 민준(M), 지현(F), 서연(F)';
  raise notice '  내 로그: 새벽(02시) + 오전(08시) → 2/3 완성 중 (H2-A)';
  raise notice '  H2-B 테스트(로그 완성)를 원하면 낮 로그를 추가로 INSERT 하세요.';
end $$;
