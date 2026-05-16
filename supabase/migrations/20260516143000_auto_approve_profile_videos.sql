-- profile_videos: 운영 정책 변경 — 자동 승인.
-- INSERT 시 RLS 가 pending 강제하므로 AFTER INSERT trigger 로 즉시 approved UPDATE.
-- UPDATE 는 sync_profile_video_approval trigger 를 거쳐 profile 동기화까지 자동 수행.

create or replace function public.auto_approve_profile_video()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profile_videos
  set moderation_status = 'approved'
  where id = new.id
    and moderation_status = 'pending';
  return null;
end;
$$;

drop trigger if exists profile_videos_auto_approve on public.profile_videos;

create trigger profile_videos_auto_approve
after insert on public.profile_videos
for each row
when (new.moderation_status = 'pending')
execute function public.auto_approve_profile_video();

update public.profile_videos
set moderation_status = 'approved'
where moderation_status = 'pending';
