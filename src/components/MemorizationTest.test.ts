import { describe, expect, it } from 'vitest';
import type { Ayah, Surah } from '../types/quran';
import { createNextAyahOptions } from '../utils/nextAyahQuiz';

function makeSurah(ayahCount: number): Surah {
  const ayahs: Ayah[] = Array.from({ length: ayahCount }, (_, index) => ({
    numberInSurah: index + 1,
    text: `آية ${index + 1}`,
    juz: 1,
  }));
  return {
    number: 1,
    name: 'الفاتحة',
    englishName: 'Al-Fatiha',
    revelationType: 'مكية',
    numberOfAyahs: ayahCount,
    juzStart: 1,
    pageStart: 1,
    ayahs,
  };
}

describe('createNextAyahOptions', () => {
  it('includes the consecutive next ayah and distinct distractors, not the prompt', () => {
    const surah = makeSurah(7);
    const options = createNextAyahOptions(surah, surah.ayahs[1], surah.ayahs[2]);
    const optionNumbers = options.map((ayah) => ayah.numberInSurah);

    expect(optionNumbers).toHaveLength(4);
    expect(optionNumbers).toContain(3);
    expect(optionNumbers).not.toContain(2);
    expect(new Set(optionNumbers).size).toBe(optionNumbers.length);
  });

  it('uses all available answers for a short surah', () => {
    const surah = makeSurah(3);
    const options = createNextAyahOptions(surah, surah.ayahs[0], surah.ayahs[1]);

    expect(options).toHaveLength(2);
    expect(options.map((ayah) => ayah.numberInSurah)).toContain(2);
    expect(options.map((ayah) => ayah.numberInSurah)).not.toContain(1);
  });
});
