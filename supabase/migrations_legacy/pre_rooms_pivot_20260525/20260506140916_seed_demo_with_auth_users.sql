
-- Create demo auth.users + profiles + logs/reports/payments/sms_log
do $$
declare
  rec record;
  uid uuid;
begin
  for rec in
    select * from (values
      ('11111111-1111-1111-1111-111111111101'::uuid, '01012340001', '민지', '1998-04-12'::date, 'F','서울','강남구','커피와 책을 좋아해요','INFP','N','ACTIVE','N'),
      ('11111111-1111-1111-1111-111111111102'::uuid, '01012340002', '수현', '1996-08-21'::date, 'M','서울','마포구','러닝하는 개발자','ENTJ','Y','ACTIVE','N'),
      ('11111111-1111-1111-1111-111111111103'::uuid, '01012340003', '지호', '2000-01-04'::date, 'M','경기','성남시','음악 듣는 거 좋아함','ISFP','N','ACTIVE','N'),
      ('11111111-1111-1111-1111-111111111104'::uuid, '01012340004', '예린', '1999-11-30'::date, 'F','서울','용산구','미식 탐방러','ESFJ','Y','ACTIVE','N'),
      ('11111111-1111-1111-1111-111111111105'::uuid, '01012340005', '도윤', '1997-06-15'::date, 'M','부산','해운대구','서핑 좋아함','ESTP','N','SUSPENDED','N'),
      ('11111111-1111-1111-1111-111111111106'::uuid, '01012340006', '하늘', '2001-09-09'::date, 'F','인천','연수구','여행 사진가','INFJ','Y','ACTIVE','Y'),
      ('11111111-1111-1111-1111-111111111107'::uuid, '01012340007', '준서', '1995-12-01'::date, 'M','대구','수성구','등산 메이트 구함','ISTJ','N','ACTIVE','N'),
      ('11111111-1111-1111-1111-111111111108'::uuid, '01012340008', '서아', '1998-03-22'::date, 'F','서울','송파구','고양이 집사','INTP','Y','ACTIVE','N'),
      ('11111111-1111-1111-1111-111111111109'::uuid, '01012340009', '은우', '2002-07-07'::date, 'M','경기','수원시','요리 배우는 중','ENFP','N','WITHDRAWN','N'),
      ('11111111-1111-1111-1111-11111111110a'::uuid, '01012340010', '채아', '1996-02-18'::date, 'F','서울','성동구','요가 강사','ISFJ','Y','ACTIVE','N'),
      ('11111111-1111-1111-1111-11111111110b'::uuid, '01012340011', '시우', '2000-10-25'::date, 'M','광주','북구','보드게임 좋아함','ENTP','N','ACTIVE','N'),
      ('11111111-1111-1111-1111-11111111110c'::uuid, '01012340012', '윤아', '1997-05-13'::date, 'F','서울','종로구','미술관 산책','INTJ','Y','ACTIVE','N')
    ) as t(uid_, phone, nickname, birth_date, gender, sido, sigungu, intro, mbti, photo_yn, status, blocked)
  loop
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, phone, phone_confirmed_at
    ) values (
      rec.uid_, '00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated',
      rec.phone || '@demo.dei.app',
      crypt('demo-password', gen_salt('bf')),
      now(),
      jsonb_build_object('provider','phone','providers',jsonb_build_array('phone')),
      jsonb_build_object('nickname', rec.nickname),
      now() - (random()*30 || ' day')::interval,
      now(),
      rec.phone, now()
    ) on conflict (id) do nothing;

    insert into public.profiles (
      user_id, nickname, phone, birth_date, gender, region_sido, region_sigungu,
      intro, mbti, "사진_검수_YN", "회원상태", "차단_YN"
    ) values (
      rec.uid_, rec.nickname, rec.phone, rec.birth_date, rec.gender, rec.sido, rec.sigungu,
      rec.intro, rec.mbti, rec.photo_yn, rec.status, rec.blocked
    ) on conflict (user_id) do nothing;
  end loop;
end $$;

