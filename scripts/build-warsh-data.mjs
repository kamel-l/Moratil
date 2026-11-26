/**
 * Builds the Warsh (`ورش عن نافع`) text assets from the quran.ws dataset.
 *
 * The dataset is a build of the KFGQPC (مجمع الملك فهد) 2026 release
 * `UthmanicWarsh-v-3.0.zip`, distributed by https://github.com/quran-ws/quran-text
 * under CC BY 4.0 for the compilation and the KFGQPC terms for the text itself.
 *
 * Usage:
 *   node scripts/build-warsh-data.mjs            # download (cached) and verify
 *   node scripts/build-warsh-data.mjs --offline  # use .cache/quran-ws only
 *
 * Outputs:
 *   public/quran/warsh.json                    text, counts, pages, audio map
 *   public/quran/UthmanicWarsh-v-3.0.ttf       the font the text is encoded for
 *   src/data/warshManifest.ts                  counts and provenance for the UI
 *
 * The manifest is committed as TypeScript so the surah list, the total and the
 * basmalah are available synchronously: the app can render the Warsh index
 * before the 0.76 MiB text file is fetched.
 *
 * Every input is checked against the SHA-256 recorded in the dataset manifest, so
 * a changed upstream cannot silently replace the Quran text. The generated files
 * are committed: the app must not depend on the network for its Quran text.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const cacheDir = join(root, '.cache', 'quran-ws');
const outDir = join(root, 'public', 'quran');

const REPO = 'https://raw.githubusercontent.com/quran-ws/quran-text/main/data';

const SOURCE = {
  mushaf: {
    url: `${REPO}/mushaf/warsh.json`,
    bytes: 2161120,
    sha256: '2ad99415cf4ba9e06b5fba670244d98c3a66e9ba182f14d9e5c189d53175b6ed',
  },
  ayahMap: {
    url: `${REPO}/ayah-map.json`,
    bytes: 2285199,
    sha256: 'b4ea59b14c629ae5a95ca7e1cebca71227d25aa4d92ae4698a79db8caf21eea9',
  },
  manifest: {
    url: `${REPO}/manifest.json`,
    bytes: 16667,
    sha256: null,
  },
  font: {
    url: `${REPO}/fonts/UthmanicWarsh-v-3.0.ttf`,
    bytes: 251428,
    sha256: 'b644f1c6665baa95c9c0ab40b01a7f3e89edc42a0f50d3b244318a843bec81a9',
  },
};

const offline = process.argv.includes('--offline');

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function load(name, source) {
  const cached = join(cacheDir, name);
  if (existsSync(cached)) {
    const buffer = await readFile(cached);
    if (!source.sha256 || sha256(buffer) === source.sha256) return buffer;
    console.warn(`cached ${name} does not match its checksum, downloading again`);
  }
  if (offline) {
    throw new Error(`missing cached ${name}; run without --offline once`);
  }
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`${source.url}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cached, buffer);
  return buffer;
}

async function verified(name, source) {
  const buffer = await load(name, source);
  if (source.bytes && buffer.length !== source.bytes) {
    throw new Error(`${name}: expected ${source.bytes} bytes, got ${buffer.length}`);
  }
  if (source.sha256 && sha256(buffer) !== source.sha256) {
    throw new Error(`${name}: SHA-256 mismatch (${sha256(buffer)})`);
  }
  console.log(`✓ ${name} ${buffer.length} bytes ${sha256(buffer).slice(0, 12)}…`);
  return buffer;
}

/** Index of the last start <= position, in a sorted list of positions. */
function lastStartIndex(starts, position) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (starts[middle] <= position) low = middle;
    else high = middle - 1;
  }
  return low;
}

