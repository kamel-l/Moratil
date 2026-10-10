import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractWords, normalizeArabicText, wordSimilarity } from './arabicUtils';
import { recordVerseResult } from '../services/storageService';

describe('arabicUtils', () => {
  it('normalizes Arabic diacritics and alef variants', () => {
    expect(normalizeArabicText('أَلْفُ')).toBe('الف');
    expect(normalizeArabicText('بِسْمِ ٱللّٰهِ')).toBe('بسم الله');
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
