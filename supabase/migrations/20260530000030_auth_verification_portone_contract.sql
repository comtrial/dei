-- B-02 / PR1: PortOne 본인인증 실연동을 위한 auth_verification 계약 보강.
--
-- 클라이언트는 auth_verification 을 직접 쓰지 않는다. Edge Function 이
-- service-role 로 pending/verified/failed 상태와 잠금 정보를 기록한다.

alter table public.auth_verification
  add column if not exists provider_verification_id text,
  add column if not exists identity_verification_tx_id text,
  add column if not exists failure_code text,
  add column if not exists failure_message text,
  add column if not exists failure_count integer not null default 0 check (failure_count >= 0),
  add column if not exists failed_at timestamptz,
  add column if not exists lock_until timestamptz,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists auth_verification_provider_verification_uniq
  on public.auth_verification(provider, provider_verification_id)
  where provider_verification_id is not null;

create index if not exists auth_verification_user_created_idx
  on public.auth_verification(user_id, created_at desc);

create index if not exists auth_verification_user_status_idx
  on public.auth_verification(user_id, status, created_at desc);

create index if not exists auth_verification_user_lock_idx
  on public.auth_verification(user_id, lock_until)
  where lock_until is not null;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'auth_verification_set_updated_at'
  ) then
    create trigger auth_verification_set_updated_at
      before update on public.auth_verification
      for each row execute function public.set_updated_at();
  end if;
end $$;
