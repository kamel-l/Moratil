// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseTanzilText, toAyahMapJson } from './tanzil-to-json.mjs';

const BISMILLAH = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';
const HAMD = 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ';

function lines(...dataLines) {
  return [
    '# PLEASE DO NOT REMOVE OR CHANGE THIS COPYRIGHT BLOCK',
    '#====================================================================',
    '#',
    '#  Tanzil Quran Text (Uthmani, Version 1.1)',
    '#====================================================================',
    '',
    ...dataLines,
    '',
  ].join('\n');
}

function parse(content) {
  return parseTanzilText(content, { requireAllSurahs: false });
}

describe('parseTanzilText', () => {
  it('reads ayah lines and ignores the copyright block', () => {
    const records = parse(lines(`1|1|${BISMILLAH}`, `1|2|${HAMD}`, '2|1|الٓمٓ'));

    expect(records).toEqual([
      { surah: 1, ayah: 1, text: BISMILLAH },
      { surah: 1, ayah: 2, text: HAMD },
      { surah: 2, ayah: 1, text: 'الٓمٓ' },
    ]);
  });

  it('keeps pause, sajdah and tatweel marks verbatim', () => {
    const text = 'وَمَآ أَدْرَىٰكَ مَا ٱلْقَارِعَةُ ۩ الرَّحْمَـٰنِ';
    const [record] = parse(lines(`1|1|${text}`));
    expect(record.text).toBe(text);
  });

  it('accepts CRLF line endings', () => {
    const records = parse(lines(`1|1|${BISMILLAH}`, `1|2|${HAMD}`).replaceAll('\n', '\r\n'));
    expect(records).toHaveLength(2);
    expect(records[0].text).toBe(BISMILLAH);
  });

  it('rejects a source that does not start at 1:1', () => {
    expect(() => parse(lines(`1|2|${HAMD}`))).toThrow('must start at 1:1');
  });

  it('rejects gaps in the ayah numbering', () => {
    expect(() => parse(lines(`1|1|${BISMILLAH}`, `1|3|${HAMD}`))).toThrow(
      'expected 1:2, found 1:3',
    );
  });

  it('rejects a surah jump', () => {
    expect(() => parse(lines(`1|1|${BISMILLAH}`, `3|1|الٓمٓ`))).toThrow(
      'expected surah 2, found 3',
    );
  });

  it('rejects a surah that does not start at ayah 1', () => {
    expect(() => parse(lines(`1|1|${BISMILLAH}`, `2|2|الٓمٓ`))).toThrow(
      'surah 2 must start at ayah 1',
    );
  });

  it('rejects unexpected whitespace or control characters', () => {
    expect(() => parse(lines(`1|1|${BISMILLAH} `))).toThrow('surrounding whitespace');
    expect(() => parse(lines(`1|1|${BISMILLAH}\u0007`))).toThrow('control characters');
  });

  it('rejects malformed lines', () => {
    expect(() => parse(lines(`${BISMILLAH}`))).toThrow('unexpected format');
  });

  it('requires the full 114 surahs by default', () => {
    const sample = lines(`1|1|${BISMILLAH}`);
    expect(() => parseTanzilText(sample)).toThrow('Expected 114 surahs');
    expect(parse(sample)).toHaveLength(1);
  });

  it('accepts a complete 114-surah source', () => {
    const full = lines(...Array.from({ length: 114 }, (_, index) => `${index + 1}|1|${BISMILLAH}`));
    const records = parseTanzilText(full);
    expect(records).toHaveLength(114);
    expect(records.at(-1).surah).toBe(114);
  });
});

describe('toAyahMapJson', () => {
  it('renders a JSON map with unchanged text', () => {
    const records = parse(lines(`1|1|${BISMILLAH}`, `1|2|${HAMD}`));
    const map = JSON.parse(toAyahMapJson(records));

    expect(map).toEqual({ '1:1': BISMILLAH, '1:2': HAMD });
    expect(Object.keys(map)).toHaveLength(2);
  });
});
