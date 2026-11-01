/**
 * Imports a fixed-version Quran text source into the normalized Supabase schema.
 *
 * The script never generates, rewrites or "corrects" Quranic text. It only
 * validates the source, checks its SHA-256 checksum and renders parameterized
 * SQL seed data for the `quran_editions`, `surahs`, `ayahs` and `ayah_texts`
 * tables.
 *
 * See supabase/README.md for the documented workflow.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

export const TOTAL_AYAHS = 6236;
export const TOTAL_SURAHS = 114;

const ARABIC_LETTER = /[\u0621-\u064A]/;
const FORBIDDEN_TEXT = /[<>\uFFFD]/;
const EDITION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_AYAH_LENGTH = 4000;

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

let canonicalCache;

/**
 * Loads the single source of truth for surah metadata used by the app.
 * esbuild is already part of the dev toolchain, so the TypeScript file can be
 * evaluated without duplicating the 114 surah records in this script.
 */
export async function loadCanonicalSurahs() {
  if (canonicalCache) return canonicalCache;

  const result = await build({
    entryPoints: [join(repoRoot, 'src', 'data', 'quranSurahsList.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  const module = await import(dataUrl);
  const surahs = module.ALL_SURAHS;

  assertCanonicalSurahs(surahs);
  canonicalCache = surahs;
  return surahs;
}

export function assertCanonicalSurahs(surahs) {
  if (!Array.isArray(surahs) || surahs.length !== TOTAL_SURAHS) {
    throw new Error(`Expected ${TOTAL_SURAHS} surahs, received ${surahs?.length ?? 0}.`);
  }

  let total = 0;
  surahs.forEach((surah, index) => {
    const number = index + 1;
    if (surah.number !== number) {
      throw new Error(`Surah metadata is out of order at index ${index} (expected ${number}).`);
    }
    if (typeof surah.name !== 'string' || !surah.name.trim()) {
      throw new Error(`Surah ${number} is missing its Arabic name.`);
    }
    if (typeof surah.englishName !== 'string' || !surah.englishName.trim()) {
      throw new Error(`Surah ${number} is missing its English name.`);
    }
    if (!Number.isInteger(surah.numberOfAyahs) || surah.numberOfAyahs < 1) {
      throw new Error(`Surah ${number} has an invalid ayah count.`);
    }
    if (!['مكية', 'مدنية'].includes(surah.revelationType)) {
      throw new Error(`Surah ${number} has an invalid revelation type.`);
    }
    total += surah.numberOfAyahs;
  });

  if (total !== TOTAL_AYAHS) {
    throw new Error(`Expected ${TOTAL_AYAHS} ayahs, received ${total}.`);
  }
}

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function quoteSql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

/**
 * Reads a JSON source file or a directory of JSON files. Directory hashing is
 * deterministic: sorted file name + NUL + bytes + NUL, for every file.
 */
export async function readSource(sourcePath) {
  const absolute = resolve(sourcePath);
  const info = await stat(absolute);

  if (info.isDirectory()) {
    const files = (await readdir(absolute))
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .sort((left, right) => {
        const leftNumber = Number.parseInt(left, 10);
        const rightNumber = Number.parseInt(right, 10);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
          return leftNumber - rightNumber;
        }
        return left.localeCompare(right);
      });

    if (files.length === 0) {
      throw new Error(`No JSON files found in ${absolute}.`);
    }

    const hash = createHash('sha256');
    const payloads = [];
    for (const file of files) {
      const bytes = await readFile(join(absolute, file));
      hash.update(file).update('\0').update(bytes).update('\0');
      payloads.push({
        name: file,
        payload: parseJson(bytes, file),
        surahHint: Number.parseInt(file, 10),
      });
    }

    return { payloads, sha256: hash.digest('hex'), label: absolute };
  }

  if (!info.isFile()) {
    throw new Error(`Source is neither a file nor a directory: ${absolute}`);
  }

  const bytes = await readFile(absolute);
  return {
    payloads: [
      {
        name: basename(absolute),
        payload: parseJson(bytes, basename(absolute)),
        surahHint: Number.parseInt(basename(absolute), 10),
      },
    ],
    sha256: sha256Hex(bytes),
    label: absolute,
  };
}

function parseJson(bytes, name) {
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${name}: ${error.message}`, { cause: error });
  }
}

/**
 * Normalizes the supported source shapes into `{ surah, ayah, text }` records.
 *
 * Accepted shapes:
 *   - alquran.cloud full Quran: { data: { surahs: [...] } }
 *   - alquran.cloud single surah: { data: { number, ayahs: [...] } }
 *   - an array of surah objects `{ number, ayahs: [...] }`
 *   - an array of ayah records `{ surah, ayah, text }`
 *   - a map of `"surah:ayah": "text"`
 *   - a map of `surahNumber: { ayahs: [...] }` or `surahNumber: [...]`
 */
export function normalizeSource(payloads, surahs) {
  const records = [];

  for (const entry of payloads) {
    const hint = Number.isInteger(entry.surahHint) ? entry.surahHint : undefined;
    extractPayload(entry.payload, records, surahs, hint, entry.name);
  }

  return records;
}

function extractPayload(payload, records, surahs, surahHint, name) {
  const root = payload?.data ?? payload;

  if (root && Array.isArray(root.surahs)) {
    for (const surah of root.surahs) extractSurahObject(surah, records, surahs, undefined, name);
    return;
  }

  if (root && Array.isArray(root.ayahs)) {
    extractSurahObject(root, records, surahs, surahHint, name);
    return;
  }

  if (Array.isArray(root)) {
    if (root.length > 0 && root.every((item) => item && Array.isArray(item.ayahs ?? item.verses))) {
      for (const surah of root) extractSurahObject(surah, records, surahs, undefined, name);
      return;
    }

    for (const ayah of root) extractAyahRecord(ayah, records, surahs, surahHint, name);
    return;
  }

  if (root && typeof root === 'object') {
    const entries = Object.entries(root);
    if (entries.length === 0) throw new Error(`Source ${name} is empty.`);

    let handled = 0;
    for (const [key, value] of entries) {
      const flatKey = /^(\d{1,3})\s*[:_-]\s*(\d{1,3})$/.exec(key);
      if (flatKey && typeof value === 'string') {
        records.push({
          surah: Number(flatKey[1]),
          ayah: Number(flatKey[2]),
          text: value,
        });
        handled += 1;
        continue;
      }

      const surahNumber = Number(key);
      if (Number.isInteger(surahNumber) && surahNumber >= 1 && surahNumber <= TOTAL_SURAHS) {
        if (Array.isArray(value)) {
          for (const ayah of value) {
            extractAyahRecord(ayah, records, surahs, surahNumber, name);
          }
          handled += 1;
        } else if (value && typeof value === 'object') {
          extractSurahObject(value, records, surahs, surahNumber, name);
          handled += 1;
        }
      }
    }

    if (handled > 0) return;
  }

  throw new Error(
    `Unsupported source shape in ${name}. Use an alquran.cloud response, an array of surahs, ` +
      'an array of { surah, ayah, text } records, or a "surah:ayah" text map.',
  );
}

function extractSurahObject(value, records, surahs, surahHint, name) {
  const surahNumber =
    numberField(value, ['number', 'surah', 'surahNumber', 'surah_number', 'id']) ?? surahHint;
  if (!Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > TOTAL_SURAHS) {
    throw new Error(`Missing or invalid surah number in ${name}.`);
  }

  const ayahs = value?.ayahs ?? value?.verses;
  if (!Array.isArray(ayahs) || ayahs.length === 0) {
    throw new Error(`Surah ${surahNumber} in ${name} has no ayahs array.`);
  }

  for (const ayah of ayahs) {
    const ayahNumber =
      numberField(ayah, ['numberInSurah', 'ayah', 'ayahNumber', 'ayah_number']) ??
      inferAyahNumber(ayah, surahNumber, surahs);
    const text = textField(ayah);
    records.push({ surah: surahNumber, ayah: ayahNumber, text });
  }
}

function extractAyahRecord(value, records, surahs, surahHint, name) {
  if (!value || typeof value !== 'object') {
    throw new Error(`Expected an ayah object in ${name}.`);
  }

  const surahNumber = numberField(value, ['surah', 'surahNumber', 'surah_number']) ?? surahHint;
  const text = textField(value);

  let ayahNumber = numberField(value, ['numberInSurah', 'ayah', 'ayahNumber', 'ayah_number']);

  if (!Number.isInteger(surahNumber)) {
    const globalNumber = numberField(value, ['number', 'globalNumber', 'global_number']);
    if (Number.isInteger(globalNumber)) {
      const mapped = mapGlobalAyah(globalNumber, surahs);
      records.push({ surah: mapped.surah, ayah: mapped.ayah, text });
      return;
    }
    throw new Error(`Missing surah number for an ayah in ${name}.`);
  }

  if (!Number.isInteger(ayahNumber)) {
    ayahNumber = inferAyahNumber(value, surahNumber, surahs);
  }

  records.push({ surah: surahNumber, ayah: ayahNumber, text });
}

function inferAyahNumber(value, surahNumber, surahs) {
  const number = numberField(value, ['number', 'globalNumber', 'global_number']);
  if (!Number.isInteger(number)) return undefined;

  const surah = surahs.find((item) => item.number === surahNumber);
  if (surah && number >= 1 && number <= surah.numberOfAyahs) return number;

  const mapped = mapGlobalAyah(number, surahs);
  return mapped.surah === surahNumber ? mapped.ayah : undefined;
}

function mapGlobalAyah(number, surahs) {
  if (!Number.isInteger(number) || number < 1 || number > TOTAL_AYAHS) {
    throw new Error(`Global ayah number ${number} is outside 1..${TOTAL_AYAHS}.`);
  }

  let offset = 0;
  for (const surah of surahs) {
    if (number <= offset + surah.numberOfAyahs) {
      return { surah: surah.number, ayah: number - offset };
    }
    offset += surah.numberOfAyahs;
  }

  throw new Error(`Unable to map global ayah number ${number}.`);
}

function numberField(value, keys) {
  for (const key of keys) {
    const candidate = value?.[key];
    if (Number.isInteger(candidate)) return candidate;
    if (typeof candidate === 'string' && /^\d+$/.test(candidate)) return Number(candidate);
  }
  return undefined;
}

function textField(value) {
  return value?.text ?? value?.arabicText ?? value?.arabic ?? value?.uthmani;
}

/**
 * Validates every ayah, detects duplicates and enforces the canonical
 * 114 surahs / 6,236 ayahs structure. Throws a single error listing the first
 * problems instead of silently skipping data.
 */
export function validateAyahs(records, surahs) {
  assertCanonicalSurahs(surahs);

  const problems = [];
  const byKey = new Map();

  for (const record of records) {
    const { surah, ayah, text } = record;

    if (!Number.isInteger(surah) || surah < 1 || surah > TOTAL_SURAHS) {
      problems.push(`Invalid surah number: ${String(surah)}`);
      continue;
    }

    const surahMeta = surahs[surah - 1];
    if (!Number.isInteger(ayah) || ayah < 1 || ayah > surahMeta.numberOfAyahs) {
      problems.push(
        `Invalid ayah ${String(ayah)} for surah ${surah} (1..${surahMeta.numberOfAyahs}).`,
      );
      continue;
    }

    if (typeof text !== 'string') {
      problems.push(`Missing text for ${surah}:${ayah}.`);
      continue;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      problems.push(`Empty text for ${surah}:${ayah}.`);
      continue;
    }
    if (trimmed.length > MAX_AYAH_LENGTH) {
      problems.push(
        `Text for ${surah}:${ayah} is suspiciously long (${trimmed.length} characters).`,
      );
      continue;
    }
    if (FORBIDDEN_TEXT.test(trimmed) || trimmed.includes('\u0000')) {
      problems.push(
        `Text for ${surah}:${ayah} contains forbidden markup or replacement characters.`,
      );
      continue;
    }
    if (!ARABIC_LETTER.test(trimmed)) {
      problems.push(`Text for ${surah}:${ayah} does not contain Arabic letters.`);
      continue;
    }

    const key = `${surah}:${ayah}`;
    const existing = byKey.get(key);
    if (existing) {
      if (existing.text !== trimmed) {
        problems.push(`Conflicting duplicate text for ${key}.`);
      }
      continue;
    }

    byKey.set(key, { surah, ayah, text: trimmed });
  }

  if (problems.length > 0) {
    throw new Error(`Invalid Quran source:\n- ${problems.slice(0, 20).join('\n- ')}`);
  }

  const missing = [];
  for (const surah of surahs) {
    for (let ayah = 1; ayah <= surah.numberOfAyahs; ayah += 1) {
      if (!byKey.has(`${surah.number}:${ayah}`)) {
        missing.push(`${surah.number}:${ayah}`);
        if (missing.length >= 20) break;
      }
    }
    if (missing.length >= 20) break;
  }

  if (missing.length > 0) {
    throw new Error(
      `Quran source is incomplete. Missing ayahs include: ${missing.join(', ')}. ` +
        `Expected ${TOTAL_SURAHS} surahs and ${TOTAL_AYAHS} ayahs.`,
    );
  }

  if (byKey.size !== TOTAL_AYAHS) {
    throw new Error(`Expected ${TOTAL_AYAHS} unique ayahs, received ${byKey.size}.`);
  }

  return [...byKey.values()].sort((left, right) =>
    left.surah === right.surah ? left.ayah - right.ayah : left.surah - right.surah,
  );
}

/**
 * Renders deterministic SQL seed data. Verified editions are immutable, so the
 * script refuses to overwrite an existing edition with another checksum.
 */
export function buildSeedSql({ edition, surahs, ayahs }) {
  if (!EDITION_ID_PATTERN.test(edition.id)) {
    throw new Error(`Invalid edition id: ${edition.id}`);
  }
  if (!SHA256_PATTERN.test(edition.checksumSha256)) {
    throw new Error('Edition checksum must be a lowercase SHA-256 hex digest.');
  }
  if (edition.kind !== 'quran') {
    throw new Error('This importer only seeds Quran text editions (kind = quran).');
  }

  const groups = new Map();
  for (const ayah of ayahs) {
    if (!groups.has(ayah.surah)) groups.set(ayah.surah, []);
    groups.get(ayah.surah).push(ayah);
  }

  const lines = [
    '-- ============================================================================',
    '-- Quran text seed — generated by scripts/import-quran.mjs',
    '--',
    '-- Do not edit this file by hand. Import a new edition version instead.',
    `-- Edition: ${edition.id}`,
    `-- Source: ${edition.sourceName} (${edition.sourceVersion})`,
    `-- Source SHA-256: ${edition.checksumSha256}`,
    '-- ============================================================================',
    '',
    'begin;',
    '',
    'insert into public.quran_editions',
    '  (id, kind, name_ar, source_name, source_url, source_version, checksum_sha256, is_verified)',
    'values (',
    `  ${quoteSql(edition.id)},`,
    `  ${quoteSql(edition.kind)},`,
    `  ${quoteSql(edition.nameAr)},`,
    `  ${quoteSql(edition.sourceName)},`,
    `  ${edition.sourceUrl ? quoteSql(edition.sourceUrl) : 'null'},`,
    `  ${quoteSql(edition.sourceVersion)},`,
    `  ${quoteSql(edition.checksumSha256)},`,
    '  true',
    ')',
    'on conflict (id) do nothing;',
    '',
    'do $$',
    'declare',
    '  stored public.quran_editions%rowtype;',
    'begin',
    '  select * into stored',
    '    from public.quran_editions',
    `   where id = ${quoteSql(edition.id)};`,
    '',
    '  if not found then',
    `    raise exception 'Edition % was not created.', ${quoteSql(edition.id)};`,
    '  end if;',
    '',
    `  if stored.checksum_sha256 <> ${quoteSql(edition.checksumSha256)} then`,
    "    raise exception 'Edition % already exists with a different checksum. Import a new edition version instead.',",
    `      ${quoteSql(edition.id)};`,
    '  end if;',
    '',
    '  if not stored.is_verified then',
    `    raise exception 'Edition % exists but is not verified.', ${quoteSql(edition.id)};`,
    '  end if;',
    'end $$;',
    '',
    'insert into public.surahs',
    '  (number, name_ar, name_en, revelation_place, ayah_count, juz_start, page_start)',
    'values',
  ];

  lines.push(
    surahs
      .map(
        (surah) =>
          `  (${surah.number}, ${quoteSql(surah.name)}, ${quoteSql(surah.englishName)}, ` +
          `${quoteSql(revelationPlace(surah.revelationType))}, ${surah.numberOfAyahs}, ` +
          `${surah.juzStart}, ${surah.pageStart})`,
      )
      .join(',\n') +
      '\non conflict (number) do update set\n' +
      '  name_ar = excluded.name_ar,\n' +
      '  name_en = excluded.name_en,\n' +
      '  revelation_place = excluded.revelation_place,\n' +
      '  ayah_count = excluded.ayah_count,\n' +
      '  juz_start = excluded.juz_start,\n' +
      '  page_start = excluded.page_start;',
  );

  for (const surah of surahs) {
    const group = groups.get(surah.number) ?? [];
    if (group.length !== surah.numberOfAyahs) {
      throw new Error(
        `Surah ${surah.number} has ${group.length} ayahs, expected ${surah.numberOfAyahs}.`,
      );
    }

    lines.push('', `-- ${surah.number}. ${surah.name}`);
    lines.push('insert into public.ayahs (surah_number, ayah_number) values');
    lines.push(
      group.map((ayah) => `  (${surah.number}, ${ayah.ayah})`).join(',\n') +
        '\non conflict (surah_number, ayah_number) do nothing;',
    );

    lines.push('');
    lines.push(
      'insert into public.ayah_texts (ayah_id, edition_id, text)',
      'select a.id, ' + quoteSql(edition.id) + ', v.text',
      'from (values',
    );
    lines.push(group.map((ayah) => `  (${ayah.ayah}, ${quoteSql(ayah.text)})`).join(',\n'));
    lines.push(
      `) as v(ayah_number, text)`,
      `join public.ayahs a`,
      `  on a.surah_number = ${surah.number}`,
      ` and a.ayah_number = v.ayah_number`,
      'on conflict (ayah_id, edition_id) do nothing;',
    );
  }

  lines.push(
    '',
    '-- Final integrity checks: the seed must cover the whole mushaf.',
    'do $$',
    'declare',
    '  total integer;',
    '  mismatch record;',
    'begin',
    '  select count(*) into total',
    '    from public.ayah_texts t',
    '    join public.ayahs a on a.id = t.ayah_id',
    `   where t.edition_id = ${quoteSql(edition.id)};`,
    '',
    `  if total <> ${TOTAL_AYAHS} then`,
    `    raise exception 'Expected ${TOTAL_AYAHS} texts for edition %, found %',`,
    `      ${quoteSql(edition.id)}, total;`,
    '  end if;',
    '',
    '  select s.number, s.ayah_count, count(a.id)::integer as actual',
    '    into mismatch',
    '    from public.surahs s',
    '    left join public.ayahs a on a.surah_number = s.number',
    '   group by s.number, s.ayah_count',
    '  having count(a.id) <> s.ayah_count',
    '   limit 1;',
    '',
    '  if found then',
    "    raise exception 'Surah % contains % ayahs, expected %',",
    '      mismatch.number, mismatch.actual, mismatch.ayah_count;',
    '  end if;',
    'end $$;',
    '',
    'commit;',
    '',
  );

  return lines.join('\n');
}

function revelationPlace(value) {
  if (value === 'مكية' || value === 'Meccan' || value === 'makkah') return 'makkah';
  if (value === 'مدنية' || value === 'Medinan' || value === 'madinah') return 'madinah';
  throw new Error(`Unknown revelation type: ${value}`);
}

// ────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    const key = rawKey.trim();
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/import-quran.mjs --source <file|dir> --sha256 <hex> [options]

Required when writing a seed:
  --source <path>          Verified JSON file, or a directory of per-surah JSON files.
  --sha256 <hex>           Expected SHA-256 of the source (or of the directory listing).
  --source-name <name>     Publisher or dataset name (e.g. Tanzil.net).
  --source-version <ver>   Fixed source version (e.g. 1.1).

Options:
  --edition-id <id>        Edition id, lowercase (default: quran-uthmani).
  --edition-name-ar <name> Arabic edition name (default: الرسم العثماني).
  --source-url <url>       Source URL for attribution.
  --out <path>             SQL output (default: supabase/seed/<edition-id>.sql).
  --verify-only            Validate the source without writing files.
  --allow-unverified-source
                           Skip the mandatory checksum. Never use in production.
  --print-source-sha256    Print the computed source hash and exit.
  --help                   Show this help.

The script validates 114 surahs, 6,236 ayahs, contiguous numbering and Arabic
text. It never generates or rewrites Quranic text.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!args.source || args.source === true) {
    throw new Error('Missing --source <file|dir>.');
  }

  const source = await readSource(args.source);

  if (args['print-source-sha256']) {
    console.log(source.sha256);
    return;
  }

  if (args.sha256) {
    if (typeof args.sha256 !== 'string' || !SHA256_PATTERN.test(args.sha256.toLowerCase())) {
      throw new Error('--sha256 must be a 64-character hexadecimal SHA-256 digest.');
    }
    if (args.sha256.toLowerCase() !== source.sha256) {
      throw new Error(
        `Source checksum mismatch.\nExpected: ${args.sha256.toLowerCase()}\nActual:   ${source.sha256}\n` +
          'Refusing to import unverified Quranic text.',
      );
    }
  } else if (!args['allow-unverified-source']) {
    throw new Error(
      'A fixed source checksum is required. Pass --sha256 <hex> or use --print-source-sha256 ' +
        'to obtain it from a previously verified download.',
    );
  } else {
    console.warn(
      'WARNING: importing a source without checksum verification. Do not use in production.',
    );
  }

  const surahs = await loadCanonicalSurahs();
  const records = normalizeSource(source.payloads, surahs);
  const ayahs = validateAyahs(records, surahs);

  console.log(
    `Validated ${TOTAL_SURAHS} surahs and ${ayahs.length} ayahs from ${source.label} ` +
      `(sha256 ${source.sha256}).`,
  );

  if (args['verify-only']) return;

  for (const key of ['source-name', 'source-version']) {
    if (!args[key] || args[key] === true) {
      throw new Error(`Missing --${key}. A trusted seed must document its source.`);
    }
  }

  const edition = {
    id: typeof args['edition-id'] === 'string' ? args['edition-id'] : 'quran-uthmani',
    kind: 'quran',
    nameAr:
      typeof args['edition-name-ar'] === 'string' ? args['edition-name-ar'] : 'الرسم العثماني',
    sourceName: args['source-name'],
    sourceUrl: typeof args['source-url'] === 'string' ? args['source-url'] : undefined,
    sourceVersion: args['source-version'],
    checksumSha256: source.sha256,
  };

  const sql = buildSeedSql({ edition, surahs, ayahs });
  const outPath = resolve(args.out ?? join('supabase', 'seed', `${edition.id}.sql`));
  const manifestPath = outPath.replace(/\.sql$/i, '') + '.manifest.json';

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, sql, 'utf8');

  const manifest = {
    editionId: edition.id,
    kind: edition.kind,
    nameAr: edition.nameAr,
    sourceName: edition.sourceName,
    sourceUrl: edition.sourceUrl,
    sourceVersion: edition.sourceVersion,
    sourceSha256: source.sha256,
    totalSurahs: TOTAL_SURAHS,
    totalAyahs: TOTAL_AYAHS,
    sqlFile: basename(outPath),
    sqlSha256: sha256Hex(sql),
    generatedBy: 'scripts/import-quran.mjs',
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${manifestPath}`);
  console.log(`SQL SHA-256: ${manifest.sqlSha256}`);
}

const isEntryPoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  main().catch((error) => {
    console.error(`\nImport failed: ${error.message}`);
    process.exitCode = 1;
  });
}
