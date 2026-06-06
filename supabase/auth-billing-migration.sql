create extension if not exists "pgcrypto";

create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  email text,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  stripe_subscription_status text,
  plan_key text not null default 'free' check (plan_key in ('free', 'starter', 'creator', 'pro', 'agency')),
  points_balance integer not null default 20 check (points_balance >= 0),
  lifetime_points_purchased integer not null default 0 check (lifetime_points_purchased >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.point_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.billing_accounts(id) on delete cascade,
  delta integer not null,
  reason text not null,
  reference text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.billing_accounts
  add column if not exists user_id uuid unique references auth.users(id) on delete cascade;

alter table public.batch_jobs
  add column if not exists account_id uuid references public.billing_accounts(id) on delete set null,
  add column if not exists points_reserved integer not null default 0,
  add column if not exists points_spent integer not null default 0,
  add column if not exists points_refunded integer not null default 0,
  add column if not exists points_reservation_ref text;

create index if not exists billing_accounts_user_id_idx on public.billing_accounts(user_id);
create index if not exists billing_accounts_stripe_customer_id_idx on public.billing_accounts(stripe_customer_id);
create index if not exists point_ledger_account_id_idx on public.point_ledger(account_id);
create index if not exists batch_jobs_account_id_idx on public.batch_jobs(account_id);

alter table public.billing_accounts enable row level security;
alter table public.point_ledger enable row level security;

drop policy if exists "Service role manages billing accounts" on public.billing_accounts;
drop policy if exists "Service role manages point ledger" on public.point_ledger;

create policy "Service role manages billing accounts"
  on public.billing_accounts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role manages point ledger"
  on public.point_ledger for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.apply_points_delta(
  p_account_id uuid,
  p_delta integer,
  p_reason text,
  p_reference text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.billing_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.point_ledger%rowtype;
  account_row public.billing_accounts%rowtype;
  next_balance integer;
begin
  select * into existing
  from public.point_ledger
  where reference = p_reference;

  if found then
    select * into account_row
    from public.billing_accounts
    where id = existing.account_id;

    return account_row;
  end if;

  select * into account_row
  from public.billing_accounts
  where id = p_account_id
  for update;

  if not found then
    raise exception 'Billing account not found';
  end if;

  next_balance := account_row.points_balance + p_delta;

  if next_balance < 0 then
    raise exception 'INSUFFICIENT_POINTS';
  end if;

  insert into public.point_ledger (account_id, delta, reason, reference, metadata)
  values (p_account_id, p_delta, p_reason, p_reference, coalesce(p_metadata, '{}'::jsonb));

  update public.billing_accounts
  set
    points_balance = next_balance,
    lifetime_points_purchased = lifetime_points_purchased + greatest(p_delta, 0),
    updated_at = now()
  where id = p_account_id
  returning * into account_row;

  return account_row;
end;
$$;

grant execute on function public.apply_points_delta(uuid, integer, text, text, jsonb) to service_role;
