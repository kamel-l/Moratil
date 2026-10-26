import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import {
  CheckCircle2, XCircle, RotateCcw, Trophy, Play,
  Eye, EyeOff, StopCircle, CalendarClock, Sparkles,
  Target, Clock, Award,
} from 'lucide-react';
import { Surah, Reciter } from '../types/quran';
import { extractWords, normalizeArabicText } from '../utils/arabicUtils';
import { recordVerseResult, addPointsAndVerses } from '../services/storageService';
import { useRecitationSession } from '../hooks/useRecitationSession';

function isBasmalahPrefix(words: { original: string }[]): boolean {
  if (words.length < 4) return false;
  return (
    normalizeArabicText(words[0].original) === 'بسم' &&
    normalizeArabicText(words[1].original) === 'الله' &&
    (normalizeArabicText(words[2].original) === 'الرحمن' ||
      normalizeArabicText(words[2].original) === 'الرحمان') &&
    normalizeArabicText(words[3].original) === 'الرحيم'
  );
}

interface TestResult {
  ayahNumber: number;
  isFlawless: boolean;
  failedWords: { expectedWord: string; recitedWord: string }[];
}

interface MemorizationTestProps {
  surah: Surah;
  selectedReciter: Reciter;
  onStatsUpdate: () => void;
  embedded?: boolean;
}

type TestPhase = 'setup' | 'testing' | 'results';
type HintMode = 'blind' | 'letter';

