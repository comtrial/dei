create or replace function public.sync_profile_video_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.moderation_status = 'approved'
    and old.moderation_status is distinct from new.moderation_status then
    update public.account_status
    set
      first_video_approved_at = coalesce(first_video_approved_at, now()),
      onboarding_state = case
        when onboarding_state in ('video_review', 'first_video') then 'complete'::public.onboarding_state
        else onboarding_state
      end,
      discovery_enabled_at = case
        when identity_verified_at is not null
          and profile_completed_at is not null
        then coalesce(discovery_enabled_at, now())
        else discovery_enabled_at
      end
    where user_id = new.user_id;
  end if;

  return new;
end;
$$;

update public.account_status
set discovery_enabled_at = coalesce(discovery_enabled_at, now())
where identity_verified_at is not null
  and profile_completed_at is not null
  and first_video_approved_at is not null
  and discovery_enabled_at is null;
