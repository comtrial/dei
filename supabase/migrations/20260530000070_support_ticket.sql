-- B operations: S23 customer support inquiry form.

create table if not exists public.support_ticket (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('결제·환불', '매칭', '차단·신고', '기타')),
  message text not null check (char_length(message) between 1 and 500),
  reply_email text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_status_idx on public.support_ticket(status, created_at);
create index if not exists support_ticket_user_idx on public.support_ticket(user_id, created_at desc);

alter table public.support_ticket enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'support_ticket'
      and policyname = 'support_ticket_select_self'
  ) then
    create policy support_ticket_select_self on public.support_ticket
      for select to authenticated
      using (user_id = auth.uid() or public.is_admin());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'support_ticket'
      and policyname = 'support_ticket_insert_self'
  ) then
    create policy support_ticket_insert_self on public.support_ticket
      for insert to authenticated
      with check (user_id = auth.uid());
  end if;
end $$;
