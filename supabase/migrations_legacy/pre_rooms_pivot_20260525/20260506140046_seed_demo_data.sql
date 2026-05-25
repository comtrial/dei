
-- Members
insert into public.members (id, phone, nickname, birth_date, gender, region_sido, region_sigungu, intro, mbti, photo_url, photo_review_yn, status, blocked_yn) values
  ('11111111-1111-1111-1111-111111111101','01012340001','민지','1998-04-12','F','서울','강남구','커피와 책을 좋아해요','INFP', null, 'N','ACTIVE',false),
  ('11111111-1111-1111-1111-111111111102','01012340002','수현','1996-08-21','M','서울','마포구','러닝하는 개발자','ENTJ', null, 'Y','ACTIVE',false),
  ('11111111-1111-1111-1111-111111111103','01012340003','지호','2000-01-04','M','경기','성남시','음악 듣는 거 좋아함','ISFP', null, 'N','ACTIVE',false),
  ('11111111-1111-1111-1111-111111111104','01012340004','예린','1999-11-30','F','서울','용산구','미식 탐방러','ESFJ', null, 'Y','ACTIVE',false),
  ('11111111-1111-1111-1111-111111111105','01012340005','도윤','1997-06-15','M','부산','해운대구','서핑 좋아함','ESTP', null, 'N','SUSPENDED',false),
  ('11111111-1111-1111-1111-111111111106','01012340006','하늘','2001-09-09','F','인천','연수구','여행 사진가','INFJ', null, 'Y','ACTIVE',true),
  ('11111111-1111-1111-1111-111111111107','01012340007','준서','1995-12-01','M','대구','수성구','등산 메이트 구함','ISTJ', null, 'N','ACTIVE',false),
  ('11111111-1111-1111-1111-111111111108','01012340008','서아','1998-03-22','F','서울','송파구','고양이 집사','INTP', null, 'Y','ACTIVE',false),
  ('11111111-1111-1111-1111-111111111109','01012340009','은우','2002-07-07','M','경기','수원시','요리 배우는 중','ENFP', null, 'N','WITHDRAWN',false),
  ('11111111-1111-1111-1111-11111111110a','01012340010','채아','1996-02-18','F','서울','성동구','요가 강사','ISFJ', null, 'Y','ACTIVE',false),
  ('11111111-1111-1111-1111-11111111110b','01012340011','시우','2000-10-25','M','광주','북구','보드게임 좋아함','ENTP', null, 'N','ACTIVE',false),
  ('11111111-1111-1111-1111-11111111110c','01012340012','윤아','1997-05-13','F','서울','종로구','미술관 산책','INTJ', null, 'Y','ACTIVE',false)
on conflict (id) do nothing;

insert into public.logs (id, member_id, video_url, thumbnail_url, duration_sec, hour_slot, log_date, review_yn, review_status, created_at) values
  ('21111111-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111101','https://example.com/v1.mp4',null,5,9,current_date,'N','PENDING', now() - interval '2 hour'),
  ('21111111-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111101','https://example.com/v2.mp4',null,4,12,current_date,'N','PENDING', now() - interval '70 min'),
  ('21111111-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111102','https://example.com/v3.mp4',null,6,8,current_date,'Y','APPROVED', now() - interval '5 hour'),
  ('21111111-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111103','https://example.com/v4.mp4',null,3,14,current_date,'N','PENDING', now() - interval '30 min'),
  ('21111111-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111104','https://example.com/v5.mp4',null,5,18,current_date - 1,'Y','APPROVED', now() - interval '1 day'),
  ('21111111-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111105','https://example.com/v6.mp4',null,4,20,current_date - 1,'R','REJECTED', now() - interval '2 day'),
  ('21111111-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111107','https://example.com/v7.mp4',null,6,11,current_date,'N','PENDING', now() - interval '4 hour'),
  ('21111111-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111108','https://example.com/v8.mp4',null,5,16,current_date,'Y','APPROVED', now() - interval '8 hour'),
  ('21111111-0000-0000-0000-000000000009','11111111-1111-1111-1111-11111111110a','https://example.com/v9.mp4',null,4,10,current_date,'N','PENDING', now() - interval '15 min'),
  ('21111111-0000-0000-0000-00000000000a','11111111-1111-1111-1111-11111111110c','https://example.com/v10.mp4',null,6,13,current_date,'Y','APPROVED', now() - interval '6 hour')
on conflict (id) do nothing;

insert into public.reports (id, reporter_id, reported_id, log_id, reason, reason_category, status, created_at) values
  ('31111111-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111105','21111111-0000-0000-0000-000000000006','부적절한 내용 포함','INAPPROPRIATE','PENDING', now() - interval '26 hour'),
  ('31111111-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111102','11111111-1111-1111-1111-111111111106',null,'욕설','ABUSE','PENDING', now() - interval '3 hour'),
  ('31111111-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111103','11111111-1111-1111-1111-111111111107',null,'사기 의심','FRAUD','DONE', now() - interval '3 day'),
  ('31111111-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111104','11111111-1111-1111-1111-111111111105',null,'기타','OTHER','PENDING', now() - interval '40 min')
on conflict (id) do nothing;

insert into public.payments (member_id, product_type, amount, status, payment_method, created_at) values
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

insert into public.audit_log (operator_email, action, target_type, meta, created_at) values
  ('admin@dei.app','LOGIN','SYSTEM','{}'::jsonb, now() - interval '1 hour'),
  ('admin@dei.app','APPROVE_LOG','LOG','{"log_id":"21111111-0000-0000-0000-000000000003"}'::jsonb, now() - interval '2 hour'),
  ('admin@dei.app','REJECT_LOG','LOG','{"log_id":"21111111-0000-0000-0000-000000000006"}'::jsonb, now() - interval '3 hour');
;
