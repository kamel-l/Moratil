create table if not exists public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stats jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.verse_mastery (
  user_id uuid not null references auth.users (id) on delete cascade,
  surah_number integer not null check (surah_number between 1 and 114),
  ayah_number integer not null check (ayah_number > 0),
  mastery jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, surah_number, ayah_number)
);

create table if not exists public.daily_activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_date date not null,
  verses integer not null default 0 check (verses >= 0),
  sessions integer not null default 0 check (sessions >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_date)
);

grant select, insert, update, delete on public.user_progress to authenticated;
grant select, insert, update, delete on public.verse_mastery to authenticated;
grant select, insert, update, delete on public.daily_activity to authenticated;

alter table public.user_progress enable row level security;
alter table public.verse_mastery enable row level security;
alter table public.daily_activity enable row level security;

drop policy if exists "Users can access their own progress" on public.user_progress;
create policy "Users can access their own progress"
  on public.user_progress
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can access their own verse mastery" on public.verse_mastery;
create policy "Users can access their own verse mastery"
  on public.verse_mastery
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can access their own daily activity" on public.daily_activity;
create policy "Users can access their own daily activity"
  on public.daily_activity
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
