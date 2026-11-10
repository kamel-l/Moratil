#!/usr/bin/env node
/**
 * يُولّد supabase/seed.sql من الحزم المحلية الموثّقة فقط (بلا شبكة):
 *   - src/data/quranSurahsList.ts   → جدول public.surahs            (114 سورة، كامل)
 *   - public/quran/warsh-text.json  → جدول public.ayahs  (رواية ورش، كامل)
 *   - public/quran/mushaf-pages.json→ رقم الصفحة لكل آية
 *
 * الاستخدام:
 *   node scripts/generate-reference-seed.mjs
 *   node scripts/generate-reference-seed.mjs --out supabase/seed.sql --hafs-text public/quran/hafs-text.json
 *
 * ملاحظة مهمّة:
 *   نصّ رواية حفص غير مضمّن محليًا بشكل كامل (13 سورة فقط داخل quranData.ts،
 *   والباقي يُجلب من واجهة alquran.cloud). لذلك لا يُولَّد جدول ayahs لحفص إلا
 *   إذا مُرِّر ملف نصّ محلي عبر --hafs-text بنفس بنية warsh-text.json.
 */

import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = process.cwd();

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const outFile = getArg('out', path.join('supabase', 'seed.sql'));
const hafsTextFile = getArg('hafs-text', null);

