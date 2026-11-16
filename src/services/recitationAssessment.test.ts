import { describe, expect, it } from 'vitest';
import {
  alignRecitationWords,
  buildRecitationMistakes,
  summarizeRecitation,
} from './recitationAssessment';

describe('recitation assessment', () => {
  it('aligns spoken words in order while identifying skipped and extra words', () => {
    const alignment = alignRecitationWords(
      ['بسم', 'الله', 'الرحمن'],
      ['كلمة', 'بسم', 'الرحمن'],
    );

    expect(alignment.matchedExpected).toEqual(new Set([0, 2]));
    expect(alignment.matchedRecognized).toEqual(new Set([1, 2]));
    expect(
      buildRecitationMistakes(['بسم', 'الله', 'الرحمن'], {
        matched: alignment.matchedExpected,
        extraWords: ['كلمة'],
        revealed: false,
      }),
    ).toEqual([{ expectedWord: 'الله', recitedWord: 'كلمة' }]);
  });

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

  it('does not count revealed words as mistakes to save in review history', () => {
    expect(
      buildRecitationMistakes(['الرحمن'], {
        matched: new Set(),
        extraWords: [],
        revealed: true,
      }),
    ).toEqual([]);
  });

  it('records skipped words separately from words that were not heard', () => {
    expect(
      buildRecitationMistakes(['الرحمن', 'الرحيم'], {
        matched: new Set([0]),
        extraWords: [],
        revealed: false,
      }),
    ).toEqual([{ expectedWord: 'الرحيم', recitedWord: 'لم تُسمع' }]);
  });
});
