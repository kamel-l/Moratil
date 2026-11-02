-- ============================================================================
-- مُرتِّل — normalized Quran progress schema
--
-- This migration is additive. The legacy tables used by the current client
-- (`user_progress`, `verse_mastery`, `daily_activity`) remain available while
-- the synchronization layer is migrated to this model.
--
-- Design rules:
--   1. `auth.users` stays the single source of truth for identities.
--   2. Quran text is immutable reference data, imported from a verified
--      edition with a checksum. It is never generated or rewritten by the app.
--   3. Session ayahs and recitation errors are stored as relations, never as
--      arrays of numbers or free-form text blobs.
--   4. Every user-owned table is protected by row level security.
-- ============================================================================

-- ────────────────────────────────────────────────────────────
-- Helpers
-- ────────────────────────────────────────────────────────────

create or replace function public.set_quran_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- Profile and aggregate statistics
-- ────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  daily_verse_goal integer not null default 10
    check (daily_verse_goal between 1 and 100),
  locale text not null default 'ar',
  timezone text not null default 'UTC',
  revision_reminder_enabled boolean not null default false,
  revision_reminder_time time not null default '09:00',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  points integer not null default 0 check (points >= 0),
  level text not null default 'مبتدئ' check (length(btrim(level)) > 0),
  streak_days integer not null default 0 check (streak_days >= 0),
  last_active_date date,
  total_verses_recited integer not null default 0 check (total_verses_recited >= 0),
  total_recited_seconds integer not null default 0 check (total_recited_seconds >= 0),
  accuracy_rate numeric(5, 2) not null default 0
    check (accuracy_rate between 0 and 100),
  mistakes_fixed_count integer not null default 0 check (mistakes_fixed_count >= 0),
  completed_surahs smallint[] not null default '{}',
  unlocked_badge_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- Reuse the existing daily_activity table when the legacy migration has already
-- been applied; create the same shape for fresh installations.
create table if not exists public.daily_activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_date date not null,
  verses integer not null default 0 check (verses >= 0),
  sessions integer not null default 0 check (sessions >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_date)
);

-- Create the 1:1 rows automatically when an account is created.
create or replace function public.handle_new_quran_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;

  insert into public.user_stats (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_quran_profile on auth.users;
create trigger on_auth_user_created_quran_profile
  after insert on auth.users
  for each row execute function public.handle_new_quran_user();

-- Accounts created before this migration also need their 1:1 rows.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

insert into public.user_stats (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ────────────────────────────────────────────────────────────
-- Quran reference data (read-only for clients)
-- ────────────────────────────────────────────────────────────

create table if not exists public.surahs (
  number smallint primary key check (number between 1 and 114),
  name_ar text not null check (length(btrim(name_ar)) > 0),
  name_en text not null check (length(btrim(name_en)) > 0),
  revelation_place text not null
    check (revelation_place in ('makkah', 'madinah')),
  ayah_count smallint not null check (ayah_count between 1 and 286),
  juz_start smallint check (juz_start between 1 and 30),
  page_start smallint check (page_start between 1 and 604)
);

-- An edition is a fixed, verifiable source of Quranic text (Uthmani script,
-- tafsir, translation…). Corrections require publishing a new edition version.
create table if not exists public.quran_editions (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  kind text not null check (kind in ('quran', 'tafsir', 'translation')),
  name_ar text not null check (length(btrim(name_ar)) > 0),
  source_name text not null check (length(btrim(source_name)) > 0),
  source_url text,
  source_version text not null check (length(btrim(source_version)) > 0),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  is_verified boolean not null default false,
  imported_at timestamptz not null default now()
);

-- Canonical ayah identity. Text lives in `ayah_texts` so the same ayah can
-- expose the Uthmani edition, a tafsir edition and translations independently.
create table if not exists public.ayahs (
  id bigint generated always as identity primary key,
  surah_number smallint not null
    references public.surahs (number) on delete restrict,
  ayah_number smallint not null check (ayah_number > 0),
  unique (surah_number, ayah_number)
);

create table if not exists public.ayah_texts (
  ayah_id bigint not null references public.ayahs (id) on delete cascade,
  edition_id text not null references public.quran_editions (id) on delete restrict,
  text text not null check (length(btrim(text)) > 0),
  primary key (ayah_id, edition_id)
);

create index if not exists ayah_texts_edition_idx
  on public.ayah_texts (edition_id);

-- Verified editions are append-only. A correction must be imported as a new
-- edition/version instead of silently changing existing Quranic text.
create or replace function public.protect_verified_ayah_text()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  edition_is_verified boolean;
begin
  select e.is_verified
    into edition_is_verified
    from public.quran_editions e
   where e.id = old.edition_id;

  if coalesce(edition_is_verified, false) then
    if tg_op = 'DELETE' then
      raise exception
        'Verified Quran editions are immutable. Import a new edition version instead.';
    end if;

    if new.text is distinct from old.text
       or new.ayah_id is distinct from old.ayah_id
       or new.edition_id is distinct from old.edition_id then
      raise exception
        'Verified Quran editions are immutable. Import a new edition version instead.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists ayah_texts_protect_verified_update on public.ayah_texts;
create trigger ayah_texts_protect_verified_update
  before update on public.ayah_texts
  for each row execute function public.protect_verified_ayah_text();

drop trigger if exists ayah_texts_protect_verified_delete on public.ayah_texts;
create trigger ayah_texts_protect_verified_delete
  before delete on public.ayah_texts
  for each row execute function public.protect_verified_ayah_text();

-- ────────────────────────────────────────────────────────────
-- Memorization progress and spaced repetition
-- ────────────────────────────────────────────────────────────

-- Pedagogical state of a verse for a user.
create table if not exists public.memorization_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  ayah_id bigint not null references public.ayahs (id) on delete cascade,
  status text not null default 'new'
    check (status in ('new', 'learning', 'review_needed', 'good', 'mastered')),
  is_target boolean not null default false,
  consecutive_success_count integer not null default 0
    check (consecutive_success_count >= 0),
  mistake_count integer not null default 0 check (mistake_count >= 0),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, ayah_id)
);