/** حمّل وحدة TypeScript عبر تجميعها بـ esbuild ثم استيرادها ديناميكيًا. */
async function loadTsModule(entry) {
  const cacheDir = path.join(root, 'node_modules', '.cache', 'reference-seed');
  await mkdir(cacheDir, { recursive: true });
  const outfile = path.join(cacheDir, `${path.basename(entry).replace(/\.ts$/, '')}.mjs`);
  await build({
    entryPoints: [path.join(root, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
}

/** تجريد التشكيل والعلامات الوقفية — مطابق لـ removeTashkeel في arabicUtils.ts. */
const stripTashkeel = (text) =>
  String(text)
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF]/g, '')
    .replace(/\u0640/g, '')
    .replace(/\u0671/g, 'ا')
    .trim();

const sqlText = (value) =>
  value === null || value === undefined
    ? 'NULL'
    : `'${String(value)
        .replace(/'/g, "''")
        .replace(/[\r\n]+/g, ' ')}'`;

const sqlNum = (value) => (value === null || value === undefined ? 'NULL' : String(value));

function chunk(items, size) {
  const parts = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
}

/** يبني جمل insert متعددة الصفوف مع on conflict لتكون إعادة التشغيل آمنة. */
function insertStatements(table, columns, rows, conflictTarget, updateColumns, batchSize = 400) {
  const statements = [];
  for (const part of chunk(rows, batchSize)) {
    statements.push(
      `insert into public.${table} (${columns.join(', ')}) values\n` +
        part.map((row) => `  (${row.join(', ')})`).join(',\n') +
        `\non conflict (${conflictTarget}) do update set ` +
        updateColumns.map((column) => `${column} = excluded.${column}`).join(', ') +
        ';',
    );
  }
  return statements.join('\n\n');
}

/** يبني صفوف ayahs لرواية من خريطة نصّ + خريطة صفحات. */
function buildAyahRows({ riwayah, textMap, pagesMap, surahs, source }) {
  const rows = [];
  for (const surah of surahs) {
    const texts = textMap[String(surah.number)];
    if (!Array.isArray(texts) || texts.length === 0) continue;
    const surahPages = pagesMap?.[String(surah.number)] ?? [];
    texts.forEach((text, index) => {
      const ayahNumber = index + 1;
      rows.push([
        sqlText(`${riwayah}-${surah.number}-${ayahNumber}`),
        sqlText(riwayah),
        sqlNum(surah.number),
        sqlNum(ayahNumber),
        sqlText(text),
        sqlText(stripTashkeel(text)),
        sqlNum(null), // juz: غير متوفّر لكل آية في الحزم المحلية
        sqlNum(surahPages[index] ?? null),
        sqlText(source),
      ]);
    });
  }
  return rows;
}

async function main() {
  const { ALL_SURAHS } = await loadTsModule('src/data/quranSurahsList.ts');
  const pagesRaw = await readFile(path.join(root, 'public', 'quran', 'mushaf-pages.json'), 'utf8');
  const pages = JSON.parse(pagesRaw);

  const sections = [];

  // ---- 1) السور ----
  const surahRows = ALL_SURAHS.map((s) => [
    sqlNum(s.number),
    sqlText(s.name),
    sqlText(s.englishName),
    sqlText(s.revelationType),
    sqlNum(s.numberOfAyahs),
    sqlNum(s.pageStart),
    sqlNum(s.juzStart),
  ]);

  sections.push(
    '-- ---------------------------------------------\n' +
      `-- السور (${surahRows.length})\n` +
      '-- ---------------------------------------------\n' +
      insertStatements(
        'surahs',
        ['id', 'name', 'english_name', 'revelation_type', 'ayah_count', 'page_start', 'juz_start'],
        surahRows,
        'id',
        ['name', 'english_name', 'revelation_type', 'ayah_count', 'page_start', 'juz_start'],
      ),
  );

  // ---- 2) آيات ورش (محلية بالكامل) ----
  const warshText = JSON.parse(
    await readFile(path.join(root, 'public', 'quran', 'warsh-text.json'), 'utf8'),
  );
  const warshAyahRows = buildAyahRows({
    riwayah: 'warsh',
    textMap: warshText,
    pagesMap: pages.warsh,
    surahs: ALL_SURAHS,
    source: 'local:warsh-text.json',
  });

  sections.push(
    '-- ---------------------------------------------\n' +
      `-- آيات رواية ورش (${warshAyahRows.length})\n` +
      '-- ---------------------------------------------\n' +
      insertStatements(
        'ayahs',
        [
          'id',
          'riwayah',
          'surah_number',
          'ayah_number',
          'text',
          'simple_text',
          'juz',
          'page',
          'source',
        ],
        warshAyahRows,
        'id',
        ['riwayah', 'surah_number', 'ayah_number', 'text', 'simple_text', 'juz', 'page', 'source'],
      ),
  );

  // ---- 3) آيات حفص (اختياري: تحتاج ملف نصّ محلي) ----
  if (hafsTextFile && existsSync(path.join(root, hafsTextFile))) {
    const hafsText = JSON.parse(await readFile(path.join(root, hafsTextFile), 'utf8'));
    const hafsAyahRows = buildAyahRows({
      riwayah: 'hafs',
      textMap: hafsText,
      pagesMap: pages.hafs,
      surahs: ALL_SURAHS,
      source: `local:${path.basename(hafsTextFile)}`,
    });
    sections.push(
      '-- ---------------------------------------------\n' +
        `-- آيات رواية حفص (${hafsAyahRows.length})\n` +
        '-- ---------------------------------------------\n' +
        insertStatements(
          'ayahs',
          [
            'id',
            'riwayah',
            'surah_number',
            'ayah_number',
            'text',
            'simple_text',
            'juz',
            'page',
            'source',
          ],
          hafsAyahRows,
          'id',
          [
            'riwayah',
            'surah_number',
            'ayah_number',
            'text',
            'simple_text',
            'juz',
            'page',
            'source',
          ],
        ),
    );
  } else {
    sections.push(
      '-- ---------------------------------------------\n' +
        '-- آيات رواية حفص: لم تُزرع.\n' +
        '-- نصّ حفص غير مضمّن محليًا بشكل كامل؛ لزرعه مرِّر ملفًا محليًا:\n' +
        '--   node scripts/generate-reference-seed.mjs --hafs-text public/quran/hafs-text.json\n' +
        '-- ---------------------------------------------',
    );
  }

  const header =
    '-- =============================================================================\n' +
    '-- seed.sql — بيانات مرجعية مُولَّدة آليًا. لا تُعدّل يدويًا.\n' +
    '-- المصدر: node scripts/generate-reference-seed.mjs\n' +
    `-- تاريخ التوليد: ${new Date().toISOString()}\n` +
    '-- الجداول: public.surahs (كامل) · public.ayahs (ورش كامل؛ حفص اختياري)\n' +
    '-- =============================================================================\n\n' +
    'begin;\n\n';

  const content = `${header}${sections.join('\n\n')}\n\ncommit;\n`;
  await writeFile(path.join(root, outFile), content, 'utf8');

  const sizeMb = (Buffer.byteLength(content, 'utf8') / 1024 / 1024).toFixed(2);
  console.log(
    `✓ ${outFile} — ${surahRows.length} سورة، ${warshAyahRows.length} آية (ورش)، ${sizeMb} م.ب`,
  );
}

main().catch((error) => {
  console.error('فشل توليد الـ seed:', error);
  process.exit(1);
});
