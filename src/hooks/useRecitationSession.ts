import { useCallback, useRef, useState } from 'react';
import type { QuranWordMeta } from '../utils/arabicUtils';
import { isWordMatch, normalizeArabicText } from '../utils/arabicUtils';

export interface RecognitionState {
  currentWordIdx: number;
  matchedWords: number[];
  failedWords: Record<number, string>;
  activeMistakeAlert: { expected: string; heard: string; wordIdx: number } | null;
}

/** Maximum number of upcoming words a spoken token may be aligned to. */
const LOOK_AHEAD_WORDS = 3;

/** Filler words the recognizer emits but that are never part of the Quran text. */
const FILLER_TOKENS = new Set(['يعني', 'امم', 'ااه', 'اه', 'اوه', 'ام']);

export function evaluateSpokenText(
  verseWords: QuranWordMeta[],
  state: RecognitionState,
  spokenText: string,
): RecognitionState & { completed: boolean; isFlawless: boolean } {
  const spokenTokens = spokenText.split(/\s+/).filter(Boolean);
  if (spokenTokens.length === 0) {
    return { ...state, completed: false, isFlawless: false };
  }

  let nextWordIdx = state.currentWordIdx;
  const nextMatchedWords = [...state.matchedWords];
  const nextFailedWords = { ...state.failedWords };
  let nextMistake = state.activeMistakeAlert;

  for (const latestSpoken of spokenTokens) {
    const normSpoken = normalizeArabicText(latestSpoken);
    if (normSpoken.length < 2 || normSpoken === 'ال') continue;

    const lookAheadLimit = Math.min(nextWordIdx + LOOK_AHEAD_WORDS, verseWords.length - 1);
    let matchedIndex = -1;
    for (let candidateIndex = nextWordIdx; candidateIndex <= lookAheadLimit; candidateIndex += 1) {
      if (isWordMatch(latestSpoken, verseWords[candidateIndex].original)) {
        matchedIndex = candidateIndex;
        break;
      }
    }

    if (matchedIndex >= 0) {
      let skippedExpectedWord = false;
      for (let skippedIndex = nextWordIdx; skippedIndex < matchedIndex; skippedIndex += 1) {
        skippedExpectedWord = true;
        nextFailedWords[skippedIndex] = 'تم تخطيها';
        nextMistake = {
          expected: verseWords[skippedIndex].original,
          heard: `تخطيت كلمة "${verseWords[skippedIndex].original}"`,
          wordIdx: skippedIndex,
        };
      }

      nextMatchedWords.push(matchedIndex);
      delete nextFailedWords[matchedIndex];
      nextWordIdx = matchedIndex + 1;
      if (!skippedExpectedWord) nextMistake = null;
      continue;
    }

    // Ignore recognizer filler noise that matches nothing nearby.
    if (FILLER_TOKENS.has(normSpoken)) continue;

    const expectedMeta = verseWords[nextWordIdx];
    if (!expectedMeta) break;

    nextFailedWords[nextWordIdx] = latestSpoken;
    nextMistake = {
      expected: expectedMeta.original,
      heard: latestSpoken,
      wordIdx: nextWordIdx,
    };
    nextWordIdx += 1;
  }

  const completed = nextWordIdx >= verseWords.length;
  const isFlawless =
    completed &&
    nextMatchedWords.length === verseWords.length &&
    Object.keys(nextFailedWords).length === 0;

  return {
    currentWordIdx: nextWordIdx,
    matchedWords: nextMatchedWords,
    failedWords: nextFailedWords,
    activeMistakeAlert: nextMistake,
    completed,
    isFlawless,
  };
}

/**
 * Runs the recognizer's alternative transcriptions and keeps the best one, so a
 * single misheard variant does not derail the whole recitation.
 */
export function evaluateAlternatives(
  verseWords: QuranWordMeta[],
  state: RecognitionState,
  candidates: string[],
): RecognitionState & { completed: boolean; isFlawless: boolean } {
  const score = (result: RecognitionState & { completed: boolean; isFlawless: boolean }) =>
    result.currentWordIdx * 10 -
    Object.keys(result.failedWords).length * 3 +
    (result.completed ? 5 : 0) +
    (result.isFlawless ? 10 : 0);

  let best: (RecognitionState & { completed: boolean; isFlawless: boolean }) | null = null;
  for (const candidate of candidates) {
    if (!candidate || !candidate.trim()) continue;
    const result = evaluateSpokenText(verseWords, state, candidate);
    if (!best || score(result) > score(best)) best = result;
  }

  return best ?? { ...state, completed: false, isFlawless: false };
}

