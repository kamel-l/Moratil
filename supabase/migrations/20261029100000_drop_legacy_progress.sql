-- Phase 4: fold the legacy JSON progress into the normalized tables, then drop
-- the legacy tables.
--
-- `daily_activity` is shared by both models and is kept as-is. The two dropped
-- tables (`user_progress`, `verse_mastery`) are plain JSON snapshots: this
-- migration copies their content so an account that has not connected since the
-- migration does not lose progress.
--
-- Deployment order: ship the client that reads and writes only the normalized
-- model, then apply this migration.

-- ────────────────────────────────────────────────────────────
-- Aggregate statistics: user_progress.stats → user_stats
-- ────────────────────────────────────────────────────────────

with legacy as (
  select
    up.user_id,
    case
      when jsonb_typeof(up.stats->'points') = 'number'
        then greatest(0, round((up.stats->>'points')::numeric))::integer
      else 0
    end as points,
    case
      when jsonb_typeof(up.stats->'streakDays') = 'number'
        then greatest(0, round((up.stats->>'streakDays')::numeric))::integer
      else 0
    end as streak_days,
    case
      when up.stats->>'lastActiveDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        then left(up.stats->>'lastActiveDate', 10)::date
      else null
    end as last_active_date,
    case
      when jsonb_typeof(up.stats->'totalVersesRecited') = 'number'
        then greatest(0, round((up.stats->>'totalVersesRecited')::numeric))::integer
      else 0
    end as total_verses_recited,
    case
      when jsonb_typeof(up.stats->'totalRecitedSeconds') = 'number'
        then greatest(0, round((up.stats->>'totalRecitedSeconds')::numeric))::integer
      else 0
    end as total_recited_seconds,
    case
      when jsonb_typeof(up.stats->'accuracyRate') = 'number'
        then least(100, greatest(0, round((up.stats->>'accuracyRate')::numeric, 2)))
      else 0
    end as accuracy_rate,
    case
      when jsonb_typeof(up.stats->'mistakesFixedCount') = 'number'
        then greatest(0, round((up.stats->>'mistakesFixedCount')::numeric))::integer
      else 0
    end as mistakes_fixed_count,
    case
      when jsonb_typeof(up.stats->'completedSurahs') = 'array'
        then coalesce(
          (
            select array_agg(distinct value::smallint)
            from jsonb_array_elements_text(up.stats->'completedSurahs') as entries(value)
            where value ~ '^[0-9]+$'
          ),
          '{}'::smallint[]
        )
      else '{}'::smallint[]
    end as completed_surahs,
    case
      when jsonb_typeof(up.stats->'unlockedBadgeIds') = 'array'
        then coalesce(
          (
            select array_agg(distinct value)
            from jsonb_array_elements_text(up.stats->'unlockedBadgeIds') as entries(value)
          ),
          '{}'::text[]
        )
      else '{}'::text[]
    end as unlocked_badge_ids
  from public.user_progress up
  where jsonb_typeof(up.stats) = 'object'
)
update public.user_stats us
set
  points = greatest(us.points, legacy.points),
  level = case
    when greatest(us.points, legacy.points) >= 5000 then 'حافظ متقن ومجاز'
    when greatest(us.points, legacy.points) >= 3000 then 'فارس الحُفاظ'
    when greatest(us.points, legacy.points) >= 1500 then 'طالب إتقان متقدم'
    when greatest(us.points, legacy.points) > 0 then 'حافظ مبتدئ'
    else 'مبتدئ'
  end,
  streak_days = greatest(us.streak_days, legacy.streak_days),
  last_active_date = greatest(us.last_active_date, legacy.last_active_date),
  total_verses_recited = greatest(us.total_verses_recited, legacy.total_verses_recited),
  total_recited_seconds = greatest(us.total_recited_seconds, legacy.total_recited_seconds),
  accuracy_rate = least(100, greatest(us.accuracy_rate, legacy.accuracy_rate)),
  mistakes_fixed_count = greatest(us.mistakes_fixed_count, legacy.mistakes_fixed_count),
  completed_surahs = (
    select coalesce(array_agg(distinct value), '{}'::smallint[])
    from unnest(us.completed_surahs || legacy.completed_surahs) as entries(value)
  ),
  unlocked_badge_ids = (
    select coalesce(array_agg(distinct value), '{}'::text[])
    from unnest(us.unlocked_badge_ids || legacy.unlocked_badge_ids) as entries(value)
  )
from legacy
where us.user_id = legacy.user_id;

-- ────────────────────────────────────────────────────────────
-- Verse mastery: verse_mastery.mastery → memorization_progress + review_schedule
-- ────────────────────────────────────────────────────────────

