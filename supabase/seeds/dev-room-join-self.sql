-- 본인 user_id 를 dev seed 방에 8번째 멤버로 join.
-- 사용법:
--   1) 앱에서 가입/로그인 (이메일 OTP 등) → auth.users 에 본인 row 생긴 후
--   2) psql 또는 Supabase Studio 에서 본인 email 로 user_id 확인:
--        select id, email from auth.users where email = '본인이메일@example.com';
--   3) 아래 :self_id 자리에 본인 user_id 박고 실행:
--        psql ... -f supabase/seeds/dev-room-join-self.sql -v self_id='UUID여기'

\set self_id_uuid :'self_id'::uuid

begin;

-- 본인 profile 채움 (nickname 필수 — S10/S13/S14 표시용)
update public.profile set
  nickname = coalesce(nickname, '본인'),
  gender = coalesce(gender, 'male'),
  birth_year = coalesce(birth_year, 1995),
  region = coalesce(region, '서울 강남'),
  bio = coalesce(bio, '테스트 계정'),
  is_in_active_room = true
where user_id = :self_id_uuid;

-- 8번째 멤버로 join (이미 있으면 status=active 로 복귀)
insert into public.room_member (room_id, user_id, role, status, joined_at)
values ('00000000-0000-0000-0000-000000000001', :self_id_uuid, 'member', 'active', now())
on conflict (room_id, user_id) do update set status='active', left_at=null;

-- room.active_member_count 갱신
update public.room set active_member_count = (
  select count(*) from public.room_member
  where room_id='00000000-0000-0000-0000-000000000001' and status='active'
), member_count = (
  select count(*) from public.room_member
  where room_id='00000000-0000-0000-0000-000000000001'
) where id='00000000-0000-0000-0000-000000000001';

commit;

-- 본인 24h 게이트 통과시키려면 본인 video 1건 추가 (S10 → S13 자동 전환 테스트용).
-- 아래 SELECT 결과로 본인 video count 확인:
select 'self_video_24h_count' as kind, count(*) as n
from public.video
where user_id=:self_id_uuid
  and room_id='00000000-0000-0000-0000-000000000001'
  and status='ready'
  and created_at > now() - interval '24 hours';
