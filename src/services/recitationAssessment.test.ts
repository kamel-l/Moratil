import { describe, expect, it } from 'vitest';
import {
  alignRecitationWords,
  buildRecitationMistakes,
  summarizeRecitation,
} from './recitationAssessment';

describe('recitation assessment', () => {
  describe('alignRecitationWords (exact matching)', () => {
    it('aligns spoken words in order while identifying skipped and extra words', () => {
      const alignment = alignRecitationWords(
        ['بسم', 'الله', 'الرحمن'],
        ['كلمة', 'بسم', 'الرحمن'],
      );

      expect(alignment.matchedExpected).toEqual(new Set([0, 2]));
      expect(alignment.matchedRecognized).toEqual(new Set([1, 2]));
      expect(alignment.closeExpected).toEqual(new Set());
      expect(
        buildRecitationMistakes(['بسم', 'الله', 'الرحمن'], {
          matched: alignment.matchedExpected,
          extraWords: ['كلمة'],
          revealed: false,
        }),
      ).toEqual([{ expectedWord: 'الله', recitedWord: 'كلمة' }]);
    });

    it('matches every word in a perfect recitation', () => {
      const words = ['بسم', 'الله', 'الرحمن', 'الرحيم'];
      const alignment = alignRecitationWords(words, words);

      expect(alignment.matchedExpected).toEqual(new Set([0, 1, 2, 3]));
      expect(alignment.matchedRecognized).toEqual(new Set([0, 1, 2, 3]));
      expect(alignment.closeExpected.size).toBe(0);
    });

    it('handles empty sequences without throwing', () => {
      expect(alignRecitationWords([], []).matchedExpected.size).toBe(0);
      expect(alignRecitationWords(['الله'], []).matchedExpected.size).toBe(0);
      expect(alignRecitationWords([], ['الله']).matchedRecognized.size).toBe(0);
    });

    it('matches a repeated word only as many times as it was heard', () => {
      const alignment = alignRecitationWords(['الله', 'الله'], ['الله']);
      expect(alignment.matchedExpected.size).toBe(1);
      expect(alignment.matchedRecognized.size).toBe(1);
    });

    it('does not reorder words even when the same vocabulary is present', () => {
      const alignment = alignRecitationWords(['بسم', 'الله'], ['الله', 'بسم']);
      expect(alignment.matchedExpected.size).toBe(1);
    });
  });

  describe('alignRecitationWords (fuzzy matching)', () => {
    it('counts a near-identical word as matched and flags it as close', () => {
      const alignment = alignRecitationWords(
        ['الرحمن', 'الرحيم', 'نعبد'],
        ['الرحمان', 'الرحيم', 'نعبد'],
        { minSimilarity: 0.8 },
      );

      expect(alignment.matchedExpected).toEqual(new Set([0, 1, 2]));
      expect(alignment.matchedRecognized).toEqual(new Set([0, 1, 2]));
      expect(alignment.closeExpected).toEqual(new Set([0]));
    });

    it('keeps exact matches out of the close-word set', () => {
      const alignment = alignRecitationWords(['نعبد', 'نستعين'], ['نعبد', 'نستعين'], {
        minSimilarity: 0.8,
      });
      expect(alignment.closeExpected.size).toBe(0);
    });

    it('rejects genuinely different words even with fuzzy matching enabled', () => {
      const alignment = alignRecitationWords(['الرحمن'], ['مستحيل'], {
        minSimilarity: 0.8,
      });
      expect(alignment.matchedExpected.size).toBe(0);
    });

    it('preserves order and prefers the strongest in-order pairing', () => {
      // "نعبد" is an exact match, so it wins over the fuzzier "الرحمان".
      const alignment = alignRecitationWords(
        ['الرحمن', 'نعبد'],
        ['نعبد', 'الرحمان'],
        { minSimilarity: 0.8 },
      );

      expect(alignment.matchedExpected).toEqual(new Set([1]));
      expect(alignment.matchedRecognized).toEqual(new Set([0]));
      expect(alignment.closeExpected.size).toBe(0);
    });
  });

  describe('buildRecitationMistakes', () => {
    it('records skipped words separately from words that were not heard', () => {
      expect(
        buildRecitationMistakes(['الرحمن', 'الرحيم'], {
          matched: new Set([0]),
          extraWords: [],
          revealed: false,
        }),
      ).toEqual([{ expectedWord: 'الرحيم', recitedWord: 'لم تُسمع' }]);
    });

    it('pairs extra words with missing words and reports surplus extras', () => {
      expect(
        buildRecitationMistakes(['الرحمن', 'الرحيم'], {
          matched: new Set(),
          extraWords: ['كلمة', 'أخرى', 'ثالثة'],
          revealed: false,
        }),
      ).toEqual([
        { expectedWord: 'الرحمن', recitedWord: 'كلمة' },
        { expectedWord: 'الرحيم', recitedWord: 'أخرى' },
        { expectedWord: 'كلمة زائدة', recitedWord: 'ثالثة' },
      ]);
    });

    it('does not count revealed words as mistakes to save in review history', () => {
      expect(
        buildRecitationMistakes(['الرحمن'], {
          matched: new Set(),
          extraWords: [],
          revealed: true,
        }),
      ).toEqual([]);
    });
  });

  describe('summarizeRecitation', () => {
    it('excludes revealed verses and penalizes extra words in the score', () => {
      const results = summarizeRecitation(
        [
          { normalized: ['بسم', 'الله'] },
          { normalized: ['الرحمن'] },
          { normalized: ['الرحيم', 'مالك'] },
        ],
        {
          0: { matched: new Set([0, 1]), extraWords: ['زيادة'], revealed: false },
          1: { matched: new Set(), extraWords: [], revealed: true },
        },
      );

      expect(results).toEqual({
        totalAyahs: 2,
        attemptedAyahs: 1,
        perfectAyahs: 0,
        totalWords: 5,
        matchedWords: 2,
        accuracy: 40,
      });
    });

    it('reports a perfect session when every word matched', () => {
      const results = summarizeRecitation(
        [{ normalized: ['بسم', 'الله'] }, { normalized: ['الرحمن'] }],
        {
          0: { matched: new Set([0, 1]), extraWords: [], revealed: false },
          1: { matched: new Set([0]), extraWords: [], revealed: false },
        },
      );

      expect(results.perfectAyahs).toBe(2);
      expect(results.accuracy).toBe(100);
    });

    it('returns zeroes for an empty session', () => {
      expect(summarizeRecitation([], {})).toEqual({
        totalAyahs: 0,
        attemptedAyahs: 0,
        perfectAyahs: 0,
        totalWords: 0,
        matchedWords: 0,
        accuracy: 0,
      });
    });

    it('counts unattempted verses in the denominator of the final accuracy', () => {
      const results = summarizeRecitation(
        [{ normalized: ['بسم', 'الله'] }, { normalized: ['الرحمن'] }],
        { 0: { matched: new Set([0, 1]), extraWords: [], revealed: false } },
      );

      expect(results.attemptedAyahs).toBe(1);
      expect(results.totalWords).toBe(3);
      expect(results.matchedWords).toBe(2);
      expect(results.accuracy).toBe(67);
    });
  });
});
