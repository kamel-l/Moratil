import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic,
  Trophy,
  RotateCcw,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Settings,
  Play,
  Flag,
  Eye,
  Loader2,
  AlertTriangle,
  Keyboard,
  BookOpen,
  Target,
  Square,
} from 'lucide-react';
import { Surah, Reciter, Riwaya, Ayah } from '../types/quran';
import { extractWords } from '../utils/arabicUtils';
import { createNextAyahOptions } from '../utils/nextAyahQuiz';
import { recordVerseResult, addPointsAndVerses } from '../services/storageService';

interface MemorizationTestProps {
  surah: Surah;
  selectedReciter: Reciter;
  onStatsUpdate: () => void;
  riwaya?: Riwaya;
}

type Stage = 'idle' | 'running' | 'finished';
type TestMode = 'recitation' | 'next_ayah';
type HintMode = 'none' | 'first_word' | 'full';
type RecordingState = 'idle' | 'listening' | 'processing';

interface Question {
  ayah: Ayah;
  words: string[]; // الأصلية بالتشكيل (للعرض)
  normalized: string[]; // بدون تشكيل (للمقارنة)
  nextAyah?: Ayah;
  options?: Ayah[];
}

interface AyahAttempt {
  transcript: string;
  matched: Set<number>;
  extraWords: string[];
  accuracy: number;
  revealed: boolean;
  selectedAyahNumber?: number;
}

interface OverallResults {
  totalAyahs: number;
  attemptedAyahs: number;
  perfectAyahs: number;
  totalWords: number;
  matchedWords: number;
  accuracy: number;
}

const RIWAYA_LABELS: Record<Riwaya, string> = {
  hafs: 'حفص عن عاصم',
  warsh: 'ورش عن نافع',
};