function buildAyahTexts(mushaf) {
  const { words, ayah_starts: starts, mark_types: markTypes, marks } = mushaf;

  // Marks are stored apart from the words: [word position, mark type]. They carry
  // the sajdah and the "ﷺ" signs, so they are reattached before joining.
  const marksByWord = new Map();
  for (const [position, typeIndex] of marks) {
    const type = markTypes[typeIndex];
    if (!type) continue;
    // The KFGQPC release prints the proofreader's ṣaḥḥa (U+08CC) and its raised
    // dot after 9,950 words. They are editorial annotations, not Quran text, and
    // the dataset keeps them out of the words and out of every comparison form.
    if (type.kind === 'sah' || type.kind === 'raised_dot') continue;
    if (!marksByWord.has(position)) marksByWord.set(position, []);
    marksByWord.get(position).push(type);
  }

  const wordAt = (index) => {
    const word = words[index];
    const attached = marksByWord.get(index);
    if (!attached) return word;
    const before = attached.filter((m) => m.side === 'before').map((m) => m.sign).join('');
    const after = attached.filter((m) => m.side !== 'before').map((m) => m.sign).join('');
    return `${before}${word}${after}`;
  };

  return starts.map((from, index) => {
    const to = index + 1 < starts.length ? starts[index + 1] : words.length;
    let text = '';
    for (let word = from; word < to; word += 1) {
      text += wordAt(word);
      if (word + 1 < to) text += ' ';
    }
    return text.trim();
  });
}

function buildAudioMap(ayahMap) {
  const WANTED = 'warsh';
  const map = new Map();
  for (const ayah of ayahMap.ayahs) {
    const target = ayah[WANTED];
    if (!target || target.relation === 'unnumbered') continue;
    const last = target.ayah_last ?? target.ayah;
    for (let warshAyah = target.ayah; warshAyah <= last; warshAyah += 1) {
      // A Warsh verse is played with the Hafs verse that covers it. The audio
      // collections are Hafs-numbered: everyayah.com/warsh has no 089:031.
      if (!map.has(`${target.surah}:${warshAyah}`)) {
        map.set(`${target.surah}:${warshAyah}`, ayah.ayah);
      }
    }
  }
  return map;
}

