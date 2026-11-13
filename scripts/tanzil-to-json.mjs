/**
 * Converts a verbatim Tanzil Quran text download into the `"surah:ayah": "text"`
 * JSON map accepted by scripts/import-quran.mjs.
 *
 * The Quranic text itself is never trimmed, normalized or rewritten: each entry
 * must be byte-identical to the text fragment of the source line. Any deviation
 * from the expected Tanzil layout aborts the conversion instead of guessing.
 *
 * Expected input: https://tanzil.net/download/ with
 *   quranType=uthmani, outType=txt-2 (Text with aya numbers), agree=true
 *
 * See supabase/README.md for the documented workflow.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_LINE = /^([0-9]{1,3})\|([0-9]{1,3})\|(.+)$/;
const TOTAL_SURAHS = 114;

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hasControlCharacters(value) {
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Parses a Tanzil `txt-2` download. Blank lines and `#` copyright lines are
 * metadata; every other line must be `surah|ayah|text` with contiguous
 * numbering and verbatim text.
 */
export function parseTanzilText(content, { requireAllSurahs = true } = {}) {
  const normalized = content.replace(/^\uFEFF/, '');
  const lines = normalized.split('\n');

  const records = [];
  const problems = [];
  let previous = null;

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    if (line.trim() === '' || line.startsWith('#')) return;

    const match = DATA_LINE.exec(line);
    if (!match) {
      problems.push(`line ${lineNumber}: unexpected format`);
      return;
    }

    const surah = Number(match[1]);
    const ayah = Number(match[2]);
    const text = match[3];

    if (text.trim() !== text) {
      problems.push(`line ${lineNumber}: text has surrounding whitespace`);
      return;
    }
    if (hasControlCharacters(text)) {
      problems.push(`line ${lineNumber}: text contains control characters`);
      return;
    }

    if (previous === null) {
      if (surah !== 1 || ayah !== 1) {
        problems.push(`line ${lineNumber}: the source must start at 1:1`);
        return;
      }
    } else if (surah === previous.surah) {
      if (ayah !== previous.ayah + 1) {
        problems.push(
          `line ${lineNumber}: expected ${surah}:${previous.ayah + 1}, found ${surah}:${ayah}`,
        );
        return;
      }
    } else if (surah === previous.surah + 1) {
      if (ayah !== 1) {
        problems.push(`line ${lineNumber}: surah ${surah} must start at ayah 1, found ${ayah}`);
        return;
      }
    } else {
      problems.push(`line ${lineNumber}: expected surah ${previous.surah + 1}, found ${surah}`);
      return;
    }

    records.push({ surah, ayah, text });
    previous = { surah, ayah };
  });

  if (problems.length > 0) {
    throw new Error(
      `Invalid Tanzil source:\n- ${problems.slice(0, 20).join('\n- ')}${
        problems.length > 20 ? `\n- … ${problems.length - 20} more` : ''
      }`,
    );
  }

  if (records.length === 0) {
    throw new Error('The Tanzil source contains no ayahs.');
  }

  const surahNumbers = new Set(records.map((record) => record.surah));
  if (requireAllSurahs && surahNumbers.size !== TOTAL_SURAHS) {
    throw new Error(`Expected ${TOTAL_SURAHS} surahs, found ${surahNumbers.size}.`);
  }
  if (requireAllSurahs && records.at(-1).surah !== TOTAL_SURAHS) {
    throw new Error(`The source must end with surah ${TOTAL_SURAHS}.`);
  }

  return records;
}

/** Renders the JSON map with one ayah per line for readable diffs. */
export function toAyahMapJson(records) {
  const lines = records.map(
    (record) =>
      `  ${JSON.stringify(`${record.surah}:${record.ayah}`)}: ${JSON.stringify(record.text)}`,
  );
  return `{\n${lines.join(',\n')}\n}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node scripts/tanzil-to-json.mjs --input <tanzil.txt> --out <source.json>

Converts a verbatim Tanzil "Text (with aya numbers)" download into the JSON map
accepted by scripts/import-quran.mjs. The Quranic text is copied unchanged.`);
    return;
  }

  if (typeof args.input !== 'string') throw new Error('Missing --input <tanzil.txt>.');
  if (typeof args.out !== 'string') throw new Error('Missing --out <source.json>.');

  const inputPath = resolve(args.input);
  const outputPath = resolve(args.out);

  const bytes = await readFile(inputPath);
  const content = bytes.toString('utf8');
  const records = parseTanzilText(content);
  const json = toAyahMapJson(records);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, json, 'utf8');

  console.log(`Source file:     ${inputPath}`);
  console.log(`Source SHA-256:  ${sha256Hex(bytes)}`);
  console.log(`Ayahs:           ${records.length}`);
  console.log(`Surahs:          ${new Set(records.map((record) => record.surah)).size}`);
  console.log(`Output file:     ${outputPath}`);
  console.log(`Output SHA-256:  ${sha256Hex(json)}`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[rawKey] = next;
      index += 1;
    } else {
      args[rawKey] = true;
    }
  }
  return args;
}

const isEntryPoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  main().catch((error) => {
    console.error(`\nConversion failed: ${error.message}`);
    process.exitCode = 1;
  });
}
