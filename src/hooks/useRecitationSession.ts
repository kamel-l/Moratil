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

// ============================================================
// ✅ طبقة التطبيع الصوتي — تُقلّل أخطاء ASR في القرآن
// ============================================================
const ARABIC_PHONETIC_MAP: Record<string, string> = {
  // الهمزات → ألف
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
  // تاء مربوطة → هاء
  'ة': 'ه',
  // ياء/همزة على ياء → ياء
  'ى': 'ي', 'ئ': 'ي',
  // واو مهموزة → واو
  'ؤ': 'و',
  // همزة قطع
  'ء': '',
  // حروف متشابهة صوتيًا (أكثر الأخطاء شيوعًا في ASR العربي)
  'ط': 'ت',   // ط/ت
  'ظ': 'ذ',   // ظ/ذ
  'ض': 'د',   // ض/د
  'ص': 'س',   // ص/س
  'ث': 'س',   // ث/س
  'ح': 'ه',   // ح/ه
  'ق': 'ك',   // ق/ك (لهجات + أخطاء ASR)
};

function phoneticNormalize(text: string): string {
  const base = normalizeArabicText(text);
  let out = '';
  for (const ch of base) out += ARABIC_PHONETIC_MAP[ch] ?? ch;
  return out;
}

// Levenshtein محسّن بذاكرة متجددة (يقلل التخصيص)
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// درجة تشابه متعددة المستويات
function smartSimilarity(spoken: string, expected: string): number {
  const ns = phoneticNormalize(spoken);
  const ne = phoneticNormalize(expected);
  if (!ns || !ne) return 0;
  if (ns === ne) return 1;

  // تجريد السوابق الشائعة (ال، وال، بال، كال، فال، و، ب، ك، ف، ل)
  const strip = (s: string) => s.replace(/^(وال|بال|كال|فال|ال|و|ب|ك|ف|ل)/, '');
  if (strip(ns) === strip(ne)) return 0.97;

  // أحد الطرفين بادئة للآخر (كلمة مقطوعة)
  if (ne.startsWith(ns) && ns.length >= Math.ceil(ne.length * 0.55)) return 0.85;
  if (ns.startsWith(ne) && ne.length >= Math.ceil(ns.length * 0.55)) return 0.85;

  // Levenshtein على الصيغة الصوتية
  const lev = levenshtein(ns, ne);
  const maxLen = Math.max(ns.length, ne.length);
  const levSim = 1 - lev / maxLen;

  // مكافأة إذا تطابق أول حرف (ASR غالبًا يحافظ عليه)
  const firstBoost = ns[0] === ne[0] ? 0.05 : 0;

  return Math.min(1, levSim + firstBoost);
}

// اكتشاف دمج عدة كلمات قرآنية في توكن ASR واحد
function mergedWordCount(
  spoken: string,
  expectedWords: QuranWordMeta[],
  startIdx: number,
  maxWords = 4,
): number {
  const ns = phoneticNormalize(spoken);
  if (!ns) return 0;
  let acc = '';
  for (let k = 0; k < maxWords && startIdx + k < expectedWords.length; k++) {
    acc += phoneticNormalize(expectedWords[startIdx + k].original);
    if (ns === acc) return k + 1;
    if (!ns.startsWith(acc) && !acc.startsWith(ns)) return 0;
  }
  return 0;
}

