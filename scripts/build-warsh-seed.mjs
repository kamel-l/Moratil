/**
 * Builds the Warsh seed (`supabase/seed/quran-warsh.sql`) from the verified
 * text asset committed in `public/quran/warsh.json`.
 *
 * The seed is generated, never hand-written: the text is the KFGQPC 2026 Warsh
 * release distributed by quran.ws, whose SHA-256 is checked before use. The
 * Hafs seed stays the single source for the Kufi numbering; this one adds the
 * 6,214-ayah Madani-last numbering as a separate riwayah.
 *
 * Usage:
 *   node scripts/build-warsh-seed.mjs
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { assertCanonicalSurahs, buildSeedSql } from './import-quran.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const textPath = join(root, 'public', 'quran', 'warsh.json');
const outPath = join(root, 'supabase', 'seed', 'quran-warsh.sql');
const manifestPath = join(root, 'supabase', 'seed', 'quran-warsh.manifest.json');

const RIWAYAH = 'warsh';
const TOTAL_AYAHS = 6214;
const EDITION_ID = 'quran-warsh';
const TOTAL_SURAHS = 114;

/** Evaluates the TypeScript metadata modules without duplicating their records. */
async function loadMetadata() {
  const result = await build({
    stdin: {
      contents: [
        "export { RIWAYAT } from './src/data/riwayat.ts';",
        "export { WARSH_TEXT_SHA256 } from './src/data/warshManifest.ts';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'warsh-seed-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  return import(dataUrl);
}

async function main() {
  const { RIWAYAT, WARSH_TEXT_SHA256 } = await loadMetadata();
  const riwayah = RIWAYAT[RIWAYAH];
  if (!riwayah) throw new Error(`Unknown riwayah: ${RIWAYAH}`);

  const surahs = riwayah.surahs;
  assertCanonicalSurahs(surahs, TOTAL_AYAHS);
  if (riwayah.totalAyahs !== TOTAL_AYAHS) {
    throw new Error(`riwayat.ts reports ${riwayah.totalAyahs} Warsh ayahs, expected ${TOTAL_AYAHS}.`);
  }
  const provenance = riwayah.provenance;
  if (!provenance) throw new Error('Warsh metadata is missing its provenance record.');

  const raw = await readFile(textPath, 'utf8');
  const document = JSON.parse(raw);
  if (document.riwaya !== RIWAYAH) {
    throw new Error(`warsh.json declares riwaya "${document.riwaya}", expected "${RIWAYAH}".`);
  }
  if (!Array.isArray(document.surahs) || document.surahs.length !== TOTAL_SURAHS) {
    throw new Error(`warsh.json must contain ${TOTAL_SURAHS} surahs.`);
  }

  // Hash the text itself, not the JSON formatting: the committed asset is only
  // trusted while its verses match the checksum generated from the verified
  // quran.ws package.
  const textHash = createHash('sha256');
  for (const surah of document.surahs) {
    surah.ayahs.forEach((text, index) => {
      textHash.update(`${surah.number}:${index + 1}\u0000${text}\n`);
    });
  }
  const actualTextSha = textHash.digest('hex');
  if (actualTextSha !== WARSH_TEXT_SHA256) {
    throw new Error(
      `public/quran/warsh.json text SHA-256 mismatch.\nExpected: ${WARSH_TEXT_SHA256}\n` +
        `Actual:   ${actualTextSha}\nRefusing to seed unverified Quranic text.`,
    );
  }

  const ayahs = [];
  for (const surah of document.surahs) {
    const meta = surahs[surah.number - 1];
    if (!meta || meta.number !== surah.number) {
      throw new Error(`warsh.json surah ${surah.number} does not match the metadata order.`);
    }
    if (surah.ayahCount !== meta.numberOfAyahs || surah.ayahs.length !== meta.numberOfAyahs) {
      throw new Error(
        `Surah ${surah.number}: warsh.json has ${surah.ayahs.length} ayahs, ` +
          `expected ${meta.numberOfAyahs}.`,
      );
    }
    surah.ayahs.forEach((text, index) => {
      ayahs.push({ surah: surah.number, ayah: index + 1, text });
    });
  }

  if (ayahs.length !== TOTAL_AYAHS) {
    throw new Error(`Collected ${ayahs.length} Warsh ayahs, expected ${TOTAL_AYAHS}.`);
  }

  const edition = {
    id: EDITION_ID,
    kind: 'quran',
    nameAr: 'الرسم العثماني — ورش',
    sourceName: 'quran.ws (KFGQPC Warsh 2026)',
    sourceUrl: provenance.datasetUrl,
    sourceVersion: provenance.textPackage,
    checksumSha256: provenance.mushafSha256,
  };

  const sql = buildSeedSql({
    edition,
    surahs,
    ayahs,
    riwayah: RIWAYAH,
    totalAyahs: TOTAL_AYAHS,
  });

  await writeFile(outPath, sql, 'utf8');

  const manifest = {
    editionId: edition.id,
    kind: edition.kind,
    nameAr: edition.nameAr,
    sourceName: edition.sourceName,
    sourceUrl: edition.sourceUrl,
    sourceVersion: edition.sourceVersion,
    sourceSha256: edition.checksumSha256,
    riwayah: RIWAYAH,
    totalSurahs: TOTAL_SURAHS,
    totalAyahs: TOTAL_AYAHS,
    sqlFile: 'quran-warsh.sql',
    sqlSha256: createHash('sha256').update(sql).digest('hex'),
    generatedBy: 'scripts/build-warsh-seed.mjs',
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${manifestPath}`);
  console.log(`Ayahs: ${ayahs.length}`);
  console.log(`SQL SHA-256: ${manifest.sqlSha256}`);
}

main().catch((error) => {
  console.error(`\n✗ build-warsh-seed: ${error.message}`);
  process.exit(1);
});
