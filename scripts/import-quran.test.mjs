// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildSeedSql,
  loadCanonicalSurahs,
  normalizeSource,
  quoteSql,
  sha256Hex,
  TOTAL_AYAHS,
  TOTAL_SURAHS,
  validateAyahs,
} from './import-quran.mjs';

const validChecksum = 'a'.repeat(64);

function edition(overrides = {}) {
  return {
    id: 'quran-uthmani',
    kind: 'quran',
    nameAr: 'الرسم العثماني',
    sourceName: 'Tanzil.net',
    sourceUrl: 'https://tanzil.net/download/',
    sourceVersion: '1.1',
    checksumSha256: validChecksum,
    ...overrides,
  };
}

describe('canonical surah metadata', () => {
  it('contains 114 contiguous surahs and 6,236 ayahs', async () => {
    const surahs = await loadCanonicalSurahs();
    expect(surahs).toHaveLength(TOTAL_SURAHS);
    expect(surahs.reduce((total, surah) => total + surah.numberOfAyahs, 0)).toBe(TOTAL_AYAHS);
    expect(surahs[0]).toMatchObject({ number: 1, name: 'الفاتحة', numberOfAyahs: 7 });
    expect(surahs.at(-1)).toMatchObject({ number: 114, name: 'الناس', numberOfAyahs: 6 });
  });
});

describe('normalizeSource', () => {
  it('reads an alquran.cloud full-Quran response', async () => {
    const surahs = await loadCanonicalSurahs();
    const records = normalizeSource(
      [
        {
          name: 'quran.json',
          payload: {
            data: {
              surahs: [
                {
                  number: 1,
                  ayahs: [
                    { numberInSurah: 1, text: 'بِسْمِ اللَّهِ' },
                    { numberInSurah: 2, text: 'الْحَمْدُ لِلَّهِ' },
                  ],
                },
              ],
            },
          },
        },
      ],
      surahs,
    );

    expect(records).toEqual([
      { surah: 1, ayah: 1, text: 'بِسْمِ اللَّهِ' },
      { surah: 1, ayah: 2, text: 'الْحَمْدُ لِلَّهِ' },
    ]);
  });

  it('reads an alquran.cloud single-surah response', async () => {
    const surahs = await loadCanonicalSurahs();
    const records = normalizeSource(
      [
        {
          name: '1.json',
          payload: {
            data: {
              number: 1,
              ayahs: [{ numberInSurah: 1, text: 'بِسْمِ اللَّهِ' }],
            },
          },
        },
      ],
      surahs,
    );

    expect(records).toEqual([{ surah: 1, ayah: 1, text: 'بِسْمِ اللَّهِ' }]);
  });

  it('reads a "surah:ayah" text map', async () => {
    const surahs = await loadCanonicalSurahs();
    const records = normalizeSource(
      [{ name: 'map.json', payload: { '1:1': 'بِسْمِ اللَّهِ', '2:255': 'اللَّهُ لَا إِلَٰهَ' } }],
      surahs,
    );

    expect(records).toEqual([
      { surah: 1, ayah: 1, text: 'بِسْمِ اللَّهِ' },
      { surah: 2, ayah: 255, text: 'اللَّهُ لَا إِلَٰهَ' },
    ]);
  });

  it('maps global ayah numbers to surah and ayah numbers', async () => {
    const surahs = await loadCanonicalSurahs();
    const records = normalizeSource(
      [
        {
          name: 'flat.json',
          payload: [
            { number: 1, text: 'بِسْمِ اللَّهِ' },
            { number: 8, text: 'الم' },
          ],
        },
      ],
      surahs,
    );

    expect(records).toEqual([
      { surah: 1, ayah: 1, text: 'بِسْمِ اللَّهِ' },
      { surah: 2, ayah: 1, text: 'الم' },
    ]);
  });

  it('rejects an unsupported source shape', async () => {
    const surahs = await loadCanonicalSurahs();
    expect(() =>
      normalizeSource([{ name: 'x.json', payload: { hello: 'world' } }], surahs),
    ).toThrow(/Unsupported source shape/);
  });
});

describe('validateAyahs', () => {
  it('rejects non-Arabic text', async () => {
    const surahs = await loadCanonicalSurahs();
    expect(() => validateAyahs([{ surah: 1, ayah: 1, text: 'not arabic' }], surahs)).toThrow(
      /does not contain Arabic letters/,
    );
  });

  it('rejects conflicting duplicates', async () => {
    const surahs = await loadCanonicalSurahs();
    expect(() =>
      validateAyahs(
        [
          { surah: 1, ayah: 1, text: 'بِسْمِ اللَّهِ' },
          { surah: 1, ayah: 1, text: 'نص آخر' },
        ],
        surahs,
      ),
    ).toThrow(/Conflicting duplicate text/);
  });

  it('rejects an incomplete mushaf', async () => {
    const surahs = await loadCanonicalSurahs();
    expect(() => validateAyahs([{ surah: 1, ayah: 1, text: 'بِسْمِ اللَّهِ' }], surahs)).toThrow(
      /incomplete/,
    );
  });
});

describe('buildSeedSql', () => {
  const surahs = [
    {
      number: 1,
      name: 'الفاتحة',
      englishName: "Al-An'aam",
      revelationType: 'مكية',
      numberOfAyahs: 2,
      juzStart: 1,
      pageStart: 1,
    },
  ];
  const ayahs = [
    { surah: 1, ayah: 1, text: 'بِسْمِ اللَّهِ' },
    { surah: 1, ayah: 2, text: 'الْحَمْدُ لِلَّهِ' },
  ];

  it('renders a deterministic, idempotent seed', () => {
    const sql = buildSeedSql({ edition: edition(), surahs, ayahs });

    expect(sql).toContain('begin;');
    expect(sql).toContain("'Al-An''aam'");
    expect(sql).toContain("'makkah'");
    expect(sql).toContain('insert into public.ayah_texts (ayah_id, edition_id, text)');
    expect(sql).toContain('on conflict (ayah_id, edition_id) do nothing;');
    expect(sql).toContain('commit;');
    expect(sql).toContain('Expected 6236 texts for edition');
    expect(sql).toBe(buildSeedSql({ edition: edition(), surahs, ayahs }));
  });

  it('refuses an invalid checksum', () => {
    expect(() =>
      buildSeedSql({ edition: edition({ checksumSha256: 'not-a-checksum' }), surahs, ayahs }),
    ).toThrow(/checksum/);
  });

  it('refuses editions that are not Quran text', () => {
    expect(() => buildSeedSql({ edition: edition({ kind: 'tafsir' }), surahs, ayahs })).toThrow(
      /only seeds Quran text editions/,
    );
  });

  it('refuses a surah with missing ayahs', () => {
    expect(() => buildSeedSql({ edition: edition(), surahs, ayahs: ayahs.slice(0, 1) })).toThrow(
      /expected 2/,
    );
  });
});

describe('helpers', () => {
  it('escapes SQL string literals', () => {
    expect(quoteSql("O'Brien")).toBe("'O''Brien'");
  });

  it('computes SHA-256 digests', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
