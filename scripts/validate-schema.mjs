/**
 * Applies the SQL migrations to an in-memory PostgreSQL (PGlite) and checks
 * the schema, RLS policies, triggers and immutable Quran text rules.
 *
 * No Docker or live Supabase project is required:
 *   npm run test:schema
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

const migrations = [
  'supabase/migrations/20261015200000_progress_sync.sql',
  'supabase/migrations/20261029090000_normalized_quran_schema.sql',
  'supabase/migrations/20261029100000_drop_legacy_progress.sql',
  'supabase/migrations/20261029110000_cap_review_schedule.sql',
];

const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const db = new PGlite();

async function expectError(name, sql, fragment) {
  try {
    await db.exec(sql);
    check(name, false, 'no error raised');
  } catch (error) {
    const message = String(error?.message ?? error);
    check(name, message.toLowerCase().includes(fragment.toLowerCase()), message.split('\n')[0]);
  }
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text
    );
    create function auth.uid() returns uuid
      language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);

  const userA = '11111111-1111-1111-1111-111111111111';
  const userB = '22222222-2222-2222-2222-222222222222';
  await db.exec(`
    insert into auth.users (id, email) values
      ('${userA}', 'a@example.com'),
      ('${userB}', 'b@example.com');
  `);

  const applyMigration = async (index) => {
    const sql = await readFile(resolve(root, migrations[index]), 'utf8');
    await db.exec(sql);
  };

  await applyMigration(0);
  await applyMigration(1);
  check('legacy and normalized migrations apply cleanly', true);

  await db.exec(`
    insert into public.surahs
      (number, name_ar, name_en, revelation_place, ayah_count, juz_start, page_start)
    values
      (1, 'الفاتحة', 'Al-Faatiha', 'makkah', 7, 1, 1);

    insert into public.quran_editions
      (id, kind, name_ar, source_name, source_url, source_version, checksum_sha256, is_verified)
    values
      ('quran-uthmani', 'quran', 'الرسم العثماني', 'test', 'https://example.com', '1', repeat('a', 64), true);

    insert into public.ayahs (surah_number, ayah_number)
    values (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7);

    insert into public.ayah_texts (ayah_id, edition_id, text)
    select id, 'quran-uthmani', 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'
      from public.ayahs
     where surah_number = 1 and ayah_number = 1;
  `);

  // Snapshots written by the legacy client, including a fractional ease factor
  // and a review due in the past.
  await db.exec(`
    insert into public.user_progress (user_id, stats) values (
      '${userA}',
      '{"points": 777, "level": "حافظ مبتدئ", "streakDays": 5,
        "lastActiveDate": "2026-01-09T20:00:00.000Z", "totalVersesRecited": 120,
        "totalRecitedSeconds": 1800, "accuracyRate": 91.2, "mistakesFixedCount": 4,
        "completedSurahs": [1], "unlockedBadgeIds": ["first_recitation"]}'::jsonb
    );

    insert into public.verse_mastery (user_id, surah_number, ayah_number, mastery) values (
      '${userA}', 1, 1,
      '{"surahNumber": 1, "ayahNumber": 1, "level": "mastered",
        "consecutiveSuccessCount": 3, "mistakeCount": 1, "repetitionCount": 2,
        "easeFactor": 2.7, "intervalDays": 6,
        "lastReviewedAt": "2026-01-05T08:00:00.000Z",
        "nextReviewAt": "2026-01-11T08:00:00.000Z", "recentMistakes": []}'::jsonb
    );
  `);

  await applyMigration(2);
  check('the cutover migration applies cleanly', true);

  const tables = await db.query(`
    select table_name
      from information_schema.tables
     where table_schema = 'public'
     order by table_name
  `);
  const tableNames = tables.rows.map((row) => row.table_name);
  const expectedTables = [
    'ayah_texts',
    'ayahs',
    'daily_activity',
    'memorization_progress',
    'profiles',
    'quran_editions',
    'recitation_errors',
    'recitation_sessions',
    'review_schedule',
    'session_ayahs',
    'surahs',
    'user_stats',
  ];
  check(
    'all expected tables exist',
    expectedTables.every((name) => tableNames.includes(name)),
    `${tableNames.length} tables`,
  );
  check(
    'the legacy progress tables are gone',
    !tableNames.includes('user_progress') && !tableNames.includes('verse_mastery'),
  );

  const migratedStats = await db.query(
    `select points, streak_days, last_active_date::text as last_active_date,
            accuracy_rate::text as accuracy_rate, completed_surahs, unlocked_badge_ids
       from public.user_stats where user_id = '${userA}'`,
  );
  const statsRow = migratedStats.rows[0];
  check(
    'legacy stats were merged into user_stats',
    statsRow.points === 777 &&
      statsRow.streak_days === 5 &&
      statsRow.last_active_date === '2026-01-09' &&
      Number(statsRow.accuracy_rate) === 91.2 &&
      statsRow.completed_surahs.includes(1) &&
      statsRow.unlocked_badge_ids.includes('first_recitation'),
    `${statsRow.points} points`,
  );

  const migratedProgress = await db.query(
    `select status, consecutive_success_count, mistake_count
       from public.memorization_progress where user_id = '${userA}'`,
  );
  check(
    'legacy verse mastery was migrated into memorization_progress',
    migratedProgress.rows.length === 1 &&
      migratedProgress.rows[0].status === 'mastered' &&
      migratedProgress.rows[0].consecutive_success_count === 3 &&
      migratedProgress.rows[0].mistake_count === 1,
  );

  const migratedSchedule = await db.query(
    `select interval_days, ease_factor::text as ease_factor, repetition_count, last_result
       from public.review_schedule where user_id = '${userA}'`,
  );
  const scheduleRow = migratedSchedule.rows[0];
  check(
    'legacy review schedule was migrated into review_schedule',
    migratedSchedule.rows.length === 1 &&
      scheduleRow.interval_days === 6 &&
      Number(scheduleRow.ease_factor) === 2.7 &&
      scheduleRow.repetition_count === 2 &&
      scheduleRow.last_result === 'success',
  );

  // Repair of the pre-cap SM-2 rows: a 200-year interval must come back to one
  // year, the ease factor to 3.00, while a suspended schedule keeps its status.
  await db.exec(`
    update public.review_schedule
       set interval_days = 73183, ease_factor = 5.16,
           due_at = now() + interval '200 years'
     where user_id = '${userA}';

    insert into public.review_schedule
      (user_id, ayah_id, due_at, last_result, last_reviewed_at, interval_days, ease_factor,
       repetition_count, status)
    select '${userB}', id, now() + interval '50 years', 'success', now() - interval '10 days',
           18250, 4.2, 9, 'suspended'
      from public.ayahs where surah_number = 1 and ayah_number = 2;
  `);

  await applyMigration(3);

  const cappedRows = await db.query(`
    select user_id, interval_days, ease_factor::text as ease_factor, status,
           due_at = last_reviewed_at + interval '365 days' as due_from_last_review
      from public.review_schedule
     where user_id in ('${userA}', '${userB}')
     order by user_id
  `);
  const [cappedActive, cappedSuspended] = cappedRows.rows;
  check(
    'absurd review intervals are capped to one year',
    cappedRows.rows.length === 2 &&
      cappedActive.interval_days === 365 &&
      Number(cappedActive.ease_factor) === 3 &&
      cappedActive.status === 'scheduled' &&
      cappedActive.due_from_last_review === true,
    `${cappedActive.interval_days} days / ease ${cappedActive.ease_factor}`,
  );
  check(
    'the cap preserves a suspended schedule',
    cappedSuspended.interval_days === 365 &&
      Number(cappedSuspended.ease_factor) === 3 &&
      cappedSuspended.status === 'suspended',
    `status ${cappedSuspended.status}`,
  );

  // Reset the migrated rows so the RLS checks below start from a clean state.
  await db.exec(`delete from public.memorization_progress; delete from public.review_schedule;`);

  const protectedTables = [
    'profiles',
    'user_stats',
    'daily_activity',
    'memorization_progress',
    'review_schedule',
    'recitation_sessions',
    'session_ayahs',
    'recitation_errors',
  ];
  const rls = await db.query(
    `
    select relname, relrowsecurity
      from pg_class
     where relname = any($1::text[])
  `,
    [protectedTables],
  );
  check(
    'row level security is enabled on user data',
    rls.rows.length === protectedTables.length && rls.rows.every((row) => row.relrowsecurity),
    `${rls.rows.filter((row) => row.relrowsecurity).length}/${protectedTables.length}`,
  );

  const grants = await db.query(`
    select
      has_table_privilege('authenticated', 'public.ayah_texts', 'insert') as can_insert_text,
      has_table_privilege('authenticated', 'public.quran_editions', 'insert') as can_insert_edition,
      has_table_privilege('authenticated', 'public.memorization_progress', 'insert') as can_insert_progress,
      has_table_privilege('anon', 'public.ayahs', 'select') as anon_can_read_ayahs
  `);
  const grantRow = grants.rows[0];
  check(
    'reference data is read-only for authenticated clients',
    !grantRow.can_insert_text && !grantRow.can_insert_edition && grantRow.anon_can_read_ayahs,
  );
  check('users can write their own progress', grantRow.can_insert_progress === true);

  const triggers = await db.query(`
    select tgname from pg_trigger where not tgisinternal order by tgname
  `);
  const triggerNames = triggers.rows.map((row) => row.tgname);
  const requiredTriggers = [
    'ayah_texts_protect_verified_update',
    'ayah_texts_protect_verified_delete',
    'memorization_progress_set_updated_at',
    'profiles_set_updated_at',
    'review_schedule_set_updated_at',
  ];
  check(
    'immutability and updated_at triggers exist',
    requiredTriggers.every((name) => triggerNames.includes(name)),
    `${triggerNames.length} triggers`,
  );

  const profileCount = await db.query(`select count(*)::int as n from public.profiles`);
  check(
    'new accounts receive profile and stats rows',
    profileCount.rows[0].n === 2,
    `${profileCount.rows[0].n} profiles`,
  );

  const ayah = await db.query(`
    select id from public.ayahs where surah_number = 1 and ayah_number = 1
  `);
  const ayahId = ayah.rows[0].id;

  await expectError(
    'verified Quran text cannot be updated',
    `update public.ayah_texts set text = 'changed' where ayah_id = ${ayahId}`,
    'immutable',
  );
  await expectError(
    'verified Quran text cannot be deleted',
    `delete from public.ayah_texts where ayah_id = ${ayahId}`,
    'immutable',
  );

  await db.exec(`
    set role authenticated;
    select set_config('request.jwt.claim.sub', '${userA}', false);
  `);

  await db.exec(`
    insert into public.memorization_progress (user_id, ayah_id, status)
    values ('${userA}', ${ayahId}, 'learning');

    insert into public.review_schedule (user_id, ayah_id, due_at, last_result)
    values ('${userA}', ${ayahId}, now() + interval '1 day', 'success');

    insert into public.recitation_sessions
      (id, user_id, surah_number, ayah_start, ayah_end, processing_status, result)
    values
      ('33333333-3333-3333-3333-333333333333', '${userA}', 1, 1, 1, 'completed', 'needs_review');

    insert into public.session_ayahs (session_id, ayah_id, position, result)
    values ('33333333-3333-3333-3333-333333333333', ${ayahId}, 1, 'needs_review');

    insert into public.recitation_errors
      (session_ayah_id, error_type, word_index, expected_word, recognized_word, user_confirmation)
    select id, 'substitution', 2, 'الرحمن', 'الرحيم', 'pending'
      from public.session_ayahs
     where session_id = '33333333-3333-3333-3333-333333333333';
  `);
  check('a session, its ayah relation and errors can be recorded', true);

  await expectError(
    "RLS blocks writing another user's progress",
    `insert into public.memorization_progress (user_id, ayah_id, status)
     values ('${userB}', ${ayahId}, 'learning')`,
    'row-level security',
  );

  await expectError(
    "RLS blocks writing another user's review schedule",
    `insert into public.review_schedule (user_id, ayah_id, due_at)
     values ('${userB}', ${ayahId}, now())`,
    'row-level security',
  );

  const visibleProgress = await db.query(
    `select count(*)::int as n from public.memorization_progress`,
  );
  check(
    "RLS hides other users' progress",
    visibleProgress.rows[0].n === 1,
    `${visibleProgress.rows[0].n} visible`,
  );

  const sessionAyah = await db.query(`
    select id from public.session_ayahs
     where session_id = '33333333-3333-3333-3333-333333333333'
  `);
  const sessionAyahId = sessionAyah.rows[0].id;

  await db.exec(`select set_config('request.jwt.claim.sub', '${userB}', false);`);

  await expectError(
    "RLS blocks session ayahs on another user's session",
    `insert into public.session_ayahs (session_id, ayah_id, position)
     values ('33333333-3333-3333-3333-333333333333', ${ayahId}, 2)`,
    'row-level security',
  );

  await expectError(
    "RLS blocks errors on another user's session ayah",
    `insert into public.recitation_errors (session_ayah_id, error_type, expected_word)
     values (${sessionAyahId}, 'missing', 'word')`,
    'row-level security',
  );

  const hiddenSessions = await db.query(
    `select count(*)::int as n from public.recitation_sessions`,
  );
  check(
    "RLS hides another user's sessions",
    hiddenSessions.rows[0].n === 0,
    `${hiddenSessions.rows[0].n} visible`,
  );

  await db.exec(`set role anon;`);
  const anonAyahs = await db.query(`select count(*)::int as n from public.ayahs`);
  check(
    'reference ayahs are readable by anon',
    anonAyahs.rows[0].n === 7,
    `${anonAyahs.rows[0].n} ayahs`,
  );
  await expectError(
    'anon cannot read profiles',
    `select count(*) from public.profiles`,
    'permission denied',
  );
  await db.exec(`reset role;`);

  const updated = await db.query(`
    update public.profiles set display_name = 'A' where id = '${userA}' returning updated_at
  `);
  check('updated_at triggers touch rows', updated.rows.length === 1);
} catch (error) {
  console.error('\nUNEXPECTED FAILURE');
  console.error(error);
  process.exitCode = 1;
}

const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} schema checks passed`);
if (failed.length > 0) process.exitCode = 1;

await db.close();