-- Logs (검수_YN 한글 컬럼)
insert into public.logs (id, user_id, video_url, hour_slot, duration_sec, "검수_YN", "검수_상태", recorded_at, created_at) values
  ('21111111-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111101/v1.mp4',9,5,'N','PENDING', now() - interval '2 hour', now() - interval '2 hour'),
  ('21111111-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111101/v2.mp4',12,4,'N','PENDING', now() - interval '70 min', now() - interval '70 min'),
  ('21111111-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111102','11111111-1111-1111-1111-111111111102/v3.mp4',8,6,'Y','APPROVED', now() - interval '5 hour', now() - interval '5 hour'),
  ('21111111-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111103','11111111-1111-1111-1111-111111111103/v4.mp4',14,3,'N','PENDING', now() - interval '30 min', now() - interval '30 min'),
  ('21111111-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111104','11111111-1111-1111-1111-111111111104/v5.mp4',18,5,'Y','APPROVED', now() - interval '1 day', now() - interval '1 day'),
  ('21111111-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111105','11111111-1111-1111-1111-111111111105/v6.mp4',20,4,'N','REJECTED', now() - interval '2 day', now() - interval '2 day'),
  ('21111111-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111107','11111111-1111-1111-1111-111111111107/v7.mp4',11,6,'N','PENDING', now() - interval '4 hour', now() - interval '4 hour'),
  ('21111111-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111108','11111111-1111-1111-1111-111111111108/v8.mp4',16,5,'Y','APPROVED', now() - interval '8 hour', now() - interval '8 hour'),
  ('21111111-0000-0000-0000-000000000009','11111111-1111-1111-1111-11111111110a','11111111-1111-1111-1111-11111111110a/v9.mp4',10,4,'N','PENDING', now() - interval '15 min', now() - interval '15 min'),
  ('21111111-0000-0000-0000-00000000000a','11111111-1111-1111-1111-11111111110c','11111111-1111-1111-1111-11111111110c/v10.mp4',13,6,'Y','APPROVED', now() - interval '6 hour', now() - interval '6 hour')
on conflict (id) do nothing;

-- Reports
insert into public.reports (id, reporter_id, reported_id, log_id, reason, reason_category, "처리상태", created_at) values
  ('31111111-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111105','21111111-0000-0000-0000-000000000006','부적절한 내용 포함','INAPPROPRIATE','PENDING', now() - interval '26 hour'),
  ('31111111-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111102','11111111-1111-1111-1111-111111111106',null,'욕설','ABUSE','PENDING', now() - interval '3 hour'),
  ('31111111-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111103','11111111-1111-1111-1111-111111111107',null,'사기 의심','FRAUD','DONE', now() - interval '3 day'),
  ('31111111-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111104','11111111-1111-1111-1111-111111111105',null,'기타','OTHER','PENDING', now() - interval '40 min')
on conflict (id) do nothing;

-- Payments
insert into public.payments (user_id, product_type, amount, "결제상태", payment_method, created_at) values
  ('11111111-1111-1111-1111-111111111102','REFRESH', 1500, 'SUCCESS', 'CARD', now() - interval '4 hour'),
  ('11111111-1111-1111-1111-111111111104','REFRESH', 1500, 'SUCCESS', 'CARD', now() - interval '8 hour'),
  ('11111111-1111-1111-1111-111111111108','REFRESH', 1500, 'FAILED', 'CARD', now() - interval '2 hour'),
  ('11111111-1111-1111-1111-11111111110a','REFRESH', 1500, 'SUCCESS', 'KAKAO_PAY', now() - interval '12 hour'),
  ('11111111-1111-1111-1111-11111111110c','REFRESH', 1500, 'SUCCESS', 'CARD', now() - interval '20 hour');

-- SMS log: abusive pattern from one phone
insert into public.sms_log (phone, send_count, ip_address, created_at)
select '01099999999', 1, '203.0.113.42', now() - (i || ' minute')::interval
from generate_series(1, 12) i;

insert into public.sms_log (phone, send_count, ip_address, created_at) values
  ('01012340001', 1, '203.0.113.10', now() - interval '5 hour'),
  ('01012340002', 1, '203.0.113.11', now() - interval '2 hour');

-- Audit log
insert into public.audit_log (operator_email, action, target_type, meta, created_at) values
  ('admin@dei.app','LOGIN','SYSTEM','{}'::jsonb, now() - interval '1 hour'),
  ('admin@dei.app','APPROVE_LOG','LOG','{"log_id":"21111111-0000-0000-0000-000000000003"}'::jsonb, now() - interval '2 hour'),
  ('admin@dei.app','REJECT_LOG','LOG','{"log_id":"21111111-0000-0000-0000-000000000006"}'::jsonb, now() - interval '3 hour');
;