// ============================================================
// ✅ محرك التقييم المحسّن
// ============================================================
const STRONG_MATCH = 0.85;  // مطابقة قوية → تقدم مؤكد
const WEAK_MATCH = 0.60;    // مطابقة ضعيفة → لا تُحسب خطأ
const MIN_MATCH = 0.45;     // أقل من ذلك → خطأ
const LOOKAHEAD = 3;        // نافذة البحث الأمامي

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

  // ثقة منخفضة جدًا → لا تُعاقب
  if (confidence !== undefined && confidence < 0.35) {
    return { ...state, completed: false, isFlawless: false };
  }

  let nextWordIdx = state.currentWordIdx;
  const matchedSet = new Set(state.matchedWords);
  const nextFailedWords = { ...state.failedWords };
  let nextMistake = state.activeMistakeAlert;

  for (const latestSpoken of spokenTokens) {
    const normSpoken = normalizeArabicText(latestSpoken);
    if (normSpoken.length < 2 || normSpoken === 'ال') continue;

    // تجاهل التكرار (تأتأة): إذا كان يشبه آخر كلمة مطابقة بشدة
    const lastMatched = state.matchedWords[state.matchedWords.length - 1];
    if (lastMatched !== undefined) {
      const lastExpected = verseWords[lastMatched]?.original ?? '';
      const curExpected = verseWords[nextWordIdx]?.original ?? '';
      if (
        smartSimilarity(latestSpoken, lastExpected) >= 0.9 &&
        smartSimilarity(latestSpoken, curExpected) < 0.5
      ) {
        continue; // إعادة نفس الكلمة → تجاهل
      }
    }

    // ① دمج عدة كلمات في توكن واحد
    const merged = mergedWordCount(latestSpoken, verseWords, nextWordIdx, 4);
    if (merged >= 2) {
      for (let k = 0; k < merged; k++) {
        matchedSet.add(nextWordIdx + k);
        delete nextFailedWords[nextWordIdx + k];
      }
      nextWordIdx += merged;
      nextMistake = null;
      continue;
    }

    // ② مطابقة قوية مع الكلمة الحالية
    const currentExpected = verseWords[nextWordIdx];
    if (!currentExpected) break;

    const curScore = smartSimilarity(latestSpoken, currentExpected.original);
    if (curScore >= STRONG_MATCH) {
      matchedSet.add(nextWordIdx);
      delete nextFailedWords[nextWordIdx];
      nextWordIdx += 1;
      nextMistake = null;
      continue;
    }

    // ③ بحث أمامي: هل الكلمة تطابق كلمة قادمة؟
    let matchedIndex = -1;
    const lookLimit = Math.min(nextWordIdx + LOOKAHEAD, verseWords.length - 1);
    for (let i = nextWordIdx + 1; i <= lookLimit; i++) {
      if (smartSimilarity(latestSpoken, verseWords[i].original) >= STRONG_MATCH) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex >= 0) {
      // كلمات متخطّاة
      let skipped: QuranWordMeta | null = null;
      for (let i = nextWordIdx; i < matchedIndex; i++) {
        nextFailedWords[i] = 'تم تخطيها';
        skipped = verseWords[i];
      }
      if (skipped) {
        nextMistake = {
          expected: skipped.original,
          heard: `تخطيت كلمة "${skipped.original}"`,
          wordIdx: matchedIndex - 1,
          isUncertain: true,
        };
      }
      matchedSet.add(matchedIndex);
      delete nextFailedWords[matchedIndex];
      nextWordIdx = matchedIndex + 1;
      continue;
    }

    // ④ مطابقة ضعيفة → اقبل مؤقتًا بدون معاقبة
    if (curScore >= WEAK_MATCH) {
      matchedSet.add(nextWordIdx);
      delete nextFailedWords[nextWordIdx];
      nextWordIdx += 1;
      nextMistake = null;
      continue;
    }

    // ⑤ خطأ حقيقي
    if (curScore >= MIN_MATCH) {
      // منطقة رمادية → لا نعاقب لكن ننبّه
      nextMistake = {
        expected: currentExpected.original,
        heard: latestSpoken,
        wordIdx: nextWordIdx,
        isUncertain: true,
      };
      nextWordIdx += 1;
      continue;
    }

    nextFailedWords[nextWordIdx] = latestSpoken;
    nextMistake = {
      expected: currentExpected.original,
      heard: latestSpoken,
      wordIdx: nextWordIdx,
      isUncertain: false,
    };
    nextWordIdx += 1;
  }

  const completed = nextWordIdx >= verseWords.length;
  const isFlawless =
    completed &&
    matchedSet.size >= verseWords.length &&
    Object.keys(nextFailedWords).length === 0;

  return {
    currentWordIdx: nextWordIdx,
    matchedWords: Array.from(matchedSet),
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
      if (completionLockRef.current) return undefined;
      if (currentWordIdxRef.current >= verseWords.length) return undefined;

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

      if (nextState.completed) setIsAyahCompleted(true);

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