// ─── تطبيع النص العربي للمقارنة ───
function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // إزالة التشكيل والتطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\u0621-\u064A\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── محاذاة LCS بين الكلمات المتوقعة والمُسموعة ───
function alignLCS(expected: string[], recognized: string[]) {
  const m = expected.length,
    n = recognized.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        expected[i - 1] === recognized[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const matchedE = new Set<number>();
  const matchedR = new Set<number>();
  let i = m,
    j = n;
  while (i > 0 && j > 0) {
    if (expected[i - 1] === recognized[j - 1]) {
      matchedE.add(i - 1);
      matchedR.add(j - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return { matchedE, matchedR };
}

function getSpeechRecognition(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export const MemorizationTest: React.FC<MemorizationTestProps> = ({
  surah,
  selectedReciter,
  onStatsUpdate,
  riwaya,
}) => {
  const effectiveRiwaya: Riwaya = riwaya ?? selectedReciter.riwaya ?? 'hafs';
  const speechSupported = useMemo(() => !!getSpeechRecognition(), []);

  // ─── الإعدادات ───
  const [startAyah, setStartAyah] = useState(1);
  const [endAyah, setEndAyah] = useState(Math.min(7, surah.ayahs.length));
  const [hintMode, setHintMode] = useState<HintMode>('none');
  const [testMode, setTestMode] = useState<TestMode>('recitation');

  // ─── الجلسة ───
  const [stage, setStage] = useState<Stage>('idle');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attempts, setAttempts] = useState<Record<number, AyahAttempt>>({});
  const [results, setResults] = useState<OverallResults | null>(null);

  // ─── التسجيل ───
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState('');

  // ─── Refs ───
  const recognitionRef = useRef<any>(null);
  const shouldContinueRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const silenceTimerRef = useRef<number | null>(null);
  const secondsTimerRef = useRef<number | null>(null);
  const recordingAyahIdxRef = useRef(0);

  const cleanupRecording = useCallback(() => {
    shouldContinueRef.current = false;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (secondsTimerRef.current) {
      clearInterval(secondsTimerRef.current);
      secondsTimerRef.current = null;
    }
    try {
      recognitionRef.current?.abort?.();
    } catch {
      // The recognition session may already be stopped.
    }
  }, []);

  // إعادة الضبط عند تغيير السورة
  useEffect(() => {
    setStartAyah(1);
    setEndAyah(Math.min(7, surah.ayahs.length));
    setStage('idle');
    setQuestions([]);
    setCurrentIndex(0);
    setAttempts({});
    setResults(null);
    cleanupRecording();
  }, [surah.number, surah.ayahs.length, cleanupRecording]);

  // تنظيف عند الإغلاق
  useEffect(() => () => cleanupRecording(), [cleanupRecording]);

  // إيقاف التسجيل عند التنقل
  useEffect(() => {
    if (recordingState !== 'idle') stopRecording();
    setShowTextInput(false);
    setTextInput('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // ─── بناء الأسئلة ───
  const buildQuestions = (): Question[] => {
    const selectedAyahs = surah.ayahs.filter(
      (ayah) => ayah.numberInSurah >= startAyah && ayah.numberInSurah <= endAyah,
    );
    const questionsAyahs = testMode === 'next_ayah' ? selectedAyahs.slice(0, -1) : selectedAyahs;

    return questionsAyahs.map((ayah, index) => {
      const words = extractWords(ayah.text).map((word) => word.original);
      if (testMode !== 'next_ayah') {
        return { ayah, words, normalized: words.map(normalizeArabic) };
      }

      const nextAyah = selectedAyahs[index + 1];
      if (!nextAyah) {
        return { ayah, words, normalized: words.map(normalizeArabic) };
      }
      const options = createNextAyahOptions(surah, ayah, nextAyah);
      return { ayah, words, normalized: words.map(normalizeArabic), nextAyah, options };
    });
  };

  // ─── بدء التسجيل ───
  const startRecording = async () => {
    setError(null);
    const SR = getSpeechRecognition();
    if (!SR) {
      setError('المتصفح لا يدعم التعرف على الصوت. استخدم Chrome أو Edge، أو اكتب تسميعك.');
      setShowTextInput(true);
      return;
    }
    try {
      const recognition = new SR();
      recognition.lang = 'ar-SA';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      finalTranscriptRef.current = '';
      setLiveTranscript('');
      recordingAyahIdxRef.current = currentIndex;

      recognition.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalTranscriptRef.current += ' ' + t;
          else interim += ' ' + t;
        }
        setLiveTranscript((finalTranscriptRef.current + interim).trim());
        resetSilenceTimer();
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setError('تم رفض إذن الميكروفون. اسمح به من إعدادات المتصفح.');
          shouldContinueRef.current = false;
        } else if (event.error === 'audio-capture') {
          setError('لا يوجد ميكروفون متاح.');
          shouldContinueRef.current = false;
        } else if (event.error === 'network') {
          setError('خطأ في الشبكة أثناء التعرف على الصوت.');
          shouldContinueRef.current = false;
        }
      };

      recognition.onend = () => {
        if (shouldContinueRef.current) {
          try {
            recognition.start();
          } catch {
            // The browser may reject a restart while recognition is still active.
          }
        } else {
          finalizeAttempt(recordingAyahIdxRef.current);
        }
      };

      recognitionRef.current = recognition;
      shouldContinueRef.current = true;
      recognition.start();

      setRecordingState('listening');
      setRecordingSeconds(0);
      secondsTimerRef.current = window.setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
      resetSilenceTimer();
    } catch {
      setError('تعذر بدء التعرف على الصوت. حاول مرة أخرى.');
    }
  };

  const resetSilenceTimer = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = window.setTimeout(() => {
      if (shouldContinueRef.current) stopRecording();
    }, 4000);
  };

  const stopRecording = () => {
    shouldContinueRef.current = false;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (secondsTimerRef.current) {
      clearInterval(secondsTimerRef.current);
      secondsTimerRef.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      // The recognition session may already be stopped.
    }
    setRecordingState('processing');
  };

  // ─── إنهاء محاولة ومقارنة ───
  const finalizeAttempt = (ayahIdx: number) => {
    const transcript = finalTranscriptRef.current.trim();
    setRecordingState('idle');
    setRecordingSeconds(0);

    if (!transcript) {
      setError('لم يُسمع شيء. حاول مرة أخرى أو اكتب تسميعك.');
      return;
    }

    const q = questions[ayahIdx];
    if (!q) return;

    const recognized = transcript.split(/\s+/).map(normalizeArabic).filter(Boolean);
    const { matchedE, matchedR } = alignLCS(q.normalized, recognized);
    const extraWords = recognized.filter((_, i) => !matchedR.has(i));
    const accuracy =
      q.normalized.length > 0 ? Math.round((matchedE.size / q.normalized.length) * 100) : 0;

    setAttempts((prev) => ({
      ...prev,
      [ayahIdx]: { transcript, matched: matchedE, extraWords, accuracy, revealed: false },
    }));
    setError(null);
  };

  // ─── إدخال يدوي ───
  const submitText = () => {
    const text = textInput.trim();
    if (!text) return;
    finalTranscriptRef.current = text;
    finalizeAttempt(currentIndex);
    setTextInput('');
    setShowTextInput(false);
  };

  const revealAyah = () => {
    setAttempts((prev) => ({
      ...prev,
      [currentIndex]: {
        transcript: '',
        matched: new Set(),
        extraWords: [],
        accuracy: 0,
        revealed: true,
        selectedAyahNumber: undefined,
      },
    }));
  };

  const selectNextAyah = (selectedAyah: Ayah) => {
    if (!currentQ?.nextAyah) return;
    const isCorrect = selectedAyah.numberInSurah === currentQ.nextAyah.numberInSurah;
    setAttempts((previous) => ({
      ...previous,
      [currentIndex]: {
        transcript: '',
        matched: isCorrect ? new Set(currentQ.normalized.map((_, index) => index)) : new Set(),
        extraWords: [],
        accuracy: isCorrect ? 100 : 0,
        revealed: false,
        selectedAyahNumber: selectedAyah.numberInSurah,
      },
    }));
    setError(null);
  };

  const isCorrectAttempt = useCallback(
    (question: Question, attempt: AyahAttempt): boolean =>
      testMode === 'next_ayah'
        ? !attempt.revealed && attempt.selectedAyahNumber === question.nextAyah?.numberInSurah
        : !attempt.revealed && attempt.matched.size === question.normalized.length,
    [testMode],
  );

  const retryAttempt = () => {
    setAttempts((prev) => {
      const copy = { ...prev };
      delete copy[currentIndex];
      return copy;
    });
    setError(null);
  };

  const goNext = () => {
    if (currentIndex < questions.length - 1) setCurrentIndex((i) => i + 1);
  };
  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  // ─── بدء/إنهاء/إعادة ───
  const startTest = () => {
    if (!canStartTest) return;
    setQuestions(buildQuestions());
    setCurrentIndex(0);
    setAttempts({});
    setResults(null);
    setStage('running');
    setError(null);
  };

  const finishTest = () => {
    let perfectAyahs = 0,
      matchedWords = 0,
      totalWords = 0,
      attemptedAyahs = 0;
    questions.forEach((q, idx) => {
      const a = attempts[idx];
      const total = testMode === 'next_ayah' ? 1 : q.normalized.length;
      totalWords += total;
      if (a) {
        attemptedAyahs++;
        const correct = isCorrectAttempt(q, a);
        matchedWords += correct ? total : testMode === 'next_ayah' ? 0 : a.matched.size;
        if (correct) perfectAyahs++;
        const resultAyahNumber =
          testMode === 'next_ayah' ? q.nextAyah?.numberInSurah : q.ayah.numberInSurah;
        if (resultAyahNumber !== undefined) {
          recordVerseResult(surah.number, resultAyahNumber, correct, []);
        }
      }
    });
    const accuracy = totalWords > 0 ? Math.round((matchedWords / totalWords) * 100) : 0;
    setResults({
      totalAyahs: questions.length,
      attemptedAyahs,
      perfectAyahs,
      totalWords,
      matchedWords,
      accuracy,
    });
    addPointsAndVerses(
      Math.round(perfectAyahs * 20 + matchedWords * 2),
      perfectAyahs,
      accuracy,
      accuracy,
    );
    onStatsUpdate();
    setStage('finished');
  };

  const resetTest = () => {
    cleanupRecording();
    setStage('idle');
    setQuestions([]);
    setCurrentIndex(0);
    setAttempts({});
    setResults(null);
    setRecordingState('idle');
    setLiveTranscript('');
    setError(null);
  };

  // ─── قيم مشتقة ───
  const currentQ = questions[currentIndex];
  const currentAttempt = attempts[currentIndex];
  const maxAyah = surah.ayahs.length;
  const answeredCount = Object.keys(attempts).length;

  const cumulative = useMemo(() => {
    let m = 0,
      t = 0;
    questions.forEach((q, i) => {
      const a = attempts[i];
      if (a) {
        if (testMode === 'next_ayah') {
          t++;
          if (isCorrectAttempt(q, a)) m++;
        } else {
          m += a.matched.size;
          t += q.normalized.length;
        }
      }
    });
    return t > 0 ? Math.round((m / t) * 100) : 0;
  }, [attempts, isCorrectAttempt, questions, testMode]);

  const canStartTest =
    endAyah >= startAyah && (testMode !== 'next_ayah' || endAyah - startAyah >= 1);
  const testQuestionCount =
    testMode === 'next_ayah' ? Math.max(0, endAyah - startAyah) : endAyah - startAyah + 1;

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="flex h-full flex-col bg-[#f7f6f1]" dir="rtl">
      {/* شريط تقدم علوي */}
      {stage === 'running' && currentQ && (
        <div className="shrink-0 border-b border-emerald-950/10 bg-white/90 backdrop-blur">
          <div className="mx-auto max-w-3xl px-3 py-3 sm:px-4">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-stone-600">
              <span className="inline-flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-emerald-700" />
                {testMode === 'next_ayah'
                  ? `ما الآية التالية بعد الآية ${currentQ.ayah.numberInSurah}؟`
                  : `الآية ${currentQ.ayah.numberInSurah}`}
              </span>
              <span className="tabular-nums">
                {answeredCount}/{questions.length} · دقة {cumulative}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
              <div
                className="h-full bg-gradient-to-l from-amber-400 via-emerald-600 to-emerald-800 transition-all duration-300"
                style={{ width: `${(answeredCount / Math.max(1, questions.length)) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* المحتوى */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-3xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
          {/* ════════ IDLE ════════ */}
          {stage === 'idle' && (
            <div className="space-y-5">
              <section className="relative isolate overflow-hidden rounded-[1.75rem] bg-[radial-gradient(ellipse_at_85%_15%,rgba(16,185,129,0.28),transparent_38%),linear-gradient(125deg,#022c22_0%,#064e3b_58%,#073b32_100%)] p-5 text-white shadow-lg shadow-emerald-950/10 sm:p-7">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -left-12 -top-20 h-48 w-48 rounded-full border border-amber-100/10"
                />
                <div className="relative flex items-start gap-4">
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-100/20 bg-white/10 text-amber-200">
                    <Trophy className="h-6 w-6" />
                  </span>
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-200">
                      <Sparkles className="h-3.5 w-3.5" />
                      تدريب تفاعلي
                    </span>
                    <h2 className="mt-1 font-serif text-2xl font-bold leading-tight sm:text-3xl">
                      اختبر ثبات حفظك
                    </h2>
                    <p className="mt-2 max-w-xl text-xs leading-6 text-emerald-50/85 sm:text-sm">
                      اختر طريقة تناسبك، حدّد مقطعًا من سورة {surah.name}، وابدأ التحدي.
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-stone-200/80 bg-white p-4 shadow-sm sm:p-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-stone-900">اختر نوع الاختبار</h3>
                    <p className="mt-1 text-[11px] text-stone-500">
                      يمكنك التبديل بينهما في أي وقت
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-bold text-amber-800">
                    سورة {surah.name}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="نوع الاختبار">
                  <button
                    type="button"
                    onClick={() => setTestMode('recitation')}
                    aria-pressed={testMode === 'recitation'}
                    className={`group rounded-2xl border p-4 text-right transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
                      testMode === 'recitation'
                        ? 'border-emerald-700 bg-emerald-50/70 shadow-sm'
                        : 'border-stone-200 bg-stone-50/60 hover:border-emerald-300 hover:bg-emerald-50/40'
                    }`}
                  >
                    <span
                      className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${
                        testMode === 'recitation'
                          ? 'bg-emerald-800 text-amber-200'
                          : 'bg-white text-emerald-800'
                      }`}
                    >
                      <Mic className="h-5 w-5" />
                    </span>
                    <span className="block text-sm font-bold text-stone-900">التسميع الصوتي</span>
                    <span className="mt-1 block text-[11px] leading-5 text-stone-500">
                      سمّع الآية بصوتك أو اكتبها، ثم راجع مواضع التطابق.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestMode('next_ayah')}
                    aria-pressed={testMode === 'next_ayah'}
                    className={`group rounded-2xl border p-4 text-right transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
                      testMode === 'next_ayah'
                        ? 'border-emerald-700 bg-emerald-50/70 shadow-sm'
                        : 'border-stone-200 bg-stone-50/60 hover:border-emerald-300 hover:bg-emerald-50/40'
                    }`}
                  >
                    <span
                      className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${
                        testMode === 'next_ayah'
                          ? 'bg-emerald-800 text-amber-200'
                          : 'bg-white text-amber-700'
                      }`}
                    >
                      <BookOpen className="h-5 w-5" />
                    </span>
                    <span className="block text-sm font-bold text-stone-900">
                      ما الآية التالية؟
                    </span>
                    <span className="mt-1 block text-[11px] leading-5 text-stone-500">
                      اقرأ الآية واختر الآية التي تليها من بين الخيارات.
                    </span>
                  </button>
                </div>
              </section>

              <section className="rounded-3xl border border-stone-200/80 bg-white p-4 shadow-sm sm:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-800">
                    <Settings className="h-4 w-4" />
                  </span>
                  <h3 className="text-sm font-bold text-stone-900">إعداد نطاق الاختبار</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-2 text-xs font-semibold text-stone-700">
                    من الآية
                    <input
                      type="number"
                      min={1}
                      max={maxAyah}
                      value={startAyah}
                      onChange={(e) => {
                        const v = Math.min(maxAyah, Math.max(1, Number(e.target.value)));
                        setStartAyah(v);
                        setEndAyah((prev) => Math.max(prev, v));
                      }}
                      className="min-h-11 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                    />
                  </label>
                  <label className="space-y-2 text-xs font-semibold text-stone-700">
                    إلى الآية
                    <input
                      type="number"
                      min={startAyah}
                      max={maxAyah}
                      value={endAyah}
                      onChange={(e) =>
                        setEndAyah(Math.min(maxAyah, Math.max(startAyah, Number(e.target.value))))
                      }
                      className="min-h-11 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                    />
                  </label>
                </div>

                {testMode === 'recitation' && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold text-stone-700">المساعدة البصرية</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ['none', 'بدون', 'تسميع من الذاكرة'],
                          ['first_word', 'الكلمة الأولى', 'تلميح لبداية الآية'],
                          ['full', 'كاملة', 'وضع القراءة'],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setHintMode(key)}
                          className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors ${
                            hintMode === key
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                              : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-900/10 bg-emerald-50/60 p-3 text-xs text-emerald-950">
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <BookOpen className="h-4 w-4 shrink-0 text-emerald-800" />
                    الآيات {startAyah.toLocaleString('ar-EG')}–{endAyah.toLocaleString('ar-EG')}
                  </span>
                  <span className="text-emerald-900/75">
                    {testQuestionCount.toLocaleString('ar-EG')} سؤال
                    {testMode === 'next_ayah' && ' (بين كل آيتين متتاليتين)'}
                    {testMode === 'recitation' && ` · ${RIWAYA_LABELS[effectiveRiwaya]}`}
                  </span>
                </div>
                {testMode === 'next_ayah' && endAyah === startAyah && (
                  <p className="mt-3 text-xs font-medium text-amber-800" role="status">
                    اختر آيتين على الأقل لإنشاء سؤال عن الآية التالية.
                  </p>
                )}

                {testMode === 'recitation' && !speechSupported && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      متصفحك لا يدعم التعرف على الصوت. استخدم Chrome أو Edge، أو اكتب تسميعك يدويًا.
                    </span>
                  </div>
                )}
                {testMode === 'recitation' && speechSupported && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900 flex items-start gap-2">
                    <Mic className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      عند الضغط على الميكروفون سيُطلب إذن التسجيل. تكلّم بوضوح بالعربية الفصحى.
                    </span>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ════════ RUNNING ════════ */}
          {stage === 'running' && currentQ && (
            <>
              {testMode === 'next_ayah' ? (
                <section className="overflow-hidden rounded-[1.75rem] border border-emerald-950/10 bg-white shadow-lg shadow-emerald-950/5">
                  <div className="flex items-center justify-between gap-3 bg-emerald-950 px-4 py-3 text-white sm:px-6">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-amber-200">
                        <BookOpen className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-[10px] font-semibold text-emerald-100/70">
                          سورة {surah.name}
                        </p>
                        <h2 className="text-sm font-bold">تحدّي تسلسل الآيات</h2>
                      </div>
                    </div>
                    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold tabular-nums">
                      {currentIndex + 1} / {questions.length}
                    </span>
                  </div>

                  <div className="space-y-5 p-4 sm:p-7">
                    <div className="text-center">
                      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-900">
                        بعد الآية {currentQ.ayah.numberInSurah.toLocaleString('ar-EG')}
                      </span>
                      <p className="mt-4 font-quran text-2xl leading-[2.2] text-stone-900 sm:text-3xl">
                        {currentQ.ayah.text}
                      </p>
                      <p className="mt-3 text-xs font-semibold text-emerald-900">
                        ما الآية التي تأتي بعدها؟
                      </p>
                    </div>

                    <div className="grid gap-2.5">
                      {currentQ.options?.map((option, optionIndex) => {
                        const selected =
                          currentAttempt?.selectedAyahNumber === option.numberInSurah;
                        const correct = option.numberInSurah === currentQ.nextAyah?.numberInSurah;
                        const showAnswer = !!currentAttempt;
                        const optionStyle =
                          showAnswer && correct
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-500/30'
                            : showAnswer && selected && !correct
                              ? 'border-rose-300 bg-rose-50 text-rose-950'
                              : 'border-stone-200 bg-stone-50/70 text-stone-800 hover:border-emerald-300 hover:bg-emerald-50/50';

                        return (
                          <button
                            key={option.numberInSurah}
                            type="button"
                            onClick={() => selectNextAyah(option)}
                            disabled={showAnswer}
                            aria-pressed={selected}
                            className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border p-3 text-right transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-default sm:p-4 ${optionStyle}`}
                          >
                            <span
                              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                                showAnswer && correct
                                  ? 'border-emerald-300 bg-white text-emerald-800'
                                  : showAnswer && selected
                                    ? 'border-rose-200 bg-white text-rose-700'
                                    : 'border-stone-200 bg-white text-stone-500'
                              }`}
                            >
                              {optionIndex + 1}
                            </span>
                            <span className="font-quran text-lg leading-[2] sm:text-xl">
                              {option.text}
                            </span>
                            {showAnswer && correct && (
                              <CheckCircle2 className="mr-auto h-5 w-5 shrink-0 text-emerald-700" />
                            )}
                            {showAnswer && selected && !correct && (
                              <XCircle className="mr-auto h-5 w-5 shrink-0 text-rose-600" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {currentAttempt && (
                      <div
                        className={`flex items-start gap-2 rounded-2xl p-3 text-xs leading-6 ${
                          currentAttempt.revealed
                            ? 'border border-stone-200 bg-stone-50 text-stone-600'
                            : currentAttempt.accuracy === 100
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                              : 'border border-amber-200 bg-amber-50 text-amber-950'
                        }`}
                        role="status"
                      >
                        {currentAttempt.revealed ? (
                          <Eye className="mt-1 h-4 w-4 shrink-0" />
                        ) : currentAttempt.accuracy === 100 ? (
                          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" />
                        ) : (
                          <AlertTriangle className="mt-1 h-4 w-4 shrink-0" />
                        )}
                        <span>
                          {currentAttempt.revealed ? (
                            <>
                              كُشفت الإجابة:{' '}
                              <span className="font-quran text-base font-bold">
                                {currentQ.nextAyah?.text}
                              </span>{' '}
                              — لن تُحتسب ضمن النتيجة.
                            </>
                          ) : currentAttempt.accuracy === 100 ? (
                            'إجابة صحيحة، أحسنت! واصل إلى السؤال التالي.'
                          ) : (
                            <>
                              ليست هذه الآية التالية. الإجابة الصحيحة:{' '}
                              <span className="font-quran text-base font-bold">
                                {currentQ.nextAyah?.text}
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-4">
                      <button
                        type="button"
                        onClick={goPrev}
                        disabled={currentIndex === 0}
                        className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-40"
                      >
                        <ChevronRight className="h-4 w-4" />
                        السابق
                      </button>
                      <div className="flex items-center gap-2">
                        {!currentAttempt && (
                          <button
                            type="button"
                            onClick={revealAyah}
                            className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"
                          >
                            <Eye className="h-4 w-4" />
                            اكشف الإجابة
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={currentAttempt ? retryAttempt : goNext}
                          disabled={!currentAttempt && currentIndex === questions.length - 1}
                          className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-emerald-800 px-4 text-xs font-bold text-white transition hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {currentAttempt ? (
                            <>
                              <RotateCcw className="h-4 w-4" /> أعد السؤال
                            </>
                          ) : (
                            <>
                              تخطَّ <ChevronLeft className="h-4 w-4" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              ) : (
                <>
                  <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-stone-100 flex items-center justify-between bg-stone-50/60">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-emerald-700 text-white text-[11px] font-bold tabular-nums px-1.5">
                          {currentQ.ayah.numberInSurah}
                        </span>
                        <span className="text-[11px] text-stone-500 font-semibold">
                          آية {currentIndex + 1} من {questions.length}
                        </span>
                      </div>
                      {currentAttempt && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            currentAttempt.revealed
                              ? 'bg-stone-100 text-stone-600'
                              : currentAttempt.accuracy >= 85
                                ? 'bg-emerald-100 text-emerald-800'
                                : currentAttempt.accuracy >= 50
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {currentAttempt.revealed ? (
                            <>
                              <Eye className="w-3 h-3" /> مكشوفة
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3 h-3" /> {currentAttempt.accuracy}%
                            </>
                          )}
                        </span>
                      )}
                    </div>

                    {/* محتوى البطاقة */}
                    <div className="px-4 py-6">
                      {/* لم يحاول بعد — عرض التلميح */}
                      {!currentAttempt && recordingState === 'idle' && (
                        <div className="space-y-4">
                          <div className="text-center">
                            {hintMode === 'none' && (
                              <p className="text-sm text-stone-500">سمّع الآية كاملة من ذاكرتك</p>
                            )}
                            {hintMode === 'first_word' && (
                              <div dir="rtl" className="font-quran text-2xl text-emerald-800">
                                {currentQ.words[0]} ...
                              </div>
                            )}
                            {hintMode === 'full' && (
                              <div
                                dir="rtl"
                                className="font-quran text-2xl leading-[2] text-stone-800"
                              >
                                {currentQ.words.join(' ')}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* أثناء التسجيل */}
                      {recordingState === 'listening' && (
                        <div className="space-y-4">
                          <div className="flex justify-center">
                            <div className="relative inline-flex h-20 w-20 items-center justify-center rounded-full bg-rose-100">
                              <span className="absolute inset-0 rounded-full bg-rose-200 animate-ping opacity-60" />
                              <Mic className="w-9 h-9 text-rose-700 relative" />
                            </div>
                          </div>
                          <div className="text-center text-xs font-semibold text-rose-700">
                            يستمع... {formatTime(recordingSeconds)}
                          </div>
                          {liveTranscript && (
                            <div
                              dir="rtl"
                              className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700 font-quran text-center min-h-12"
                            >
                              {liveTranscript}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={stopRecording}
                            className="w-full inline-flex items-center justify-center gap-2 min-h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm"
                          >
                            <Square className="w-4 h-4" /> إيقاف التسجيل
                          </button>
                        </div>
                      )}

                      {/* المعالجة */}
                      {recordingState === 'processing' && (
                        <div className="flex flex-col items-center gap-3 py-4">
                          <Loader2 className="w-8 h-8 text-emerald-700 animate-spin" />
                          <p className="text-xs text-stone-500 font-semibold">جاري المقارنة...</p>
                        </div>
                      )}

                      {/* بعد المحاولة — عرض النتيجة */}
                      {currentAttempt && (
                        <div className="space-y-4">
                          {/* الآية بالألوان */}
                          <div
                            dir="rtl"
                            className="font-quran text-2xl sm:text-3xl leading-[2.2] text-center flex flex-wrap gap-x-2 gap-y-2 justify-center"
                          >
                            {currentQ.words.map((w, idx) => {
                              const matched = currentAttempt.matched.has(idx);
                              if (currentAttempt.revealed) {
                                return (
                                  <span key={idx} className="text-stone-800">
                                    {w}
                                  </span>
                                );
                              }
                              return (
                                <span
                                  key={idx}
                                  className={
                                    matched
                                      ? 'text-emerald-700'
                                      : 'text-rose-600 underline decoration-rose-400 decoration-2 underline-offset-4'
                                  }
                                >
                                  {w}
                                </span>
                              );
                            })}
                          </div>

                          {/* كلمات إضافية */}
                          {currentAttempt.extraWords.length > 0 && !currentAttempt.revealed && (
                            <div dir="rtl" className="text-xs text-stone-500 text-center">
                              <span className="font-semibold">كلمات إضافية: </span>
                              <span className="text-amber-700 font-quran">
                                {currentAttempt.extraWords.join(' ')}
                              </span>
                            </div>
                          )}

                          {/* الدقة */}
                          {!currentAttempt.revealed && (
                            <div className="text-center">
                              <span
                                className={`text-3xl font-bold tabular-nums ${
                                  currentAttempt.accuracy >= 85
                                    ? 'text-emerald-700'
                                    : currentAttempt.accuracy >= 50
                                      ? 'text-amber-700'
                                      : 'text-rose-700'
                                }`}
                              >
                                {currentAttempt.accuracy}%
                              </span>
                              <p className="text-[11px] text-stone-500 mt-1">
                                {currentAttempt.matched.size} من {currentQ.normalized.length} كلمة
                                صحيحة
                              </p>
                            </div>
                          )}

                          {currentAttempt.revealed && (
                            <p className="text-center text-xs text-stone-500">
                              تم كشف الآية — لن تُحتسب ضمن النتيجة
                            </p>
                          )}

                          {/* النص المُسموع */}
                          {currentAttempt.transcript && !currentAttempt.revealed && (
                            <div
                              dir="rtl"
                              className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-xs text-stone-600 font-quran text-center"
                            >
                              <span className="text-[10px] font-sans font-bold text-stone-400 block mb-1">
                                ما سُمِع
                              </span>
                              {currentAttempt.transcript}
                            </div>
                          )}

                          {/* أزرار الإجراءات */}
                          <div className="flex flex-wrap justify-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={retryAttempt}
                              className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> إعادة المحاولة
                            </button>
                            {currentIndex < questions.length - 1 && (
                              <button
                                type="button"
                                onClick={goNext}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 text-xs font-bold"
                              >
                                الآية التالية <ChevronLeft className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* زر كشف */}
                      {!currentAttempt && recordingState === 'idle' && (
                        <div className="pt-4 text-center">
                          <button
                            type="button"
                            onClick={revealAyah}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-400 hover:text-stone-700 underline-offset-2 hover:underline"
                          >
                            <Eye className="w-3 h-3" /> أظهر الآية (لن تُحتسب)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* رسالة خطأ */}
                  {error && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* زر الميكروفون الرئيسي */}
                  {recordingState === 'idle' && !currentAttempt && (
                    <div className="flex flex-col items-center gap-3">
                      <button
                        type="button"
                        onClick={startRecording}
                        className="inline-flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-lg shadow-emerald-900/20 hover:shadow-xl active:scale-95 transition-all"
                        aria-label="ابدأ التسميع"
                      >
                        <Mic className="w-11 h-11" />
                      </button>
                      <p className="text-xs font-semibold text-stone-600">اضغط للتسميع</p>
                      {!showTextInput && (
                        <button
                          type="button"
                          onClick={() => setShowTextInput(true)}
                          className="inline-flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-700"
                        >
                          <Keyboard className="w-3 h-3" /> أو اكتب تسميعك
                        </button>
                      )}
                    </div>
                  )}

                  {/* إدخال يدوي */}
                  {showTextInput && !currentAttempt && (
                    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 space-y-2">
                      <textarea
                        dir="rtl"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="اكتب تسميعك هنا..."
                        className="w-full min-h-24 rounded-xl border border-stone-300 p-3 text-sm font-quran resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        lang="ar"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowTextInput(false);
                            setTextInput('');
                          }}
                          className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700"
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          onClick={submitText}
                          disabled={!textInput.trim()}
                          className="flex-1 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white px-3 py-2 text-xs font-bold"
                        >
                          تحقق
                        </button>
                      </div>
                    </div>
                  )}

                  {/* التنقل */}
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={goPrev}
                      disabled={currentIndex === 0}
                      className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-30"
                    >
                      <ChevronRight className="w-4 h-4" /> السابق
                    </button>
                    <button
                      type="button"
                      onClick={goNext}
                      disabled={currentIndex === questions.length - 1}
                      className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-30"
                    >
                      التالي <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ════════ FINISHED ════════ */}
          {stage === 'finished' && results && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 text-center space-y-4">
                <div
                  className={`inline-flex h-20 w-20 items-center justify-center rounded-full ${
                    results.accuracy >= 80
                      ? 'bg-emerald-100 text-emerald-700'
                      : results.accuracy >= 50
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  <Trophy className="w-10 h-10" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-stone-900">
                    {results.accuracy >= 80
                      ? 'ما شاء الله — ممتاز'
                      : results.accuracy >= 50
                        ? 'جيد — واصل المراجعة'
                        : 'يحتاج مراجعة'}
                  </h2>
                  <p className="text-sm text-stone-500 mt-1">
                    {results.perfectAyahs} من {results.totalAyahs}{' '}
                    {testMode === 'next_ayah' ? 'إجابة صحيحة' : 'آية كاملة'}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                    <p className="text-[10px] text-emerald-700 font-bold">الدقة</p>
                    <p className="text-2xl font-bold text-emerald-900 tabular-nums">
                      {results.accuracy}%
                    </p>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                    <p className="text-[10px] text-amber-700 font-bold">
                      {testMode === 'next_ayah' ? 'إجابات صحيحة' : 'كلمات صحيحة'}
                    </p>
                    <p className="text-2xl font-bold text-amber-900 tabular-nums">
                      {results.matchedWords}/{results.totalWords}
                    </p>
                  </div>
                  <div className="rounded-xl bg-stone-50 border border-stone-200 p-3">
                    <p className="text-[10px] text-stone-700 font-bold">
                      {testMode === 'next_ayah' ? 'أسئلة' : 'آيات'}
                    </p>
                    <p className="text-2xl font-bold text-stone-900 tabular-nums">
                      {results.perfectAyahs}/{results.totalAyahs}
                    </p>
                  </div>
                </div>
              </div>

              {/* تفصيل الآيات */}
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700 pb-1">
                  <BookOpen className="w-4 h-4 text-stone-400" /> تفصيل الآيات
                </div>
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {questions.map((q, i) => {
                    const a = attempts[i];
                    const total = testMode === 'next_ayah' ? 1 : q.normalized.length;
                    const matched = !a
                      ? 0
                      : testMode === 'next_ayah'
                        ? Number(isCorrectAttempt(q, a))
                        : a.matched.size;
                    const perfect = !!a && isCorrectAttempt(q, a);
                    return (
                      <div
                        key={i}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                          !a
                            ? 'border-stone-200 bg-stone-50/60'
                            : perfect
                              ? 'border-emerald-200 bg-emerald-50/60'
                              : 'border-rose-200 bg-rose-50/60'
                        }`}
                      >
                        <span className="text-xs font-semibold text-stone-700">
                          {testMode === 'next_ayah'
                            ? `بعد الآية ${q.ayah.numberInSurah.toLocaleString('ar-EG')}`
                            : `الآية ${q.ayah.numberInSurah.toLocaleString('ar-EG')}`}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold tabular-nums ${
                            !a ? 'text-stone-400' : perfect ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {!a ? (
                            'لم يُجب'
                          ) : a.revealed ? (
                            'مكشوفة'
                          ) : perfect ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />{' '}
                              {testMode === 'next_ayah' ? 'صحيح' : `${matched}/${total}`}
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5" />{' '}
                              {testMode === 'next_ayah' ? 'تحتاج مراجعة' : `${matched}/${total}`}
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* الشريط السفلي الثابت */}
      <div className="shrink-0 bg-white border-t border-stone-200 shadow-lg">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-2 flex items-center justify-between gap-2">
          {stage === 'idle' && (
            <button
              type="button"
              onClick={startTest}
              disabled={!canStartTest}
              className="w-full inline-flex items-center justify-center gap-2 min-h-11 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white font-bold text-sm"
            >
              <Play className="w-4 h-4" /> ابدأ الاختبار
            </button>
          )}

          {stage === 'running' && (
            <>
              <span className="text-[11px] font-semibold text-stone-500">
                {currentIndex + 1} / {questions.length}
              </span>
              <button
                type="button"
                onClick={finishTest}
                className="inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm"
              >
                <Flag className="w-4 h-4" /> إنهاء الاختبار
              </button>
            </>
          )}

          {stage === 'finished' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setQuestions(buildQuestions());
                  setCurrentIndex(0);
                  setAttempts({});
                  setResults(null);
                  setStage('running');
                }}
                className="inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl border border-stone-300 bg-white text-stone-700 font-semibold text-sm hover:bg-stone-50"
              >
                <RotateCcw className="w-4 h-4" /> إعادة
              </button>
              <button
                type="button"
                onClick={resetTest}
                className="inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm"
              >
                <Settings className="w-4 h-4" /> إعدادات جديدة
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
