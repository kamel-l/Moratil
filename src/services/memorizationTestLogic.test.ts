import { describe, expect, it } from 'vitest';
import type { Surah } from '../types/quran';
import {
  buildQuestions,
  computeCumulativeAccuracy,
  createAttemptFromTranscript,
  isPerfectAttempt,
  summarizeQuestions,
  type AttemptDraft,
} from './memorizationTestLogic';

const baqarah: Surah = {
  number: 2,
  name: 'البقرة',
  englishName: 'Al-Baqarah',
  revelationType: 'مدنية',
  numberOfAyahs: 3,
  juzStart: 1,
  pageStart: 2,
  ayahs: [
    { numberInSurah: 1, text: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ الم', juz: 1 },
    { numberInSurah: 2, text: 'ذَٰلِكَ الْكِتَابُ لَا رَيْبَ فِيهِ', juz: 1 },
    { numberInSurah: 3, text: 'الَّذِينَ يُؤْمِنُونَ بِالْغَيْبِ', juz: 1 },
  ],
};

const fatiha: Surah = {
  number: 1,
  name: 'الفاتحة',
  englishName: 'Al-Faatiha',
  revelationType: 'مكية',
  numberOfAyahs: 1,
  juzStart: 1,
  pageStart: 1,
  ayahs: [
    { numberInSurah: 1, text: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', juz: 1 },
  ],
};

const question = (normalized: string[]) => ({
  ayah: { numberInSurah: 1, text: '', juz: 1 },
  words: normalized,
  normalized,
});

const attempt = (
  matched: number[],
  extraWords: string[] = [],
  revealed = false,
): AttemptDraft => ({
  transcript: '',
  matched: new Set<number>(matched),
  extraWords,
  accuracy: 0,
  revealed,
});

describe('buildQuestions', () => {
  it('builds only the ayahs inside the requested range', () => {
    const questions = buildQuestions(baqarah, 2, 3);
    expect(questions.map((q) => q.ayah.numberInSurah)).toEqual([2, 3]);
  });

  it('returns no questions for an inverted or empty range', () => {
    expect(buildQuestions(baqarah, 3, 1)).toEqual([]);
    expect(buildQuestions(baqarah, 9, 9)).toEqual([]);
  });

  it('keeps the opening basmalah by default', () => {
    const [first] = buildQuestions(baqarah, 1, 1);
    expect(first.normalized.slice(0, 4)).toEqual(['بسم', 'الله', 'الرحمن', 'الرحيم']);
  });

  it('drops the opening basmalah from a non-Fatihah surah when requested', () => {
    const [first] = buildQuestions(baqarah, 1, 1, { skipOpeningBasmalah: true });
    expect(first.normalized).toEqual(['الم']);
    expect(first.words).toEqual(['الم']);
  });

  it('never drops the basmalah from Fatihah', () => {
    const [first] = buildQuestions(fatiha, 1, 1, { skipOpeningBasmalah: true });
    expect(first.normalized).toEqual(['بسم', 'الله', 'الرحمن', 'الرحيم']);
  });
});

describe('createAttemptFromTranscript', () => {
  const target = question(['بسم', 'الله', 'الرحمن', 'الرحيم']);

  it('returns null when nothing was heard', () => {
    expect(createAttemptFromTranscript('   ', target)).toBeNull();
    expect(createAttemptFromTranscript('', target)).toBeNull();
  });

  it('scores a fully correct recitation as perfect', () => {
    const attempt = createAttemptFromTranscript('بسم الله الرحمن الرحيم', target);
    expect(attempt).not.toBeNull();
    expect(attempt?.matched).toEqual(new Set([0, 1, 2, 3]));
    expect(attempt?.extraWords).toEqual([]);
    expect(attempt?.accuracy).toBe(100);
    expect(attempt?.revealed).toBe(false);
  });

  it('ignores diacritics when matching', () => {
    const attempt = createAttemptFromTranscript(
      'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
      target,
    );
    expect(attempt?.accuracy).toBe(100);
  });

  it('penalizes extra words', () => {
    const attempt = createAttemptFromTranscript(
      'بسم الله الرحمن الرحيم زيادة',
      target,
    );
    expect(attempt?.matched.size).toBe(4);
    expect(attempt?.extraWords).toEqual(['زيادة']);
    expect(attempt?.accuracy).toBe(80);
  });

  it('counts a near-identical word as correct but flags it as close', () => {
    const attempt = createAttemptFromTranscript('بسم الله الرحمان الرحيم', target);
    expect(attempt?.matched.size).toBe(4);
    expect(attempt?.closeWords).toEqual(new Set([2]));
    expect(attempt?.accuracy).toBe(100);
  });

  it('honors a stricter custom similarity threshold', () => {
    const attempt = createAttemptFromTranscript('بسم الله الرحمان الرحيم', target, 1);
    expect(attempt?.matched.size).toBe(3);
    expect(attempt?.extraWords).toEqual(['الرحمان']);
    expect(attempt?.accuracy).toBe(60);
  });
});

describe('computeCumulativeAccuracy', () => {
  const questions = [question(['بسم', 'الله']), question(['الرحمن'])];

  it('ignores verses that have not been attempted yet', () => {
    expect(computeCumulativeAccuracy(questions, { 0: attempt([0, 1]) })).toBe(100);
  });

  it('includes all attempted verses and their extra words', () => {
    expect(
      computeCumulativeAccuracy(questions, {
        0: attempt([0, 1]),
        1: attempt([]),
      }),
    ).toBe(67);
  });

  it('excludes revealed verses', () => {
    expect(
      computeCumulativeAccuracy(questions, {
        0: attempt([0, 1]),
        1: attempt([], [], true),
      }),
    ).toBe(100);
  });

  it('returns zero for an empty session', () => {
    expect(computeCumulativeAccuracy([], {})).toBe(0);
  });
});

describe('isPerfectAttempt', () => {
  const target = question(['بسم', 'الله']);

  it('is false when the verse was not attempted', () => {
    expect(isPerfectAttempt(target, undefined)).toBe(false);
  });

  it('is true only when every word matched and nothing extra was said', () => {
    expect(isPerfectAttempt(target, attempt([0, 1]))).toBe(true);
  });

  it('is false for a missing word, an extra word, or a revealed verse', () => {
    expect(isPerfectAttempt(target, attempt([0]))).toBe(false);
    expect(isPerfectAttempt(target, attempt([0, 1], ['زيادة']))).toBe(false);
    expect(isPerfectAttempt(target, attempt([0, 1], [], true))).toBe(false);
  });
});

describe('summarizeQuestions', () => {
  it('delegates to the shared recitation summary', () => {
    const result = summarizeQuestions([question(['بسم', 'الله'])], {
      0: attempt([0, 1]),
    });
    expect(result.perfectAyahs).toBe(1);
    expect(result.accuracy).toBe(100);
  });
});
