/**
 * Applies the migrations and the generated Quran text seed to an in-memory
 * PostgreSQL (PGlite) and verifies the imported mushaf end to end:
 * 114 surahs, 6,236 ayahs, 6,236 texts identical to the checked source, an
 * idempotent re-import and immutable verified text.
 *
 * No Docker or live Supabase project is required:
 *   npm run test:seed
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

const seedDir = resolve(root, 'supabase/seed');
const manifestPath = resolve(seedDir, 'quran-uthmani.manifest.json');

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
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const seedSql = await readFile(resolve(seedDir, manifest.sqlFile), 'utf8');
  const sourcePath = resolve(seedDir, 'sources', `tanzil-uthmani-${manifest.sourceVersion}.json`);
  const source = JSON.parse(await readFile(sourcePath, 'utf8'));

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

  for (const migration of migrations) {
    await db.exec(await readFile(resolve(root, migration), 'utf8'));
  }

  await db.exec(seedSql);
  check(`seed ${manifest.sqlFile} applies to the schema`, true);

  const edition = await db.query(
    `select id, source_name, source_version, checksum_sha256, is_verified
       from public.quran_editions
      where id = $1`,
    [manifest.editionId],
  );
  const editionRow = edition.rows[0] ?? {};
  check(
    'the edition records its verified source and checksum',
    editionRow.checksum_sha256 === manifest.sourceSha256 &&
      editionRow.is_verified === true &&
      editionRow.source_name === manifest.sourceName &&
      editionRow.source_version === manifest.sourceVersion,
    `${editionRow.id ?? 'missing'}`,
  );

  const counts = await db.query(
    `
    select
      (select count(*)::int from public.surahs) as surahs,
      (select count(*)::int from public.ayahs) as ayahs,
      (select count(*)::int from public.ayah_texts where edition_id = $1) as texts
  `,
    [manifest.editionId],
  );
  const countRow = counts.rows[0];
  check(
    'the mushaf is complete: 114 surahs, 6,236 ayahs, 6,236 texts',
    countRow.surahs === 114 && countRow.ayahs === 6236 && countRow.texts === 6236,
    `${countRow.surahs} surahs / ${countRow.ayahs} ayahs / ${countRow.texts} texts`,
  );

  const perSurah = await db.query(`
    select count(*)::int as mismatched
      from (
        select s.number, s.ayah_count, count(a.id)::int as actual
          from public.surahs s
          left join public.ayahs a on a.surah_number = s.number
         group by s.number, s.ayah_count
        having count(a.id) <> s.ayah_count
      ) t
  `);
  check('every surah has its canonical ayah count', perSurah.rows[0].mismatched === 0);

  const rows = await db.query(
    `
    select a.surah_number as surah, a.ayah_number as ayah, t.text
      from public.ayah_texts t
      join public.ayahs a on a.id = t.ayah_id
     where t.edition_id = $1
     order by a.surah_number, a.ayah_number
  `,
    [manifest.editionId],
  );

  const sourceAyahs = Object.entries(source);
  const differences = rows.rows.filter((row) => source[`${row.surah}:${row.ayah}`] !== row.text);
  check(
    'every stored text is identical to the checked source',
    rows.rows.length === sourceAyahs.length && differences.length === 0,
    `${rows.rows.length} texts compared`,
  );

  const empty = rows.rows.filter((row) => !row.text.trim()).length;
  check('no stored ayah is empty', empty === 0);

  await db.exec(seedSql);
  const afterRerun = await db.query(`
    select
      (select count(*)::int from public.ayahs) as ayahs,
      (select count(*)::int from public.ayah_texts) as texts
  `);
  check(
    're-applying the seed is idempotent',
    afterRerun.rows[0].ayahs === 6236 && afterRerun.rows[0].texts === 6236,
    `${afterRerun.rows[0].ayahs} ayahs / ${afterRerun.rows[0].texts} texts`,
  );

  const sample = await db.query(
    `
    select t.text
      from public.ayah_texts t
      join public.ayahs a on a.id = t.ayah_id
     where t.edition_id = $1 and a.surah_number = 1 and a.ayah_number = 1
  `,
    [manifest.editionId],
  );
  check(
    'the first ayah keeps its Uthmani text',
    sample.rows[0]?.text === source['1:1'],
    sample.rows[0]?.text,
  );

  await expectError(
    'verified Quran text cannot be updated',
    `update public.ayah_texts set text = 'changed' where edition_id = '${manifest.editionId}'`,
    'immutable',
  );
  await expectError(
    'verified Quran text cannot be deleted',
    `delete from public.ayah_texts where edition_id = '${manifest.editionId}'`,
    'immutable',
  );
} catch (error) {
  console.error('\nUNEXPECTED FAILURE');
  console.error(error);
  process.exitCode = 1;
}

const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} seed checks passed`);
if (failed.length > 0) process.exitCode = 1;

await db.close();
