alter table public.payment
  add column if not exists provider_transaction_id text,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists payment_provider_transaction_uniq
  on public.payment(provider, provider_transaction_id)
  where provider_transaction_id is not null;

create or replace function public.grant_instant_rematch_purchase(
  p_user_id uuid,
  p_product_id text,
  p_provider text,
  p_provider_transaction_id text,
  p_provider_metadata jsonb,
  p_granted smallint
)
returns table(payment_id uuid, duplicate boolean, granted smallint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_existing_status text;
  v_pass_id uuid;
  v_pass_granted smallint;
  v_pass_remaining smallint;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if p_product_id is null or length(trim(p_product_id)) = 0 then
    raise exception 'p_product_id is required';
  end if;

  if p_provider is null or length(trim(p_provider)) = 0 then
    raise exception 'p_provider is required';
  end if;

  if p_provider_transaction_id is null or length(trim(p_provider_transaction_id)) = 0 then
    raise exception 'p_provider_transaction_id is required';
  end if;

  if p_granted is null or p_granted <= 0 then
    raise exception 'p_granted must be positive';
  end if;

  select p.id, p.status
    into v_payment_id, v_existing_status
    from public.payment as p
   where p.provider = p_provider
     and p.provider_transaction_id = p_provider_transaction_id
   for update;

  if v_payment_id is not null then
    payment_id := v_payment_id;
    duplicate := true;
    granted := 0;
    return next;
    return;
  end if;

  begin
    insert into public.payment (
      user_id,
      provider,
      provider_transaction_id,
      provider_metadata,
      product_id,
      amount,
      status
    )
    values (
      p_user_id,
      p_provider,
      p_provider_transaction_id,
      coalesce(p_provider_metadata, '{}'::jsonb),
      p_product_id,
      null,
      'completed'
    )
    returning id into v_payment_id;
  exception when unique_violation then
    select p.id, p.status
      into v_payment_id, v_existing_status
      from public.payment as p
     where p.provider = p_provider
       and p.provider_transaction_id = p_provider_transaction_id
     for update;

    payment_id := v_payment_id;
    duplicate := true;
    granted := 0;
    return next;
    return;
  end;

  select pass_row.id, pass_row.granted, pass_row.remaining
    into v_pass_id, v_pass_granted, v_pass_remaining
    from public.pass as pass_row
   where pass_row.user_id = p_user_id
     and pass_row.kind = 'booster'
     and pass_row.status = 'active'
   order by pass_row.created_at asc
   limit 1
   for update;

  if v_pass_id is not null then
    update public.pass
       set granted = v_pass_granted + p_granted,
           remaining = v_pass_remaining + p_granted,
           source = 'purchase'
     where id = v_pass_id;
  else
    insert into public.pass (
      user_id,
      kind,
      granted,
      remaining,
      status,
      source
    )
    values (
      p_user_id,
      'booster',
      p_granted,
      p_granted,
      'active',
      'purchase'
    );
  end if;

  payment_id := v_payment_id;
  duplicate := false;
  granted := p_granted;
  return next;
end;
$$;

revoke all on function public.grant_instant_rematch_purchase(uuid, text, text, text, jsonb, smallint)
  from public;
grant execute on function public.grant_instant_rematch_purchase(uuid, text, text, text, jsonb, smallint)
  to service_role;