export function useRecitationSession(verseWords: QuranWordMeta[]) {
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [matchedWords, setMatchedWords] = useState<number[]>([]);
  const [failedWords, setFailedWords] = useState<Record<number, string>>({});
  const [activeMistakeAlert, setActiveMistakeAlert] = useState<{
    expected: string;
    heard: string;
    wordIdx: number;
  } | null>(null);
  const [isAyahCompleted, setIsAyahCompleted] = useState(false);
  const [previewWordIdx, setPreviewWordIdx] = useState<number | null>(null);
  const completionLockRef = useRef(false);
  const currentWordIdxRef = useRef(0);
  const matchedWordsRef = useRef<number[]>([]);
  const failedWordsRef = useRef<Record<number, string>>({});
  const activeMistakeAlertRef = useRef<{ expected: string; heard: string; wordIdx: number } | null>(
    null,
  );

  const resetRecitationState = useCallback(() => {
    completionLockRef.current = false;
    currentWordIdxRef.current = 0;
    matchedWordsRef.current = [];
    failedWordsRef.current = {};
    activeMistakeAlertRef.current = null;
    setCurrentWordIdx(0);
    setMatchedWords([]);
    setFailedWords({});
    setActiveMistakeAlert(null);
    setIsAyahCompleted(false);
    setPreviewWordIdx(null);
  }, []);

  /**
   * Handles finalized speech chunks. `alternatives` are the recognizer's other
   * candidate transcriptions; the one that best matches the verse is used.
   */
  const handleIncomingSpokenText = useCallback(
    (
      spokenText: string,
      alternatives: string[] = [],
    ): (RecognitionState & { completed: boolean; isFlawless: boolean }) | undefined => {
      if (
        completionLockRef.current ||
        isAyahCompleted ||
        currentWordIdxRef.current >= verseWords.length
      ) {
        return undefined;
      }

      const nextState = evaluateAlternatives(
        verseWords,
        {
          currentWordIdx: currentWordIdxRef.current,
          matchedWords: matchedWordsRef.current,
          failedWords: failedWordsRef.current,
          activeMistakeAlert: activeMistakeAlertRef.current,
        },
        [spokenText, ...alternatives],
      );

      currentWordIdxRef.current = nextState.currentWordIdx;
      matchedWordsRef.current = nextState.matchedWords;
      failedWordsRef.current = nextState.failedWords;
      activeMistakeAlertRef.current = nextState.activeMistakeAlert;

      setCurrentWordIdx(nextState.currentWordIdx);
      setMatchedWords(nextState.matchedWords);
      setFailedWords(nextState.failedWords);
      setActiveMistakeAlert(nextState.activeMistakeAlert);
      setPreviewWordIdx(null);

      if (nextState.completed) {
        setIsAyahCompleted(true);
      }

      return nextState;
    },
    [isAyahCompleted, verseWords],
  );

  /**
   * Live preview of the word being recited from an interim transcript. It never
   * mutates the committed state, so in-progress guesses cannot corrupt results.
   */
  const previewSpokenText = useCallback(
    (interimText: string) => {
      if (completionLockRef.current || isAyahCompleted) return;
      if (!interimText.trim()) {
        setPreviewWordIdx(null);
        return;
      }

      const preview = evaluateSpokenText(
        verseWords,
        {
          currentWordIdx: currentWordIdxRef.current,
          matchedWords: matchedWordsRef.current,
          failedWords: failedWordsRef.current,
          activeMistakeAlert: activeMistakeAlertRef.current,
        },
        interimText,
      );
      setPreviewWordIdx(preview.currentWordIdx);
    },
    [isAyahCompleted, verseWords],
  );

  return {
    currentWordIdx,
    matchedWords,
    failedWords,
    activeMistakeAlert,
    isAyahCompleted,
    previewWordIdx,
    setIsAyahCompleted,
    setActiveMistakeAlert,
    setPreviewWordIdx,
    completionLockRef,
    handleIncomingSpokenText,
    previewSpokenText,
    resetRecitationState,
    currentWordIdxRef,
    matchedWordsRef,
    failedWordsRef,
    activeMistakeAlertRef,
  };
}
