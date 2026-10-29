/**
 * Applies the migrations and the Quran seed to a hosted Supabase project
 * through the Management API (`POST /v1/projects/{ref}/database/query`).
 *
 * It exists because the project has no local `psql` and Docker is unavailable.
 * The access token is read from a file or an environment variable and is never
 * printed. Never run this from the client application.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=... node scripts/apply-supabase.mjs --project-ref <ref> --migrations
 *   node scripts/apply-supabase.mjs --project-ref <ref> --seed --token-file <path>
 *
 * Options:
 *   --project-ref <ref>   Project reference (default: read from .env.local).
 *   --token-file <path>   File containing the personal access token.
 *   --migrations          Apply supabase/migrations/*.sql in name order.
 *   --seed                Apply supabase/seed/quran-uthmani.sql.
 *   --sql <path>          Apply an arbitrary SQL file (repeatable).
 *   --verify              Print mushaf counts after applying.
 *   --dry-run             Print what would be applied without calling the API.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const API_BASE = 'https://api.supabase.com/v1';

const MIGRATIONS = [
  'supabase/migrations/20261015200000_progress_sync.sql',
  'supabase/migrations/20261029090000_normalized_quran_schema.sql',
];

const VERIFY_SQL = `
  select
    (select count(*) from public.surahs) as surahs,
    (select count(*) from public.ayahs) as ayahs,
    (select count(*) from public.ayah_texts where edition_id = 'quran-uthmani') as texts,
    (select checksum_sha256 from public.quran_editions where id = 'quran-uthmani') as checksum,
    (
      select count(*)
        from (
          select s.number
            from public.surahs s
            left join public.ayahs a on a.surah_number = s.number
           group by s.number, s.ayah_count
          having count(a.id) <> s.ayah_count
        ) mismatch
    ) as surahs_with_wrong_count;
`;

function parseArgs(argv) {
  const args = { sql: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    const next = argv[index + 1];
    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
    } else if (next !== undefined && !next.startsWith('--')) {
      args[rawKey] = next;
      index += 1;
    } else {
      args[rawKey] = true;
    }
  }
  return args;
}

async function resolveProjectRef(args) {
  if (typeof args['project-ref'] === 'string') return args['project-ref'];

  const env = await readFile(resolve(root, '.env.local'), 'utf8').catch(() => '');
  const match = /^VITE_SUPABASE_URL=(.+)$/m.exec(env);
  const url = match?.[1]?.trim().replace(/^["']|["']$/g, '');
  const ref = url ? new URL(url).hostname.split('.')[0] : '';
  if (!/^[a-z0-9]{20}$/.test(ref)) {
    throw new Error('Unable to determine the project ref. Pass --project-ref.');
  }
  return ref;
}

async function resolveToken(args) {
  if (typeof args['token-file'] === 'string') {
    const token = (await readFile(resolve(args['token-file']), 'utf8')).trim();
    if (token) return token;
    throw new Error('The token file is empty.');
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (token) return token;
  throw new Error('No access token. Pass --token-file or set SUPABASE_ACCESS_TOKEN.');
}

function redact(message) {
  return String(message ?? '');
}

async function call(projectRef, token, path, init = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} on ${path}: ${redact(text).slice(0, 800)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function runSql(projectRef, token, sql, label) {
  process.stdout.write(`→ ${label} (${Math.round(sql.length / 1024)} kB)… `);
  const startedAt = Date.now();
  await call(projectRef, token, `/projects/${projectRef}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query: sql }),
  });
  console.log(`ok in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRef = await resolveProjectRef(args);

  const jobs = [];
  if (args.migrations) {
    for (const file of MIGRATIONS) {
      const sql = await readFile(resolve(root, file), 'utf8');
      jobs.push({ label: file, sql: `begin;\n${sql}\ncommit;` });
    }
  }
  if (args.seed) {
    const sql = await readFile(resolve(root, 'supabase/seed/quran-uthmani.sql'), 'utf8');
    jobs.push({ label: 'supabase/seed/quran-uthmani.sql', sql });
  }
  for (const file of args.sql) {
    const sql = await readFile(resolve(file), 'utf8');
    jobs.push({ label: file, sql });
  }

  if (jobs.length === 0 && !args.verify) {
    throw new Error('Nothing to do: pass --migrations, --seed or --sql <path>.');
  }

  console.log(`Project: ${projectRef}`);
  if (args['dry-run']) {
    for (const job of jobs) console.log(`(dry run) ${job.label} — ${job.sql.length} chars`);
    return;
  }

  const token = await resolveToken(args);
  try {
    const project = await call(projectRef, token, `/projects/${projectRef}`);
    console.log(`Target:  ${project.name} (${project.status})`);
  } catch (error) {
    // Scoped tokens may allow SQL execution but not project metadata reads.
    console.warn(`Target:  ${projectRef} (metadata unavailable: ${redact(error.message)})`);
  }

  for (const job of jobs) {
    await runSql(projectRef, token, job.sql, job.label);
  }

  if (args.verify || jobs.length > 0) {
    const rows = await call(projectRef, token, `/projects/${projectRef}/database/query`, {
      method: 'POST',
      body: JSON.stringify({ query: VERIFY_SQL }),
    });
    console.log('\nVerification:');
    console.table(rows);
  }
}

main().catch((error) => {
  console.error(`\nApply failed: ${redact(error.message)}`);
  process.exitCode = 1;
});
