import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractWords,
  findSimilarAyahs,
  formatTime,
  levenshteinDistance,
  normalizeArabicText,
  removeOpeningBasmalah,
  removeTashkeel,
  toArabicDigits,
  wordSimilarity,
} from './arabicUtils';
import { recordVerseResult } from '../services/storageService';

describe('arabicUtils', () => {
  it('normalizes Arabic diacritics and alef variants', () => {
    expect(normalizeArabicText('أَلْفُ')).toBe('الف');
    expect(normalizeArabicText('بِسْمِ ٱللّٰهِ')).toBe('بسم الله');
  });

  it('removes a leading basmalah without changing the remaining verse', () => {
    expect(removeOpeningBasmalah('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ الم')).toBe('الم');
    expect(removeOpeningBasmalah('الم')).toBe('الم');
  });

  it('extracts words while keeping the original text', () => {
    const words = extractWords('بِسْمِ ٱللّٰهِ');
    expect(words[0]).toMatchObject({ original: 'بِسْمِ', normalized: 'بسم' });
    expect(words[1]).toMatchObject({ original: 'ٱللّٰهِ', normalized: 'الله' });
  });

  it('recognizes close Quranic words and prefixes', () => {
    expect(wordSimilarity('وَجْه', 'وجه')).toBeGreaterThan(0.9);
    expect(wordSimilarity('الرحمن', 'رحمن')).toBeGreaterThan(0.9);
    expect(wordSimilarity('مستحيل', 'غير')).toBeLessThan(0.4);
  });

  it('finds distinct verses that share normalized Quranic vocabulary', () => {
    const similar = findSimilarAyahs(
      'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ',
      [
        {
          surahNumber: 1,
          surahName: 'الفاتحة',
          numberInSurah: 5,
          text: 'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ',
        },
        {
          surahNumber: 2,
          surahName: 'البقرة',
          numberInSurah: 10,
          text: 'وَإِيَّاكَ نَسْتَعِينُ فِي كُلِّ أُمُورِنَا',
        },
        {
          surahNumber: 3,
          surahName: 'آل عمران',
          numberInSurah: 1,
          text: 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ',
        },
      ],
      1,
      5,
    );

    expect(similar).toHaveLength(1);
    expect(similar[0]).toMatchObject({
      surahNumber: 2,
      numberInSurah: 10,
      sharedWords: ['اياك', 'نستعين'],
    });
  });
});

describe('recordVerseResult', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
      },
      configurable: true,
    });
  });

  it('uses a 1-day interval for the first flawless success', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const result = recordVerseResult(1, 1, true, []);

    expect(result.consecutiveSuccessCount).toBe(1);
    expect(
      new Date(result.nextReviewAt).getTime() - new Date('2026-01-01T00:00:00Z').getTime(),
    ).toBe(86400000);

    vi.useRealTimers();
  });

  it('resets the streak after a mistake and keeps a short history', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const success = recordVerseResult(1, 2, true, []);
    expect(success.consecutiveSuccessCount).toBe(1);

    const failure = recordVerseResult(1, 2, false, [{ expectedWord: 'خَيْر', recitedWord: 'خير' }]);
    expect(failure.consecutiveSuccessCount).toBe(0);
    expect(failure.level).toBe('review_needed');
    expect(failure.recentMistakes).toHaveLength(1);

    vi.useRealTimers();
  });
});

describe('Arabic text helpers', () => {
  it('removes diacritics, tatweel and waslah but keeps the base letters', () => {
    expect(removeTashkeel('الرَّحْمَٰنِ')).toBe('الرحمن');
    expect(removeTashkeel('الـكِتَاب')).toBe('الكتاب');
    expect(removeTashkeel('ٱلْأَرْض')).toBe('الأرض');
    expect(normalizeArabicText('ٱلْأَرْض')).toBe('الارض');
    expect(removeTashkeel('')).toBe('');
  });

  it('normalizes empty input and strips digit decorations', () => {
    expect(normalizeArabicText('')).toBe('');
    expect(normalizeArabicText('سُبْحَانَكَ ١٢٣')).toBe('سبحانك');
  });

  it('drops verse numbers and brackets when extracting words', () => {
    const words = extractWords('بِسْمِ ٱللّٰهِ ﴿١﴾');
    expect(words.map((word) => word.original)).toEqual(['بِسْمِ', 'ٱللّٰهِ']);
    expect(extractWords('')).toEqual([]);
  });

  it('computes Levenshtein distance for inserts, deletes and identical strings', () => {
    expect(levenshteinDistance('سبحان', 'سبحانه')).toBe(1);
    expect(levenshteinDistance('الرحمن', 'الرحمن')).toBe(0);
    expect(levenshteinDistance('', 'abc')).toBe(3);
  });

  it('formats elapsed time as MM:SS', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(125)).toBe('02:05');
  });

  it('converts western digits to Arabic-Indic digits', () => {
    expect(toArabicDigits('12')).toBe('١٢');
    expect(toArabicDigits(0)).toBe('٠');
    expect(toArabicDigits('٩')).toBe('٩');
  });
});
