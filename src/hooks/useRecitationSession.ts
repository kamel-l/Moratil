import { useCallback, useRef, useState } from 'react';
import type { QuranWordMeta } from '../utils/arabicUtils';
import { normalizeArabicText, wordSimilarity } from '../utils/arabicUtils';

export interface RecognitionState {
  currentWordIdx: number;
  matchedWords: number[];
  failedWords: Record<number, string>;
  activeMistakeAlert: {
    expected: string;
    heard: string;
    wordIdx: number;
    isUncertain?: boolean;
  } | null;
}

export function evaluateSpokenText(
  verseWords: QuranWordMeta[],
  state: RecognitionState,
  spokenText: string,
  confidence?: number,
): RecognitionState & { completed: boolean; isFlawless: boolean } {
  const spokenTokens = spokenText.split(/\s+/).filter(Boolean);
  if (spokenTokens.length === 0) {
    return { ...state, completed: false, isFlawless: false };
  }

  if (confidence !== undefined && confidence < 0.45) {
    const expectedMeta = verseWords[state.currentWordIdx];
    return {
      ...state,
      activeMistakeAlert: expectedMeta
        ? {
            expected: expectedMeta.original,
            heard: spokenTokens.join(' '),
            wordIdx: state.currentWordIdx,
            isUncertain: true,
          }
        : state.activeMistakeAlert,
      completed: false,
      isFlawless: false,
    };
  }

  let nextWordIdx = state.currentWordIdx;
  const nextMatchedWords = [...state.matchedWords];
  const nextFailedWords = { ...state.failedWords };
  let nextMistake = state.activeMistakeAlert;

  for (const latestSpoken of spokenTokens) {
    const normSpoken = normalizeArabicText(latestSpoken);
    if (normSpoken.length < 2 || normSpoken === 'ال') continue;

    const lookAheadLimit = Math.min(nextWordIdx + 2, verseWords.length - 1);
    let matchedIndex = -1;
    for (let candidateIndex = nextWordIdx; candidateIndex <= lookAheadLimit; candidateIndex += 1) {
      if (wordSimilarity(latestSpoken, verseWords[candidateIndex].original) >= 0.7) {
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
          isUncertain: true,
        };
      }

      nextMatchedWords.push(matchedIndex);
      delete nextFailedWords[matchedIndex];
      nextWordIdx = matchedIndex + 1;
      if (!skippedExpectedWord && nextMistake && !Object.hasOwn(nextFailedWords, nextMistake.wordIdx)) {
        nextMistake = null;
      }
      continue;
    }

    const expectedMeta = verseWords[nextWordIdx];
    if (!expectedMeta) break;

    nextFailedWords[nextWordIdx] = latestSpoken;
    nextMistake = {
      expected: expectedMeta.original,
      heard: latestSpoken,
      wordIdx: nextWordIdx,
      isUncertain: true,
    };
    nextWordIdx += 1;
  }

  const completed = nextWordIdx >= verseWords.length;
  const isFlawless =
    completed && nextMatchedWords.length === verseWords.length && Object.keys(nextFailedWords).length === 0;

  return {
    currentWordIdx: nextWordIdx,
    matchedWords: nextMatchedWords,
    failedWords: nextFailedWords,
    activeMistakeAlert: nextMistake,
    completed,
    isFlawless,
  };
}

export function useRecitationSession(verseWords: QuranWordMeta[]) {
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [matchedWords, setMatchedWords] = useState<number[]>([]);
  const [failedWords, setFailedWords] = useState<Record<number, string>>({});
  const [activeMistakeAlert, setActiveMistakeAlert] =
    useState<RecognitionState['activeMistakeAlert']>(null);
  const [isAyahCompleted, setIsAyahCompleted] = useState(false);

  const completionLockRef = useRef(false);
  const currentWordIdxRef = useRef(0);
  const matchedWordsRef = useRef<number[]>([]);
  const failedWordsRef = useRef<Record<number, string>>({});
  const activeMistakeAlertRef = useRef<RecognitionState['activeMistakeAlert']>(null);

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
  }, []);

  const handleIncomingSpokenText = useCallback(
    (
      spokenText: string,
      confidence?: number,
    ): (RecognitionState & { completed: boolean; isFlawless: boolean }) | undefined => {
      if (completionLockRef.current) {
        return undefined;
      }
      if (currentWordIdxRef.current >= verseWords.length) {
        return undefined;
      }

      const nextState = evaluateSpokenText(
        verseWords,
        {
          currentWordIdx: currentWordIdxRef.current,
          matchedWords: matchedWordsRef.current,
          failedWords: failedWordsRef.current,
          activeMistakeAlert: activeMistakeAlertRef.current,
        },
        spokenText,
        confidence,
      );

      currentWordIdxRef.current = nextState.currentWordIdx;
      matchedWordsRef.current = nextState.matchedWords;
      failedWordsRef.current = nextState.failedWords;
      activeMistakeAlertRef.current = nextState.activeMistakeAlert;

      setCurrentWordIdx(nextState.currentWordIdx);
      setMatchedWords(nextState.matchedWords);
      setFailedWords(nextState.failedWords);
      setActiveMistakeAlert(nextState.activeMistakeAlert);

      if (nextState.completed) {
        setIsAyahCompleted(true);
      }

      return nextState;
    },
    [verseWords],
  );

  return {
    currentWordIdx,
    matchedWords,
    failedWords,
    activeMistakeAlert,
    isAyahCompleted,
    setIsAyahCompleted,
    setActiveMistakeAlert,
    completionLockRef,
    handleIncomingSpokenText,
    resetRecitationState,
    currentWordIdxRef,
    matchedWordsRef,
    failedWordsRef,
    activeMistakeAlertRef,
  };
}