with legacy as (
  select
    vm.user_id,
    a.id as ayah_id,
    case
      when vm.mastery->>'level' in ('new', 'learning', 'review_needed', 'good', 'mastered')
        then vm.mastery->>'level'
      else 'new'
    end as status,
    case
      when jsonb_typeof(vm.mastery->'consecutiveSuccessCount') = 'number'
        then greatest(0, round((vm.mastery->>'consecutiveSuccessCount')::numeric))::integer
      else 0
    end as consecutive_success_count,
    case
      when jsonb_typeof(vm.mastery->'mistakeCount') = 'number'
        then greatest(0, round((vm.mastery->>'mistakeCount')::numeric))::integer
      else 0
    end as mistake_count,
    case
      when vm.mastery->>'lastReviewedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        then (vm.mastery->>'lastReviewedAt')::timestamptz
      else now()
    end as last_reviewed_at,
    case
      when vm.mastery->>'nextReviewAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        then (vm.mastery->>'nextReviewAt')::timestamptz
      else null
    end as next_review_at,
    case
      when jsonb_typeof(vm.mastery->'intervalDays') = 'number'
        then greatest(1, round((vm.mastery->>'intervalDays')::numeric))::integer
      else 1
    end as interval_days,
    case
      when jsonb_typeof(vm.mastery->'easeFactor') = 'number'
        then least(9.99, greatest(1.30, round((vm.mastery->>'easeFactor')::numeric, 2)))
      else 2.50
    end as ease_factor,
    case
      when jsonb_typeof(vm.mastery->'repetitionCount') = 'number'
        then greatest(0, round((vm.mastery->>'repetitionCount')::numeric))::integer
      else 0
    end as repetition_count
  from public.verse_mastery vm
  join public.ayahs a
    on a.surah_number = (vm.mastery->>'surahNumber')::smallint
   and a.ayah_number = (vm.mastery->>'ayahNumber')::smallint
  where vm.mastery->>'surahNumber' ~ '^[0-9]+$'
    and vm.mastery->>'ayahNumber' ~ '^[0-9]+$'
)
insert into public.memorization_progress
  (user_id, ayah_id, status, consecutive_success_count, mistake_count, last_reviewed_at)
select
  legacy.user_id,
  legacy.ayah_id,
  legacy.status,
  legacy.consecutive_success_count,
  legacy.mistake_count,
  legacy.last_reviewed_at
from legacy
on conflict (user_id, ayah_id) do update
set
  status = excluded.status,
  consecutive_success_count = excluded.consecutive_success_count,
  mistake_count = excluded.mistake_count,
  last_reviewed_at = excluded.last_reviewed_at
where memorization_progress.last_reviewed_at is null
   or excluded.last_reviewed_at > memorization_progress.last_reviewed_at;

with legacy as (
  select
    vm.user_id,
    a.id as ayah_id,
    case
      when vm.mastery->>'lastReviewedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        then (vm.mastery->>'lastReviewedAt')::timestamptz
      else now()
    end as last_reviewed_at,
    case
      when vm.mastery->>'nextReviewAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        then (vm.mastery->>'nextReviewAt')::timestamptz
      else null
    end as next_review_at,
    case
      when vm.mastery->>'level' = 'new' then null
      when vm.mastery->>'level' = 'review_needed' then 'failure'
      else 'success'
    end as last_result,
    case
      when jsonb_typeof(vm.mastery->'intervalDays') = 'number'
        then greatest(1, round((vm.mastery->>'intervalDays')::numeric))::integer
      else 1
    end as interval_days,
    case
      when jsonb_typeof(vm.mastery->'easeFactor') = 'number'
        then least(9.99, greatest(1.30, round((vm.mastery->>'easeFactor')::numeric, 2)))
      else 2.50
    end as ease_factor,
    case
      when jsonb_typeof(vm.mastery->'repetitionCount') = 'number'
        then greatest(0, round((vm.mastery->>'repetitionCount')::numeric))::integer
      else 0
    end as repetition_count
  from public.verse_mastery vm
  join public.ayahs a
    on a.surah_number = (vm.mastery->>'surahNumber')::smallint
   and a.ayah_number = (vm.mastery->>'ayahNumber')::smallint
  where vm.mastery->>'surahNumber' ~ '^[0-9]+$'
    and vm.mastery->>'ayahNumber' ~ '^[0-9]+$'
)
insert into public.review_schedule
  (user_id, ayah_id, due_at, last_result, last_reviewed_at, interval_days, ease_factor,
   repetition_count, status)
select
  legacy.user_id,
  legacy.ayah_id,
  coalesce(legacy.next_review_at, legacy.last_reviewed_at),
  legacy.last_result,
  legacy.last_reviewed_at,
  legacy.interval_days,
  legacy.ease_factor,
  legacy.repetition_count,
  case
    when coalesce(legacy.next_review_at, legacy.last_reviewed_at) <= now() then 'due'
    else 'scheduled'
  end
from legacy
on conflict (user_id, ayah_id) do update
set
  due_at = excluded.due_at,
  last_result = excluded.last_result,
  last_reviewed_at = excluded.last_reviewed_at,
  interval_days = excluded.interval_days,
  ease_factor = excluded.ease_factor,
  repetition_count = excluded.repetition_count,
  status = excluded.status
where review_schedule.last_reviewed_at is null
   or excluded.last_reviewed_at > review_schedule.last_reviewed_at;

-- ────────────────────────────────────────────────────────────
-- Drop the legacy snapshots
-- ────────────────────────────────────────────────────────────

drop table if exists public.verse_mastery;
drop table if exists public.user_progress;
