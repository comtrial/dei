alter table public.video add column if not exists caption text;

alter table public.video drop constraint if exists video_caption_length_check;
alter table public.video add constraint video_caption_length_check
  check (caption is null or char_length(caption) <= 200);

comment on column public.video.caption is
  '사용자가 영상에 추가한 멘트(선택, 200자). 영상 표면 위 오버레이로 노출.';