export const MemorizationTest: React.FC<MemorizationTestProps> = ({
  surah,
  onStatsUpdate,
  embedded = false,
}) => {
  const [phase, setPhase] = useState<TestPhase>('setup');
  const [hintMode, setHintMode] = useState<HintMode>('blind');
  const [startAyah, setStartAyah] = useState(1);
  const [endAyah, setEndAyah] = useState(() => Math.min(3, surah.ayahs.length));
  const [currentTestAyah, setCurrentTestAyah] = useState(1);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [endedAt, setEndedAt] = useState(0);

  // Refs
  const recognitionRef = useRef<any>(null);
  const incomingSpeechHandlerRef = useRef<
    (text: string, confidence?: number) => { completed: boolean; isFlawless: boolean } | undefined
  >(() => undefined);
  const verseCompletionHandlerRef = useRef<(isFlawless: boolean) => void>(() => {});
  const nativeRecognitionRunnerRef = useRef<() => Promise<void>>(async () => {});
  const nativeRecognitionActiveRef = useRef(false);
  const recognitionEnabledRef = useRef(false);
  const recognitionRequestIdRef = useRef(0);
  const isAyahCompletedRef = useRef(false);
  const completionHandledRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  const currentWordIdxForAltRef = useRef(0);
  const phaseRef = useRef<TestPhase>('setup');

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const currentAyah = surah.ayahs[currentTestAyah - 1];

  const verseWords = useMemo(() => {
    if (!currentAyah) return [];
    const allWords = extractWords(currentAyah.text);
    if (
      currentAyah.numberInSurah === 1 &&
      surah.number !== 1 &&
      surah.number !== 9 &&
      isBasmalahPrefix(allWords)
    ) {
      return allWords.slice(4);
    }
    return allWords;
  }, [currentAyah, surah.number]);

  const {
    currentWordIdx,
    matchedWords,
    isAyahCompleted,
    completionLockRef,
    handleIncomingSpokenText,
    resetRecitationState,
    failedWordsRef,
  } = useRecitationSession(verseWords);

  useEffect(() => {
    currentWordIdxForAltRef.current = currentWordIdx;
  }, [currentWordIdx]);

  useEffect(() => {
    if (phase !== 'testing') return;
    completionHandledRef.current = false;
    isAyahCompletedRef.current = false;
    completionLockRef.current = false;
    resetRecitationState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTestAyah, phase]);

  useEffect(() => {
    setPhase('setup');
    setStartAyah(1);
    setEndAyah(Math.min(3, surah.ayahs.length));
    setCurrentTestAyah(1);
    setTestResults([]);
    setIsListening(false);
    recognitionEnabledRef.current = false;
    nativeRecognitionActiveRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah.number]);

  // إتمام آية
  function handleVerseComplete(isFlawless: boolean) {
    if (completionHandledRef.current) return;
    completionHandledRef.current = true;

    const failedWordsList = Object.entries(failedWordsRef.current).map(([idx, heard]) => ({
      expectedWord: verseWords[parseInt(idx, 10)]?.original || '',
      recitedWord: heard,
    }));

    const result: TestResult = {
      ayahNumber: currentAyah.numberInSurah,
      isFlawless,
      failedWords: failedWordsList,
    };

    setTestResults((prev) => [...prev, result]);
    recordVerseResult(surah.number, currentAyah.numberInSurah, isFlawless, failedWordsList);
    addPointsAndVerses(isFlawless ? 35 : 20, 1, 30, isFlawless ? 100 : 85);
    onStatsUpdate();

    if (currentTestAyah < endAyah) {
      cooldownUntilRef.current = Date.now() + 200;
      setCurrentTestAyah((prev) => prev + 1);
    } else {
      void finalizeTest();
    }
  }
  verseCompletionHandlerRef.current = handleVerseComplete;

  async function finalizeTest() {
    setEndedAt(Date.now());
    setPhase('results');
    await stopListeningInternal();
  }

  // التعرف الصوتي — الويب
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    try {
      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      recognition.lang = 'ar-SA';

      recognition.onstart = () => {
        if (recognitionEnabledRef.current) setIsListening(true);
      };
      recognition.onend = () => {
        if (recognitionEnabledRef.current && phaseRef.current === 'testing') {
          setTimeout(() => {
            if (recognitionEnabledRef.current && phaseRef.current === 'testing') {
              try {
                recognition.start();
                setIsListening(true);
              } catch (e) {
                if (e instanceof DOMException && e.name === 'InvalidStateError') {
                  setIsListening(true);
                  return;
                }
                recognitionEnabledRef.current = false;
                setIsListening(false);
              }
            }
          }, 250);
          return;
        }
        setIsListening(false);
      };
      recognition.onerror = (event: any) => {
        if (
          ['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(event.error)
        ) {
          recognitionEnabledRef.current = false;
          setIsListening(false);
          try {
            recognitionRef.current?.stop();
          } catch (e) {
            /* ignore */
          }
        }
      };
      recognition.onresult = (event: any) => {
        if (!recognitionEnabledRef.current) return;
        if (phaseRef.current !== 'testing') return;
        if (Date.now() < cooldownUntilRef.current) return;

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          if (!result.isFinal) continue;
          const maxAlts = Math.min(result.length, 3);
          let progressed = false;
          for (let alt = 0; alt < maxAlts; alt++) {
            const transcript = result[alt].transcript.trim();
            const confidence = result[alt].confidence ?? 0.5;
            if (!transcript) continue;
            const beforeIdx = currentWordIdxForAltRef.current;
            const nextState = incomingSpeechHandlerRef.current(transcript, confidence);
            if (nextState?.completed) {
              verseCompletionHandlerRef.current(nextState.isFlawless);
              return;
            }
            if (currentWordIdxForAltRef.current > beforeIdx) {
              progressed = true;
              break;
            }
          }
          if (progressed) break;
        }
      };
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn('[Test SR] init error:', e);
    }

    return () => {
      recognitionRequestIdRef.current += 1;
      recognitionEnabledRef.current = false;
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  incomingSpeechHandlerRef.current = handleIncomingSpokenText;

  // التعرف الصوتي — الجوال
  const listenWithNativeRecognition = async () => {
    if (!nativeRecognitionActiveRef.current) return;
    try {
      const { matches } = await SpeechRecognition.start({
        language: 'ar-SA',
        maxResults: 3,
        partialResults: false,
        popup: false,
      });
      if (!nativeRecognitionActiveRef.current) return;

      if (phaseRef.current === 'testing' && Date.now() >= cooldownUntilRef.current) {
        const alts = (matches || []).slice(0, 3);
        for (const raw of alts) {
          const text = raw?.trim();
          if (!text) continue;
          const beforeIdx = currentWordIdxForAltRef.current;
          const nextState = incomingSpeechHandlerRef.current(text);
          if (nextState?.completed) {
            verseCompletionHandlerRef.current(nextState.isFlawless);
            break;
          }
          if (currentWordIdxForAltRef.current > beforeIdx) break;
        }
      }

      if (nativeRecognitionActiveRef.current) {
        setTimeout(() => {
          if (nativeRecognitionActiveRef.current) void nativeRecognitionRunnerRef.current();
        }, 200);
      }
    } catch (error: any) {
      const msg = String(error?.message || error || '').toLowerCase();
      const isSilence =
        msg.includes('no match') ||
        msg.includes('speech timeout') ||
        msg.includes('no speech') ||
        msg.includes('timed out');
      if (isSilence && nativeRecognitionActiveRef.current) {
        setTimeout(() => {
          if (nativeRecognitionActiveRef.current) void nativeRecognitionRunnerRef.current();
        }, 600);
        return;
      }
      nativeRecognitionActiveRef.current = false;
      recognitionEnabledRef.current = false;
      setIsListening(false);
    }
  };
  nativeRecognitionRunnerRef.current = listenWithNativeRecognition;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle: any = null;
    let cancelled = false;
    (async () => {
      try {
        handle = await SpeechRecognition.addListener(
          'listeningState',
          (data: { status: 'started' | 'stopped' }) => {
            if (cancelled) return;
            if (
              data.status === 'stopped' &&
              nativeRecognitionActiveRef.current &&
              phaseRef.current === 'testing'
            ) {
              setTimeout(() => {
                if (nativeRecognitionActiveRef.current && phaseRef.current === 'testing') {
                  void nativeRecognitionRunnerRef.current();
                }
              }, 300);
            }
          },
        );
      } catch (e) {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      if (handle) handle.remove().catch(() => {});
    };
  }, []);

  // بدء / إيقاف
  async function startListeningInternal() {
    recognitionEnabledRef.current = true;
    recognitionRequestIdRef.current += 1;
    const reqId = recognitionRequestIdRef.current;
    setIsListening(true);
    cooldownUntilRef.current = 0;

    if (Capacitor.isNativePlatform()) {
      try {
        const { available } = await SpeechRecognition.available();
        if (reqId !== recognitionRequestIdRef.current) return;
        if (!available) {
          recognitionEnabledRef.current = false;
          setIsListening(false);
          return;
        }
        let perm = await SpeechRecognition.checkPermissions();
        if (perm.speechRecognition !== 'granted')
          perm = await SpeechRecognition.requestPermissions();
        if (reqId !== recognitionRequestIdRef.current) return;
        if (perm.speechRecognition !== 'granted') {
          recognitionEnabledRef.current = false;
          setIsListening(false);
          return;
        }
        nativeRecognitionActiveRef.current = true;
        void listenWithNativeRecognition();
      } catch (e) {
        recognitionEnabledRef.current = false;
        setIsListening(false);
      }
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        if (e instanceof DOMException && e.name === 'InvalidStateError') return;
        recognitionEnabledRef.current = false;
        setIsListening(false);
      }
    } else {
      recognitionEnabledRef.current = false;
      setIsListening(false);
    }
  }

  async function stopListeningInternal() {
    recognitionRequestIdRef.current += 1;
    recognitionEnabledRef.current = false;
    if (Capacitor.isNativePlatform()) {
      if (nativeRecognitionActiveRef.current) {
        nativeRecognitionActiveRef.current = false;
        try {
          await SpeechRecognition.stop();
        } catch (e) {
          /* ignore */
        }
      }
    } else if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        /* ignore */
      }
    }
    setIsListening(false);
  }

  async function startTest() {
    if (startAyah < 1 || endAyah > surah.ayahs.length || startAyah > endAyah) return;
    setTestResults([]);
    setCurrentTestAyah(startAyah);
    setStartedAt(Date.now());
    setEndedAt(0);
    completionHandledRef.current = false;
    isAyahCompletedRef.current = false;
    completionLockRef.current = false;
    resetRecitationState();
    setPhase('testing');
    setTimeout(() => {
      void startListeningInternal();
    }, 300);
  }

  async function stopTest() {
    await finalizeTest();
  }
  function resetToSetup() {
    setPhase('setup');
    setTestResults([]);
    setCurrentTestAyah(startAyah);
    setStartedAt(0);
    setEndedAt(0);
  }
  function retryTest() {
    void startTest();
  }

  // ============ حسابات ============
  const totalVersesInRange = endAyah - startAyah + 1;
  const completedCount = testResults.length;
  const perfectCount = testResults.filter((r) => r.isFlawless).length;
  const accuracyPercent =
    completedCount > 0 ? Math.round((perfectCount / completedCount) * 100) : 0;
  const durationSec = endedAt > 0 && startedAt > 0 ? Math.round((endedAt - startedAt) / 1000) : 0;
  const durationStr = `${Math.floor(durationSec / 60)}:${(durationSec % 60)
    .toString()
    .padStart(2, '0')}`;

  const scoreColor =
    accuracyPercent >= 80
      ? 'text-emerald-600'
      : accuracyPercent >= 50
      ? 'text-amber-600'
      : 'text-rose-600';

  const scoreBadge =
    accuracyPercent >= 80
      ? { label: 'ممتاز', bg: 'bg-amber-300 text-emerald-900', icon: Award }
      : accuracyPercent >= 50
      ? { label: 'جيد', bg: 'bg-emerald-800/80 text-emerald-100 border border-emerald-700/60', icon: CheckCircle2 }
      : { label: 'يحتاج مراجعة', bg: 'bg-rose-800/80 text-rose-100 border border-rose-700/60', icon: RotateCcw };

  // ============================================================
  // الواجهة — ستايل RevisionPlans
  // ============================================================
  return (
    <div className="h-full flex flex-col bg-stone-100/60 overflow-hidden">
      {/* ═══════════ منطقة قابلة للتمرير ═══════════ */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 space-y-3">
          {/* ═══════════ إعداد الاختبار ═══════════ */}
          {phase === 'setup' && (
            <>
              {/* Hero */}
              <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm relative overflow-hidden">
                <div className="relative z-10 space-y-2">
                  <div className="inline-flex items-center gap-2 bg-emerald-800/80 border border-emerald-700/60 px-2.5 py-0.5 rounded-full text-[11px] text-amber-300 font-medium">
                    <Trophy className="w-3 h-3" />
                    <span>اختبار الحفظ من الذاكرة</span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold font-serif">اختبار حفظ سورة {surah.name}</h1>
                  <p className="text-[11px] sm:text-xs text-emerald-100/90 leading-relaxed">
                    اختبر حفظك لآيات محددة دون الاستعانة بالنص. سيقيّم النظام دقة الحفظ كلمة بكلمة ويقدم لك تقريرًا تفصيليًا.
                  </p>
                </div>
              </div>

              {/* بطاقة نطاق الاختبار */}
              <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                    <Target className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-stone-900">نطاق الاختبار</h2>
                    <p className="text-[10px] text-stone-500">حدد الآيات التي تريد اختبار حفظها</p>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-stone-700">من آية</label>
                      <input
                        type="number"
                        min={1}
                        max={surah.ayahs.length}
                        value={startAyah}
                        onChange={(e) => {
                          const v = Math.max(
                            1,
                            Math.min(surah.ayahs.length, Number(e.target.value) || 1),
                          );
                          setStartAyah(v);
                          if (v > endAyah) setEndAyah(v);
                        }}
                        className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-stone-700">إلى آية</label>
                      <input
                        type="number"
                        min={1}
                        max={surah.ayahs.length}
                        value={endAyah}
                        onChange={(e) => {
                          const v = Math.max(
                            1,
                            Math.min(surah.ayahs.length, Number(e.target.value) || 1),
                          );
                          setEndAyah(v);
                          if (v < startAyah) setStartAyah(v);
                        }}
                        className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                    <span className="text-[11px] font-medium text-emerald-900">عدد الآيات المختارة</span>
                    <span className="text-sm font-bold text-emerald-800">
                      {totalVersesInRange} <span className="text-[10px] font-normal text-emerald-700">/ {surah.ayahs.length}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* بطاقة طريقة الاختبار */}
              <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-stone-900">طريقة الاختبار</h2>
                    <p className="text-[10px] text-stone-500">اختر مستوى المساعدة أثناء التسميع</p>
                  </div>
                </div>

                <div className="p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setHintMode('blind')}
                      className={`p-3 rounded-xl border-2 transition text-center ${
                        hintMode === 'blind'
                          ? 'border-emerald-600 bg-emerald-50'
                          : 'border-stone-200 bg-white hover:border-stone-300'
                      }`}
                    >
                      <EyeOff
                        className={`w-5 h-5 mx-auto mb-1.5 ${
                          hintMode === 'blind' ? 'text-emerald-700' : 'text-stone-400'
                        }`}
                      />
                      <p className="text-xs font-bold text-stone-900">بدون مساعدة</p>
                      <p className="text-[10px] text-stone-500 mt-0.5">لا شيء يظهر</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHintMode('letter')}
                      className={`p-3 rounded-xl border-2 transition text-center ${
                        hintMode === 'letter'
                          ? 'border-emerald-600 bg-emerald-50'
                          : 'border-stone-200 bg-white hover:border-stone-300'
                      }`}
                    >
                      <Eye
                        className={`w-5 h-5 mx-auto mb-1.5 ${
                          hintMode === 'letter' ? 'text-emerald-700' : 'text-stone-400'
                        }`}
                      />
                      <p className="text-xs font-bold text-stone-900">أول حرف</p>
                      <p className="text-[10px] text-stone-500 mt-0.5">تلميح بسيط</p>
                    </button>
                  </div>
                </div>
              </div>

              {/* زر البدء */}
              <button
                type="button"
                onClick={() => void startTest()}
                className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-2xl text-sm shadow-md transition-colors flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                ابدأ الاختبار
              </button>
            </>
          )}

          {/* ═══════════ أثناء الاختبار ═══════════ */}
          {phase === 'testing' && (
            <>
              {/* Hero مع تقدم */}
              <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm relative overflow-hidden">
                <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 bg-emerald-800/80 border border-emerald-700/60 px-2.5 py-0.5 rounded-full text-[11px] text-amber-300 font-medium">
                      <CalendarClock className="w-3 h-3" />
                      <span>جارٍ الاختبار</span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold font-serif">
                      الآية {currentTestAyah}
                    </h1>
                    <p className="text-[11px] sm:text-xs text-emerald-100/90">
                      اختبار {completedCount + 1} من {totalVersesInRange} · النطاق {startAyah}–{endAyah}
                    </p>
                  </div>

                  <div className="flex flex-col items-start sm:items-end gap-1">
                    <span className="text-[10px] text-emerald-200/80">التقدم</span>
                    <span className="text-lg font-bold">
                      {Math.round((completedCount / totalVersesInRange) * 100)}%
                    </span>
                  </div>
                </div>

                {/* شريط التقدم */}
                <div className="mt-3 relative z-10">
                  <div className="w-full bg-emerald-950/50 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-amber-300 h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(
                          4,
                          Math.round((completedCount / totalVersesInRange) * 100),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* بطاقة التسميع */}
              <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                      <Trophy className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-stone-900">تسميع الآية {currentTestAyah}</h2>
                      <p className="text-[10px] text-stone-500">
                        {hintMode === 'blind' ? 'بدون مساعدة' : 'تلميح بأول حرف'} · {verseWords.length} كلمة
                      </p>
                    </div>
                  </div>
                  {isListening && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      يستمع...
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-4">
                  {/* نقاط التقدم */}
                  <div>
                    <p className="text-[11px] font-semibold text-stone-600 mb-2">تقدم الكلمات</p>
                    <div className="flex flex-wrap gap-1.5">
                      {verseWords.map((_, idx) => {
                        const isMatched = matchedWords.includes(idx);
                        const isFailed = idx in failedWordsRef.current;
                        const isCurrent = idx === currentWordIdx && !isAyahCompleted;
                        return (
                          <div
                            key={idx}
                            className={`w-2.5 h-2.5 rounded-full transition-all ${
                              isMatched
                                ? 'bg-emerald-500'
                                : isFailed
                                ? 'bg-rose-500'
                                : isCurrent
                                ? 'bg-amber-500 ring-2 ring-amber-300 scale-125'
                                : 'bg-stone-300'
                            }`}
                            title={`كلمة ${idx + 1}`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* عرض الحروف الأولى */}
                  {hintMode === 'letter' && (
                    <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
                      <p className="text-[11px] font-semibold text-stone-600 mb-2">التلميح</p>
                      <div className="text-center text-lg font-quran leading-loose flex flex-wrap gap-2 justify-center">
                        {verseWords.map((w, idx) => {
                          const isMatched = matchedWords.includes(idx);
                          const isFailed = idx in failedWordsRef.current;
                          const isCurrent = idx === currentWordIdx && !isAyahCompleted;
                          const firstLetter = w.original[0] || '';
                          return (
                            <span
                              key={idx}
                              className={`inline-block px-1 rounded transition-all ${
                                isFailed
                                  ? 'text-rose-500 line-through'
                                  : isMatched
                                  ? 'text-emerald-600'
                                  : isCurrent
                                  ? 'text-amber-600 font-bold ring-2 ring-amber-400'
                                  : 'text-stone-400'
                              }`}
                            >
                              {isMatched ? w.original : `${firstLetter}…`}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* مؤشر الكلمة الحالية */}
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                    <span className="text-[11px] font-medium text-emerald-900">الكلمة الحالية</span>
                    <span className="text-sm font-bold text-emerald-800">
                      {Math.min(currentWordIdx + 1, verseWords.length)}{' '}
                      <span className="text-[10px] font-normal text-emerald-700">
                        / {verseWords.length}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* زر الإنهاء */}
              <button
                type="button"
                onClick={() => void stopTest()}
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-2xl text-sm shadow-md transition-colors flex items-center justify-center gap-2"
              >
                <StopCircle className="w-4 h-4" />
                إنهاء الاختبار
              </button>
            </>
          )}

          {/* ═══════════ النتائج ═══════════ */}
          {phase === 'results' && (
            <>
              {/* Hero النتائج */}
              <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm relative overflow-hidden">
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-2">
                    <div className={`inline-flex items-center gap-2 ${scoreBadge.bg} px-2.5 py-0.5 rounded-full text-[11px] font-medium`}>
                      <scoreBadge.icon className="w-3 h-3" />
                      <span>{scoreBadge.label}</span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold font-serif">تقرير الاختبار</h1>
                    <p className="text-[11px] sm:text-xs text-emerald-100/90">
                      سورة {surah.name} · الآيات {startAyah}–{endAyah} · {durationStr}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <p className={`text-3xl font-bold ${accuracyPercent >= 50 ? 'text-amber-300' : 'text-rose-300'}`}>
                        {accuracyPercent}%
                      </p>
                      <p className="text-[10px] text-emerald-200/80">جودة الحفظ</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* بطاقات الإحصائيات */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-3 text-center">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-emerald-700">{perfectCount}</p>
                  <p className="text-[10px] text-stone-500">آية كاملة</p>
                </div>
                <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-3 text-center">
                  <Trophy className="w-4 h-4 text-stone-500 mx-auto mb-1" />
                  <p className="text-lg font-bold text-stone-800">
                    {completedCount}/{totalVersesInRange}
                  </p>
                  <p className="text-[10px] text-stone-500">مكتملة</p>
                </div>
                <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-3 text-center">
                  <Clock className="w-4 h-4 text-stone-500 mx-auto mb-1" />
                  <p className="text-lg font-bold text-stone-800">{durationStr}</p>
                  <p className="text-[10px] text-stone-500">الوقت</p>
                </div>
              </div>

              {/* تفاصيل النتائج */}
              <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-stone-100 text-stone-700">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-stone-900">تفاصيل النتائج</h2>
                    <p className="text-[10px] text-stone-500">
                      {completedCount} من {totalVersesInRange} آية مكتملة
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-stone-100">
                  {testResults.map((r) => (
                    <div key={r.ayahNumber} className="p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-stone-900">
                          الآية {r.ayahNumber}
                        </span>
                        {r.isFlawless ? (
                          <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            صحيحة
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] text-rose-700 font-semibold bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                            <XCircle className="w-3.5 h-3.5" />
                            {r.failedWords.length} خطأ
                          </span>
                        )}
                      </div>

                      {!r.isFlawless && r.failedWords.length > 0 && (
                        <div className="mt-2 bg-stone-50 border border-stone-100 rounded-xl p-2.5 space-y-1">
                          {r.failedWords.map((fw, i) => (
                            <div
                              key={i}
                              className="flex items-baseline gap-1.5 flex-wrap text-[11px]"
                            >
                              <span className="text-stone-500">الصحيح:</span>
                              <span className="font-bold text-emerald-700 font-quran">
                                {fw.expectedWord}
                              </span>
                              <span className="text-stone-400">·</span>
                              <span className="text-stone-500">سُمِع:</span>
                              <span className="text-rose-600 font-quran">{fw.recitedWord}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {completedCount < totalVersesInRange && (
                    <div className="p-3">
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900">
                        لم تُكمل {totalVersesInRange - completedCount} آية من أصل {totalVersesInRange}.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* أزرار التحكم */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={resetToSetup}
                  className="py-3 bg-white border border-stone-300 hover:border-emerald-600 text-stone-800 font-semibold rounded-2xl text-xs shadow-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-stone-500" />
                  إعدادات جديدة
                </button>
                <button
                  type="button"
                  onClick={retryTest}
                  className="py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-2xl text-xs shadow-md transition-colors flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  إعادة الاختبار
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};