create index if not exists memorization_progress_user_status_idx
  on public.memorization_progress (user_id, status);

create index if not exists memorization_progress_user_target_idx
  on public.memorization_progress (user_id)
  where is_target;

-- SM-2 scheduling state. `memorization_progress` owns the pedagogical state;
-- this table owns the next review queue so the two concerns do not diverge.
create table if not exists public.review_schedule (
  user_id uuid not null references auth.users (id) on delete cascade,
  ayah_id bigint not null references public.ayahs (id) on delete cascade,
  due_at timestamptz not null,
  last_result text check (last_result in ('success', 'failure', 'skipped')),
  last_reviewed_at timestamptz,
  interval_days integer not null default 1 check (interval_days >= 1),
  ease_factor numeric(4, 2) not null default 2.50 check (ease_factor >= 1.30),
  repetition_count integer not null default 0 check (repetition_count >= 0),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'due', 'completed', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, ayah_id)
);

create index if not exists review_schedule_user_due_idx
  on public.review_schedule (user_id, due_at)
  where status in ('scheduled', 'due');

-- ────────────────────────────────────────────────────────────
-- Recitation sessions
-- ────────────────────────────────────────────────────────────

create table if not exists public.recitation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  surah_number smallint references public.surahs (number) on delete set null,
  ayah_start smallint check (ayah_start > 0),
  ayah_end smallint check (ayah_end > 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'completed', 'failed')),
  result text check (result in ('flawless', 'needs_review', 'abandoned')),
  accuracy numeric(5, 2) check (accuracy between 0 and 100),
  recognition_engine text
    check (recognition_engine in ('browser', 'whisper', 'manual')),
  model_name text,
  model_version text,
  audio_storage_path text,
  created_at timestamptz not null default now(),
  constraint recitation_sessions_range_check
    check (ayah_start is null or ayah_end is null or ayah_end >= ayah_start),
  constraint recitation_sessions_time_check
    check (ended_at is null or ended_at >= started_at)
);

create index if not exists recitation_sessions_user_started_idx
  on public.recitation_sessions (user_id, started_at desc);

-- The verses requested for one session. Results are stored per ayah instead of
-- in a single JSON array, which keeps analytics and error joins simple.
create table if not exists public.session_ayahs (
  id bigint generated always as identity primary key,
  session_id uuid not null
    references public.recitation_sessions (id) on delete cascade,
  ayah_id bigint not null references public.ayahs (id) on delete restrict,
  position smallint not null check (position > 0),
  result text check (result in ('flawless', 'needs_review', 'skipped')),
  recognized_text text,
  confidence numeric(4, 3) check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique (session_id, position)
);

create index if not exists session_ayahs_ayah_idx
  on public.session_ayahs (ayah_id);

