alter table public.video
  add column if not exists muted boolean not null default false;

comment on column public.video.muted is
  'true 이면 재생 시 음소거. 검수 화면에서 사용자가 toggle 후 upload.';
