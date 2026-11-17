import type { Ayah, Surah } from '../types/quran';
import { extractWords, normalizeArabicText, removeOpeningBasmalah } from '../utils/arabicUtils';
import {
  alignRecitationWords,
  summarizeRecitation,
  type RecitationAttempt,
} from './recitationAssessment';

/** Similarity used by the app for speech-to-text recitation matching. */
export const RECITATION_MIN_SIMILARITY = 0.8;

export interface TestQuestion {
  ayah: Ayah;
  words: string[];
  normalized: string[];
}

export interface AttemptDraft extends RecitationAttempt {
  transcript: string;
  accuracy: number;
}

export interface BuildQuestionsOptions {
  /**
   * Drop the opening basmalah from the first verse of non-Fatihah surahs.
   * The Fatihah basmalah is part of the recitation and is always kept.
   */
  skipOpeningBasmalah?: boolean;
}

/**
 * Builds the recitation questions for a verse range.
 * Pure so the exact same logic can be unit-tested and reused by the UI.
 */
export function buildQuestions(
  surah: Surah,
  startAyah: number,
  endAyah: number,
  options: BuildQuestionsOptions = {},
): TestQuestion[] {
  if (endAyah < startAyah) return [];

  return surah.ayahs
    .filter((ayah) => ayah.numberInSurah >= startAyah && ayah.numberInSurah <= endAyah)
    .map((ayah) => {
      let text = ayah.text;
      if (
        options.skipOpeningBasmalah &&
        ayah.numberInSurah === 1 &&
        surah.number !== 1
      ) {
        text = removeOpeningBasmalah(text);
      }
      const words = extractWords(text).map((word) => word.original);
      return { ayah, words, normalized: words.map(normalizeArabicText) };
    });
}

/**
 * Scores a raw transcript against one question.
 * Returns null when nothing was heard so callers can show an "unheard" state.
 */
export function createAttemptFromTranscript(
  transcript: string,
  question: Pick<TestQuestion, 'normalized'>,
  minSimilarity = RECITATION_MIN_SIMILARITY,
): AttemptDraft | null {
  const cleaned = transcript.trim();
  if (!cleaned) return null;

  const tokens = cleaned
    .split(/\s+/)
    .map((original) => ({ original, normalized: normalizeArabicText(original) }))
    .filter((token) => token.normalized);
  const recognized = tokens.map((token) => token.normalized);

  const { matchedExpected, matchedRecognized, closeExpected } = alignRecitationWords(
    question.normalized,
    recognized,
    { minSimilarity },
  );
  const extraWords = tokens
    .filter((_, index) => !matchedRecognized.has(index))
    .map((token) => token.original);
  const totalWords = question.normalized.length + extraWords.length;
  const accuracy =
    totalWords > 0 ? Math.round((matchedExpected.size / totalWords) * 100) : 0;

  return {
    transcript: cleaned,
    matched: matchedExpected,
    closeWords: closeExpected,
    extraWords,
    accuracy,
    revealed: false,
  };
}

/**
 * Live accuracy over the verses answered so far only. Unanswered verses are
 * excluded so the indicator responds immediately to the current recitation.
 */
export function computeCumulativeAccuracy(
  questions: TestQuestion[],
  attempts: Record<number, RecitationAttempt>,
): number {
  let matched = 0;
  let total = 0;
  questions.forEach((question, index) => {
    const attempt = attempts[index];
    if (!attempt || attempt.revealed) return;
    matched += attempt.matched.size;
    total += question.normalized.length + attempt.extraWords.length;
  });
  return total > 0 ? Math.round((matched / total) * 100) : 0;
}

/** A verse is perfect only when every word matched and nothing extra was said. */
export function isPerfectAttempt(
  question: Pick<TestQuestion, 'normalized'>,
  attempt: RecitationAttempt | undefined,
): boolean {
  return (
    !!attempt &&
    !attempt.revealed &&
    attempt.matched.size === question.normalized.length &&
    attempt.extraWords.length === 0
  );
}

export function summarizeQuestions(
  questions: TestQuestion[],
  attempts: Record<number, RecitationAttempt>,
) {
  return summarizeRecitation(questions, attempts);
}