-- A user can confirm or reject each automatically detected difference, which
-- keeps ASR noise separate from genuine recitation mistakes.
create table if not exists public.recitation_errors (
  id bigint generated always as identity primary key,
  session_ayah_id bigint not null
    references public.session_ayahs (id) on delete cascade,
  error_type text not null
    check (error_type in ('missing', 'extra', 'substitution', 'mispronunciation')),
  word_index smallint check (word_index >= 0),
  expected_word text,
  recognized_word text,
  confidence numeric(4, 3) check (confidence between 0 and 1),
  user_confirmation text not null default 'pending'
    check (user_confirmation in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  constraint recitation_errors_value_check
    check (expected_word is not null or recognized_word is not null)
);

create index if not exists recitation_errors_session_ayah_idx
  on public.recitation_errors (session_ayah_id);

-- ────────────────────────────────────────────────────────────
-- updated_at triggers
-- ────────────────────────────────────────────────────────────

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_quran_updated_at();

drop trigger if exists user_stats_set_updated_at on public.user_stats;
create trigger user_stats_set_updated_at
  before update on public.user_stats
  for each row execute function public.set_quran_updated_at();

drop trigger if exists daily_activity_set_updated_at on public.daily_activity;
create trigger daily_activity_set_updated_at
  before update on public.daily_activity
  for each row execute function public.set_quran_updated_at();

drop trigger if exists memorization_progress_set_updated_at
  on public.memorization_progress;
create trigger memorization_progress_set_updated_at
  before update on public.memorization_progress
  for each row execute function public.set_quran_updated_at();

drop trigger if exists review_schedule_set_updated_at on public.review_schedule;
create trigger review_schedule_set_updated_at
  before update on public.review_schedule
  for each row execute function public.set_quran_updated_at();

-- ────────────────────────────────────────────────────────────
-- Grants and row level security
-- ────────────────────────────────────────────────────────────

grant select on public.surahs, public.quran_editions, public.ayahs, public.ayah_texts
  to anon, authenticated;

grant select, insert, update, delete on public.profiles, public.user_stats,
  public.daily_activity, public.memorization_progress, public.review_schedule,
  public.recitation_sessions, public.session_ayahs, public.recitation_errors
  to authenticated;

alter table public.profiles enable row level security;
alter table public.user_stats enable row level security;
alter table public.daily_activity enable row level security;
alter table public.surahs enable row level security;
alter table public.quran_editions enable row level security;
alter table public.ayahs enable row level security;
alter table public.ayah_texts enable row level security;
alter table public.memorization_progress enable row level security;
alter table public.review_schedule enable row level security;
alter table public.recitation_sessions enable row level security;
alter table public.session_ayahs enable row level security;
alter table public.recitation_errors enable row level security;

-- Read-only reference data.
drop policy if exists "Quran reference data is readable" on public.surahs;
create policy "Quran reference data is readable"
  on public.surahs for select to anon, authenticated using (true);

drop policy if exists "Quran editions are readable" on public.quran_editions;
create policy "Quran editions are readable"
  on public.quran_editions for select to anon, authenticated using (true);

drop policy if exists "Ayahs are readable" on public.ayahs;
create policy "Ayahs are readable"
  on public.ayahs for select to anon, authenticated using (true);

drop policy if exists "Ayah texts are readable" on public.ayah_texts;
create policy "Ayah texts are readable"
  on public.ayah_texts for select to anon, authenticated using (true);

-- User-owned rows.
drop policy if exists "Users manage their own profile" on public.profiles;
create policy "Users manage their own profile"
  on public.profiles for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Users manage their own stats" on public.user_stats;
create policy "Users manage their own stats"
  on public.user_stats for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can access their own daily activity" on public.daily_activity;
drop policy if exists "Users manage their own daily activity" on public.daily_activity;
create policy "Users manage their own daily activity"
  on public.daily_activity for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users manage their own memorization progress"
  on public.memorization_progress;
create policy "Users manage their own memorization progress"
  on public.memorization_progress for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users manage their own review schedule"
  on public.review_schedule;
create policy "Users manage their own review schedule"
  on public.review_schedule for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users manage their own recitation sessions"
  on public.recitation_sessions;
create policy "Users manage their own recitation sessions"
  on public.recitation_sessions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Child rows inherit ownership through their parent session.
drop policy if exists "Users manage their own session ayahs" on public.session_ayahs;
create policy "Users manage their own session ayahs"
  on public.session_ayahs for all to authenticated
  using (
    exists (
      select 1
        from public.recitation_sessions s
       where s.id = session_ayahs.session_id
         and s.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
        from public.recitation_sessions s
       where s.id = session_ayahs.session_id
         and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users manage their own recitation errors"
  on public.recitation_errors;
create policy "Users manage their own recitation errors"
  on public.recitation_errors for all to authenticated
  using (
    exists (
      select 1
        from public.session_ayahs sa
        join public.recitation_sessions s on s.id = sa.session_id
       where sa.id = recitation_errors.session_ayah_id
         and s.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
        from public.session_ayahs sa
        join public.recitation_sessions s on s.id = sa.session_id
       where sa.id = recitation_errors.session_ayah_id
         and s.user_id = (select auth.uid())
    )
  );
