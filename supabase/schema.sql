create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled batch',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.batch_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  account_id uuid references public.billing_accounts(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  total_videos integer not null default 0 check (total_videos >= 0 and total_videos <= 10),
  processed_videos integer not null default 0 check (processed_videos >= 0),
  global_thumbnail_count integer not null default 3 check (global_thumbnail_count in (1, 2, 3, 5, 10)),
  selected_formats text[] not null default array['16:9']::text[],
  total_images_requested integer not null default 0 check (total_images_requested >= 0 and total_images_requested <= 200),
  total_images_completed integer not null default 0 check (total_images_completed >= 0),
  points_reserved integer not null default 0 check (points_reserved >= 0),
  points_spent integer not null default 0 check (points_spent >= 0),
  points_refunded integer not null default 0 check (points_refunded >= 0),
  points_reservation_ref text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  batch_job_id uuid not null references public.batch_jobs(id) on delete cascade,
  source_type text not null default 'youtube_link' check (source_type in ('youtube_link', 'uploaded_video')),
  source_url text,
  uploaded_video_path text,
  uploaded_video_url text,
  uploaded_video_name text,
  reference_image_path text,
  reference_image_url text,
  per_video_thumbnail_count integer check (per_video_thumbnail_count in (1, 2, 3, 5, 10)),
  notes text,
  transcript text,
  title text,
  description text,
  generated_title text,
  generated_description text,
  hashtags text[] not null default array[]::text[],
  thumbnail_prompt text,
  status text not null default 'queued' check (
    status in (
      'queued',
      'analyzing',
      'analyzing_video',
      'writing_prompt',
      'generating_prompt',
      'generating_thumbnails',
      'completed',
      'failed'
    )
  ),
  status_detail text,
  error_message text,
  saved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source_type = 'youtube_link' and source_url is not null)
    or
    (source_type = 'uploaded_video' and uploaded_video_path is not null)
  )
);

create table if not exists public.thumbnails (
  id uuid primary key default gen_random_uuid(),
  batch_job_id uuid not null references public.batch_jobs(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  concept_number integer not null check (concept_number >= 1 and concept_number <= 10),
  format text not null check (format in ('16:9', '1:1', '9:16', '4:5')),
  image_storage_path text not null,
  public_url text not null,
  prompt_used text not null,
  width integer not null,
  height integer not null,
  status text not null default 'generated' check (status in ('generated', 'failed')),
  saved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.batch_jobs add column if not exists global_thumbnail_count integer not null default 3;
alter table public.batch_jobs add column if not exists total_images_requested integer not null default 0;
alter table public.batch_jobs add column if not exists total_images_completed integer not null default 0;
alter table public.batch_jobs add column if not exists account_id uuid references public.billing_accounts(id) on delete set null;
alter table public.batch_jobs add column if not exists points_reserved integer not null default 0;
alter table public.batch_jobs add column if not exists points_spent integer not null default 0;
alter table public.batch_jobs add column if not exists points_refunded integer not null default 0;
alter table public.batch_jobs add column if not exists points_reservation_ref text;
alter table public.billing_accounts add column if not exists user_id uuid unique references auth.users(id) on delete cascade;

alter table public.videos add column if not exists source_type text not null default 'youtube_link';
alter table public.videos alter column source_url drop not null;
alter table public.videos add column if not exists uploaded_video_path text;
alter table public.videos add column if not exists uploaded_video_url text;
alter table public.videos add column if not exists uploaded_video_name text;
alter table public.videos add column if not exists per_video_thumbnail_count integer;
alter table public.videos add column if not exists status_detail text;

alter table public.thumbnails add column if not exists batch_job_id uuid references public.batch_jobs(id) on delete cascade;
alter table public.thumbnails add column if not exists concept_number integer not null default 1;
alter table public.thumbnails add column if not exists image_storage_path text;
alter table public.thumbnails add column if not exists prompt_used text;
alter table public.thumbnails add column if not exists saved boolean not null default false;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'thumbnails'
      and column_name = 'storage_path'
  ) then
    execute 'update public.thumbnails set image_storage_path = coalesce(image_storage_path, storage_path) where image_storage_path is null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'thumbnails'
      and column_name = 'prompt'
  ) then
    execute 'update public.thumbnails set prompt_used = coalesce(prompt_used, prompt) where prompt_used is null';
  end if;
end $$;

create index if not exists batch_jobs_project_id_idx on public.batch_jobs(project_id);
create index if not exists batch_jobs_account_id_idx on public.batch_jobs(account_id);
create index if not exists billing_accounts_user_id_idx on public.billing_accounts(user_id);
create index if not exists billing_accounts_stripe_customer_id_idx on public.billing_accounts(stripe_customer_id);
create index if not exists point_ledger_account_id_idx on public.point_ledger(account_id);
create index if not exists videos_batch_job_id_idx on public.videos(batch_job_id);
create index if not exists videos_source_type_idx on public.videos(source_type);
create index if not exists thumbnails_batch_job_id_idx on public.thumbnails(batch_job_id);
create index if not exists thumbnails_video_id_idx on public.thumbnails(video_id);
create index if not exists thumbnails_concept_idx on public.thumbnails(video_id, concept_number);

insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', true)
on conflict (id) do nothing;

alter table public.projects enable row level security;
alter table public.billing_accounts enable row level security;
alter table public.point_ledger enable row level security;
alter table public.batch_jobs enable row level security;
alter table public.videos enable row level security;
alter table public.thumbnails enable row level security;

drop policy if exists "Service role manages projects" on public.projects;
drop policy if exists "Service role manages billing accounts" on public.billing_accounts;
drop policy if exists "Service role manages point ledger" on public.point_ledger;
drop policy if exists "Service role manages batch jobs" on public.batch_jobs;
drop policy if exists "Service role manages videos" on public.videos;
drop policy if exists "Service role manages thumbnails" on public.thumbnails;
drop policy if exists "Public can read thumbnail files" on storage.objects;
drop policy if exists "Service role manages thumbnail files" on storage.objects;

create policy "Service role manages projects"
  on public.projects for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role manages billing accounts"
  on public.billing_accounts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role manages point ledger"
  on public.point_ledger for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role manages batch jobs"
  on public.batch_jobs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role manages videos"
  on public.videos for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role manages thumbnails"
  on public.thumbnails for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Public can read thumbnail files"
  on storage.objects for select
  using (bucket_id = 'thumbnails');

create policy "Service role manages thumbnail files"
  on storage.objects for all
  using (bucket_id = 'thumbnails' and auth.role() = 'service_role')
  with check (bucket_id = 'thumbnails' and auth.role() = 'service_role');

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
