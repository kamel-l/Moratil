import { wordSimilarity } from '../utils/arabicUtils';

export interface RecitationAttempt {
  matched: Set<number>;
  extraWords: string[];
  revealed: boolean;
  /** Expected-word indices that were matched approximately rather than exactly. */
  closeWords?: Set<number>;
}

export interface RecitationResultSummary {
  totalAyahs: number;
  attemptedAyahs: number;
  perfectAyahs: number;
  totalWords: number;
  matchedWords: number;
  accuracy: number;
}

export interface AlignmentOptions {
  /**
   * Minimum similarity (0..1) for two different words to count as a match.
   * The default of 1 preserves the historical exact-match behaviour.
   */
  minSimilarity?: number;
}

export interface WordAlignment {
  matchedExpected: Set<number>;
  matchedRecognized: Set<number>;
  closeExpected: Set<number>;
}

/**
 * Aligns two word sequences in order.
 *
 * The dynamic program maximises the total similarity of matched pairs, so a
 * near-identical word (a typical speech-recognition artefact) can still count
 * as correct without allowing matches out of order. With the default options
 * this is the classic LCS over exact tokens.
 */
export function alignRecitationWords(
  expected: string[],
  recognized: string[],
  options: AlignmentOptions = {},
): WordAlignment {
  const minSimilarity = Math.min(1, Math.max(0, options.minSimilarity ?? 1));
  const rows = expected.length + 1;
  const columns = recognized.length + 1;
  const scores = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));
  const matchScores = new Map<string, number>();

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      let matchScore = expected[i - 1] === recognized[j - 1] ? 1 : 0;
      if (matchScore === 0 && minSimilarity < 1) {
        const similarity = wordSimilarity(expected[i - 1], recognized[j - 1]);
        if (similarity >= minSimilarity) matchScore = similarity;
      }
      if (matchScore > 0) matchScores.set(`${i - 1}:${j - 1}`, matchScore);
      scores[i][j] = Math.max(
        scores[i - 1][j],
        scores[i][j - 1],
        scores[i - 1][j - 1] + matchScore,
      );
    }
  }

  const matchedExpected = new Set<number>();
  const matchedRecognized = new Set<number>();
  const closeExpected = new Set<number>();
  let i = expected.length;
  let j = recognized.length;

  while (i > 0 && j > 0) {
    const matchScore = matchScores.get(`${i - 1}:${j - 1}`) ?? 0;
    if (
      matchScore > 0 &&
      Math.abs(scores[i][j] - (scores[i - 1][j - 1] + matchScore)) < 1e-9
    ) {
      matchedExpected.add(i - 1);
      matchedRecognized.add(j - 1);
      if (matchScore < 1) closeExpected.add(i - 1);
      i -= 1;
      j -= 1;
    } else if (scores[i - 1][j] >= scores[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  return { matchedExpected, matchedRecognized, closeExpected };
}

export function buildRecitationMistakes(
  expectedWords: string[],
  attempt: RecitationAttempt,
): { expectedWord: string; recitedWord: string }[] {
  if (attempt.revealed) return [];

  const missingWords = expectedWords.filter((_, index) => !attempt.matched.has(index));
  const mistakeCount = Math.max(missingWords.length, attempt.extraWords.length);

  return Array.from({ length: mistakeCount }, (_, index) => ({
    expectedWord: missingWords[index] ?? 'كلمة زائدة',
    recitedWord: attempt.extraWords[index] ?? 'لم تُسمع',
  }));
}

export function summarizeRecitation(
  questions: { normalized: string[] }[],
  attempts: Record<number, RecitationAttempt>,
): RecitationResultSummary {
  let attemptedAyahs = 0;
  let perfectAyahs = 0;
  let totalWords = 0;
  let matchedWords = 0;

  questions.forEach((question, index) => {
    const attempt = attempts[index];
    if (attempt?.revealed) return;

    totalWords += question.normalized.length + (attempt?.extraWords.length ?? 0);
    if (!attempt) return;

    attemptedAyahs += 1;
    matchedWords += attempt.matched.size;
    if (
      attempt.matched.size === question.normalized.length &&
      attempt.extraWords.length === 0
    ) {
      perfectAyahs += 1;
    }
  });

  return {
    totalAyahs: questions.filter((_, index) => !attempts[index]?.revealed).length,
    attemptedAyahs,
    perfectAyahs,
    totalWords,
    matchedWords,
    accuracy: totalWords > 0 ? Math.round((matchedWords / totalWords) * 100) : 0,
  };
}