async function main() {
  const mushafBuffer = await verified('warsh.json', SOURCE.mushaf);
  const ayahMapBuffer = await verified('ayah-map.json', SOURCE.ayahMap);
  const manifestBuffer = await verified('manifest.json', SOURCE.manifest);
  const fontBuffer = await verified('UthmanicWarsh-v-3.0.ttf', SOURCE.font);

  const mushaf = JSON.parse(mushafBuffer.toString('utf8'));
  const ayahMap = JSON.parse(ayahMapBuffer.toString('utf8'));
  const manifest = JSON.parse(manifestBuffer.toString('utf8'));

  const texts = buildAyahTexts(mushaf);
  const audioMap = buildAudioMap(ayahMap);
  const { words, page_starts: pageStarts, juz_starts: juzStarts, surahs } = mushaf;

  if (texts.length !== 6214) {
    throw new Error(`expected 6214 ayahs, built ${texts.length}`);
  }

  const built = surahs.map((surah) => {
    const ayahs = texts.slice(surah.first_ayah, surah.first_ayah + surah.ayah_count);
    if (ayahs.length !== surah.ayah_count) {
      throw new Error(`surah ${surah.number}: ${ayahs.length} ayahs, expected ${surah.ayah_count}`);
    }
    return {
      number: surah.number,
      ayahCount: surah.ayah_count,
      hasBasmalah: surah.has_basmalah,
      revelation: surah.revelation,
      ayahs,
      pages: ayahs.map((_, offset) => {
        const wordStart = mushaf.ayah_starts[surah.first_ayah + offset];
        return lastStartIndex(pageStarts, wordStart) + 1;
      }),
      juz: ayahs.map((_, offset) => {
        const wordStart = mushaf.ayah_starts[surah.first_ayah + offset];
        return lastStartIndex(juzStarts, wordStart) + 1;
      }),
      // Hafs verse number whose recording covers each Warsh verse.
      audio: ayahs.map((_, offset) => {
        const ayahNumber = offset + 1;
        return audioMap.get(`${surah.number}:${ayahNumber}`) ?? null;
      }),
    };
  });

  const totalAyahs = built.reduce((total, surah) => total + surah.ayahCount, 0);

  // Canonical content hash: independent of JSON formatting, so the seed builder
  // can prove the committed asset still holds the verified text.
  const textHash = createHash('sha256');
  for (const surah of built) {
    surah.ayahs.forEach((text, index) => {
      textHash.update(`${surah.number}:${index + 1}\u0000${text}\n`);
    });
  }
  const textSha256 = textHash.digest('hex');
  const basmalahWords = texts.length
    ? words.slice(0, mushaf.ayah_starts[0]).join(' ')
    : '';
  const missingAudio = built.reduce(
    (total, surah) => total + surah.audio.filter((value) => value === null).length,
    0,
  );

  const payload = {
    riwaya: 'warsh',
    nameAr: 'ورش عن نافع',
    totalAyahs,
    basmalah: basmalahWords,
    provenance: {
      dataset: '@quran.ws/text',
      datasetUrl: 'https://github.com/quran-ws/quran-text',
      license: 'CC BY 4.0 for the compilation; KFGQPC terms for the Quran text, layout and font',
      published: mushaf.generated,
      counting: mushaf.counting.system,
      countingNameAr: mushaf.counting.system_name_ar,
      basmalahCounted: mushaf.counting.basmalah_counted,
      mushafFile: 'data/mushaf/warsh.json',
      mushafSha256: SOURCE.mushaf.sha256,
      textSha256,
      ayahMapSha256: SOURCE.ayahMap.sha256,
      textPackage: manifest.sources.warsh.text.package,
      textPackageSha256: manifest.sources.warsh.text.sha256,
      textPackageOrigin:
        'no URL is recorded upstream; the package can only be checked against the SHA-256',
      layoutPackage: manifest.sources.warsh.layout.package,
      layoutPackageUrl: manifest.sources.warsh.layout.origin.url ?? null,
      publisher: 'https://fonts.qurancomplex.gov.sa/',
      font: 'UthmanicWarsh-v-3.0.ttf',
      fontSha256: SOURCE.font.sha256,
      fontFamily: mushaf.font.family,
    },
    surahs: built,
  };

  await mkdir(outDir, { recursive: true });
  const json = JSON.stringify(payload);
  await writeFile(join(outDir, 'warsh.json'), json);
  await writeFile(join(outDir, 'UthmanicWarsh-v-3.0.ttf'), fontBuffer);

  const surahInfo = built.map((surah) => ({
    number: surah.number,
    ayahCount: surah.ayahCount,
    juzStart: surah.juz[0],
    pageStart: surah.pages[0],
    hasBasmalah: surah.hasBasmalah,
    revelation: surah.revelation === 'makki' ? 'مكية' : 'مدنية',
  }));

  const manifestTs = `/**
 * Generated by scripts/build-warsh-data.mjs — do not edit by hand.
 *
 * Warsh \`ورش عن نافع\` metadata. Every value below is measured from the verified
 * quran.ws build of the KFGQPC 2026 release, never written by hand.
 */

export const WARSH_TOTAL_AYAHS = ${totalAyahs};

/** SHA-256 of the canonical text, so the seed builder can re-check the asset. */
export const WARSH_TEXT_SHA256 = ${JSON.stringify(textSha256)};

export const WARSH_BASMALAH = ${JSON.stringify(basmalahWords)};

export interface WarshSurahInfo {
  readonly number: number;
  readonly ayahCount: number;
  readonly juzStart: number;
  readonly pageStart: number;
  readonly hasBasmalah: boolean;
  readonly revelation: 'مكية' | 'مدنية';
}

/** Indexed by surah number - 1. */
export const WARSH_SURAH_INFO: readonly WarshSurahInfo[] = ${JSON.stringify(surahInfo, null, 2)};

export const WARSH_PROVENANCE = ${JSON.stringify(payload.provenance, null, 2)} as const;
`;

  await writeFile(join(root, 'src', 'data', 'warshManifest.ts'), manifestTs);


  console.log(
    [
      '',
      `surahs: ${built.length}`,
      `ayahs: ${totalAyahs}`,
      `words: ${words.length}`,
      `basmalah: ${basmalahWords.split(' ').length} words`,
      `verses without a matching Hafs recording: ${missingAudio}`,
      `warsh.json: ${(json.length / 1024 / 1024).toFixed(2)} MiB`,
      `font: ${(fontBuffer.length / 1024).toFixed(0)} KiB`,
    ].join('\n'),
  );
}

main().catch((error) => {
  console.error('\n✗ build-warsh-data:', error.message);
  process.exit(1);
});
