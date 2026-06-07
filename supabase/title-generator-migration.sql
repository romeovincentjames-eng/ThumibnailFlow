alter table public.videos
  add column if not exists generated_title_options text[] not null default array[]::text[];

update public.videos
set generated_title_options = array[generated_title]
where generated_title is not null
  and coalesce(array_length(generated_title_options, 1), 0) = 0;
