-- video review slack notification
-- INSERT into public.logs (검수_상태 = 'PENDING') 또는 public.profile_videos (moderation_status = 'pending')
-- 시 supabase edge function 'notify-video-review' 로 비동기 POST -> Slack incoming webhook.
-- 두 개의 vault secret 이 필요:
--   * video_review_notify_url    : edge function 의 https URL
--   * video_review_notify_secret : edge function 의 x-notify-secret 헤더와 비교할 공유 시크릿
-- 미설정이어도 트리거가 실패하지 않도록 warning 만 남기고 통과.

create extension if not exists pg_net with schema extensions;

-- RPC wrapper that lets the notify-video-review edge function read its config
-- from vault via service_role (vault schema is not exposed through PostgREST).
create or replace function public._video_review_notify_config()
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $rpc$
declare
  v_result jsonb := '{}'::jsonb;
  v_row    record;
begin
  for v_row in
    select name, decrypted_secret
      from vault.decrypted_secrets
     where name in (
       'slack_video_review_webhook_url',
       'video_review_admin_base_url',
       'video_review_notify_secret'
     )
  loop
    v_result := v_result || jsonb_build_object(v_row.name, v_row.decrypted_secret);
  end loop;
  return v_result;
end;
$rpc$;

comment on function public._video_review_notify_config() is
  'Returns the notify-video-review edge function config from vault. Granted to service_role only.';

revoke execute on function public._video_review_notify_config() from public, anon, authenticated;
grant  execute on function public._video_review_notify_config() to service_role;

create or replace function public.notify_video_review_pending()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url     text;
  v_secret  text;
  v_source  text := tg_argv[0];
begin
  begin
    select decrypted_secret
      into v_url
      from vault.decrypted_secrets
     where name = 'video_review_notify_url'
     limit 1;

    select decrypted_secret
      into v_secret
      from vault.decrypted_secrets
     where name = 'video_review_notify_secret'
     limit 1;
  exception when others then
    raise warning 'notify_video_review_pending: vault read failed (%): %', SQLSTATE, SQLERRM;
    return null;
  end;

  if v_url is null then
    raise warning 'notify_video_review_pending: vault secret video_review_notify_url not set; skipping';
    return null;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'source', v_source,
      'record', to_jsonb(NEW)
    ),
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'x-notify-secret', coalesce(v_secret, '')
    ),
    timeout_milliseconds := 5000
  );

  return null;
exception when others then
  raise warning 'notify_video_review_pending failed (%): %', SQLSTATE, SQLERRM;
  return null;
end;
$$;

comment on function public.notify_video_review_pending() is
  'After-insert trigger: posts pending video records to the notify-video-review edge function. Reads vault secrets video_review_notify_url and video_review_notify_secret.';

revoke execute on function public.notify_video_review_pending() from public, anon, authenticated;
grant  execute on function public.notify_video_review_pending() to postgres, service_role;

drop trigger if exists logs_notify_review_pending on public.logs;
create trigger logs_notify_review_pending
  after insert on public.logs
  for each row
  when (new."검수_상태" = 'PENDING')
  execute function public.notify_video_review_pending('logs');

do $$
begin
  if to_regclass('public.profile_videos') is not null then
    execute 'drop trigger if exists profile_videos_notify_review_pending on public.profile_videos';
    execute $trigger$
      create trigger profile_videos_notify_review_pending
        after insert on public.profile_videos
        for each row
        when (new.moderation_status = 'pending')
        execute function public.notify_video_review_pending('profile_videos')
    $trigger$;
  end if;
end;
$$;
