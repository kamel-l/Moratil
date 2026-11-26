import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic, Trophy, RotateCcw, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  Settings, Play, Flag, Eye, Loader2, AlertTriangle, Keyboard,
  BookOpen, Target, Square, Radio,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Surah, Reciter, Riwaya, QuranChallenge } from '../types/quran';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { normalizeArabicText } from '../utils/arabicUtils';
import { recordVerseResult, addPointsAndVerses } from '../services/storageService';
import {
  alignRecitationWords,
  buildRecitationMistakes,
  type RecitationResultSummary,
} from '../services/recitationAssessment';
import {
  buildQuestions,
  computeCumulativeAccuracy,
  createAttemptFromTranscript,
  isPerfectAttempt,
  summarizeQuestions,
  RECITATION_MIN_SIMILARITY,
  type AttemptDraft,
  type TestQuestion,
} from '../services/memorizationTestLogic';

interface MemorizationTestProps {
  surah: Surah;
  selectedReciter: Reciter;
  onStatsUpdate: () => void;
  riwaya?: Riwaya;
  activeChallenge?: QuranChallenge | null;
  onChallengeResult?: (score: number, perfectAyahs: number) => void;
}

type Stage = 'idle' | 'running' | 'finished';
type TestMode = 'recitation' | 'next_ayah';
type HintMode = 'none' | 'first_word' | 'full';
type RecordingState = 'idle' | 'listening' | 'processing';

const RIWAYA_LABELS: Record<Riwaya, string> = {
  hafs: 'حفص عن عاصم',
  warsh: 'ورش عن نافع',
};

// ⏱️ إعدادات التوقيت
const CONTINUOUS_SILENCE_MS = 5000; // صمت قبل الانتقال التلقائي (وضع متواصل)
const NORMAL_SILENCE_MS = 8000;     // صمت قبل الإيقاف (وضع عادي)

const isNativePlatform = Capacitor.isNativePlatform();

export const MemorizationTest: React.FC<MemorizationTestProps> = ({
  surah, selectedReciter, onStatsUpdate, riwaya, activeChallenge, onChallengeResult,
}) => {
  const effectiveRiwaya: Riwaya = riwaya ?? selectedReciter.riwaya ?? 'hafs';

  // ── إعدادات الاختبار ──
  const [startAyah, setStartAyah] = useState(() =>
    activeChallenge ? Math.max(1, activeChallenge.ayahStart) : 1,
  );
  const [endAyah, setEndAyah] = useState(() =>
    activeChallenge
      ? Math.min(activeChallenge.ayahEnd, surah.ayahs.length)
      : Math.min(7, surah.ayahs.length),
  );
  const [hintMode, setHintMode] = useState<HintMode>('none');
  // ✅ جديد — التسميع المتواصل (افتراضي مفعّل)
  const [continuousMode, setContinuousMode] = useState(true);
  // تجاهل البسملة في أول آية من السور غير الفاتحة
  const [skipBasmalah, setSkipBasmalah] = useState(false);

  // ── حالة الجلسة ──
  const [stage, setStage] = useState<Stage>('idle');
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attempts, setAttempts] = useState<Record<number, AttemptDraft>>({});
  const [results, setResults] = useState<RecitationResultSummary | null>(null);

  // ── حالة التسجيل ──
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState('');

  // ── مراجع ──
  const shouldContinueRef = useRef(false);
  const segmentTranscriptRef = useRef('');    // التراكم النصي للآية الحالية
  const interimTextRef = useRef('');          // النص المؤقت (لم يُثبَّت بعد)
  const activeAyahRef = useRef(0);            // الآية التي نستمع لها حاليًا
  const isFinishingRef = useRef(false);       // حماية من الحفظ المزدوج عند الإنهاء
  const silenceTimerRef = useRef<number | null>(null);
  const secondsTimerRef = useRef<number | null>(null);
  const continuousModeRef = useRef(continuousMode);
  continuousModeRef.current = continuousMode;
  const questionsRef = useRef(questions);
  questionsRef.current = questions;

  const {
    isListening,
    isSupported: speechSupported,
    start: startSpeechService,
    stop: stopSpeechService,
  } = useSpeechRecognition({
    onRawTranscript: (text: string, isFinal: boolean) => {
      if (!isFinal) {
        interimTextRef.current = text;
        setLiveTranscript((segmentTranscriptRef.current + ' ' + text).trim());
        return;
      }

      segmentTranscriptRef.current = (segmentTranscriptRef.current + ' ' + text).trim();
      interimTextRef.current = '';
      setLiveTranscript(segmentTranscriptRef.current);
      resetSilenceTimer();

      if (continuousModeRef.current) {
        const q = questionsRef.current[activeAyahRef.current];
        if (q) {
          const words = segmentTranscriptRef.current
            .trim().split(/\s+/).map(normalizeArabicText).filter(Boolean);
          if (words.length >= q.normalized.length) {
            const { matchedExpected } = alignRecitationWords(q.normalized, words, {
              minSimilarity: RECITATION_MIN_SIMILARITY,
            });
            if (matchedExpected.size >= q.normalized.length) {
              advanceContinuousAyah();
            }
          }
        }
      }
    },
    shouldListen: () => shouldContinueRef.current,
    onUnavailable: () => {
      shouldContinueRef.current = false;
      isFinishingRef.current = false;
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (secondsTimerRef.current !== null) {
        clearInterval(secondsTimerRef.current);
        secondsTimerRef.current = null;
      }
      setRecordingSeconds(0);
      setError(
        isNativePlatform
          ? 'تعذر الوصول إلى الميكروفون. يرجى التأكد من منحه الإذن في إعدادات الهاتف.'
          : 'المتصفح لا يدعم التعرف على الصوت. استخدم Chrome أو Edge، أو اكتب تسميعك.'
      );
      setShowTextInput(true);
      setRecordingState('idle');
    },
  });

  const cleanupRecording = useCallback(() => {
    shouldContinueRef.current = false;
    isFinishingRef.current = false;
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (secondsTimerRef.current !== null) {
      clearInterval(secondsTimerRef.current);
      secondsTimerRef.current = null;
    }
    void stopSpeechService();
  }, [stopSpeechService]);

  // إعادة الضبط عند تغيير السورة أو التحدي
  useEffect(() => {
    setStartAyah(activeChallenge ? Math.max(1, activeChallenge.ayahStart) : 1);
    setEndAyah(
      activeChallenge
        ? Math.min(activeChallenge.ayahEnd, surah.ayahs.length)
        : Math.min(7, surah.ayahs.length),
    );
    setStage('idle');
    setQuestions([]);
    setCurrentIndex(0);
    setAttempts({});
    setResults(null);
    setRecordingState('idle');
    setLiveTranscript('');
    setError(null);
    activeAyahRef.current = 0;
    segmentTranscriptRef.current = '';
    interimTextRef.current = '';
    cleanupRecording();
  }, [surah.number, surah.ayahs.length, activeChallenge?.id, cleanupRecording]);

  useEffect(() => () => cleanupRecording(), [cleanupRecording]);

  // ══════════════════════════════════════════════════════════
  // منطق التسميع المتواصل
  // ══════════════════════════════════════════════════════════

  /** استخراج محاولة من النص المتراكم للآية الحالية */
  const buildAttemptFromCurrentSegment = (ayahIdx: number): AttemptDraft | null => {
    const q = questions[ayahIdx];
    if (!q) return null;
    const transcript = (segmentTranscriptRef.current + ' ' + interimTextRef.current).trim();
    return createAttemptFromTranscript(transcript, q, RECITATION_MIN_SIMILARITY);
  };

  /** يحفظ الآية الحالية في attempts ويعيد للآية التالية (يبقي الاستماع نشطًا) */
  const advanceContinuousAyah = () => {
    const ayahIdx = activeAyahRef.current;
    const attempt = buildAttemptFromCurrentSegment(ayahIdx);
    if (attempt) {
      setAttempts(prev => ({ ...prev, [ayahIdx]: attempt }));
    }

    segmentTranscriptRef.current = '';
    interimTextRef.current = '';
    setLiveTranscript('');

    const nextIdx = ayahIdx + 1;
    if (nextIdx >= questions.length) {
      // 🎉 أكمل كل الآيات — إيقاف تلقائي
      isFinishingRef.current = true;
      shouldContinueRef.current = false;
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      if (secondsTimerRef.current) { clearInterval(secondsTimerRef.current); secondsTimerRef.current = null; }
      void stopSpeechService();
      setRecordingState('idle');
      setRecordingSeconds(0);
    } else {
      activeAyahRef.current = nextIdx;
      setCurrentIndex(nextIdx);
      resetSilenceTimer();
    }
  };

  /** يحفظ الآية الحالية ثم يتوقف (ضغط "إيقاف" من المستخدم) */
  const finalizeCurrentOnStop = () => {
    const ayahIdx = activeAyahRef.current;
    const attempt = buildAttemptFromCurrentSegment(ayahIdx);
    if (attempt) {
      setAttempts(prev => ({ ...prev, [ayahIdx]: attempt }));
    }
    segmentTranscriptRef.current = '';
    interimTextRef.current = '';
    setLiveTranscript('');
    setRecordingState('idle');
    setRecordingSeconds(0);
  };

  const resetSilenceTimer = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    const ms = continuousModeRef.current ? CONTINUOUS_SILENCE_MS : NORMAL_SILENCE_MS;
    silenceTimerRef.current = window.setTimeout(() => {
      if (!shouldContinueRef.current) return;

      if (continuousModeRef.current) {
        const text = (segmentTranscriptRef.current + ' ' + interimTextRef.current).trim();
        if (text) {
          advanceContinuousAyah();
        } else {
          // صمت تام من البداية — لا نتقدم، ننتظر
          resetSilenceTimer();
        }
      } else {
        void stopRecording();
      }
    }, ms);
  };

  const stopRecording = useCallback(async () => {
    shouldContinueRef.current = false;
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (secondsTimerRef.current) { clearInterval(secondsTimerRef.current); secondsTimerRef.current = null; }
    setRecordingState('processing');

    try {
      await stopSpeechService();
    } catch {
      // Stopping is best-effort: the UI still has to leave the recording state.
    }

    if (isFinishingRef.current) {
      isFinishingRef.current = false;
      setRecordingState('idle');
      setRecordingSeconds(0);
      setLiveTranscript('');
      return;
    }

    if (continuousModeRef.current) {
      finalizeCurrentOnStop();
    } else {
      const transcript = (segmentTranscriptRef.current + ' ' + interimTextRef.current).trim();
      setRecordingState('idle');
      setRecordingSeconds(0);
      setLiveTranscript('');
      if (transcript) {
        const attempt = buildAttemptFromCurrentSegment(activeAyahRef.current);
        if (attempt) {
          setAttempts(prev => ({ ...prev, [activeAyahRef.current]: attempt }));
        }
      } else {
        setError('لم يُسمع شيء. حاول مرة أخرى أو اكتب تسميعك.');
      }
      segmentTranscriptRef.current = '';
      interimTextRef.current = '';
    }
  }, [stopSpeechService]);

  /** للتأكد من إيقاف التسجيل عند التنقل اليدوي (غير المتواصل) */
  useEffect(() => {
    if (shouldContinueRef.current) return;
    if (recordingState !== 'idle') void stopRecording();
    setShowTextInput(false);
    setTextInput('');
    setError(null);
  }, [currentIndex]);

  const startRecording = async () => {
    isFinishingRef.current = false;
    if (silenceTimerRef.current !== null) clearTimeout(silenceTimerRef.current);
    if (secondsTimerRef.current !== null) clearInterval(secondsTimerRef.current);
    setError(null);
    segmentTranscriptRef.current = '';
    interimTextRef.current = '';
    setLiveTranscript('');
    activeAyahRef.current = currentIndex;
    shouldContinueRef.current = true;
    setRecordingState('listening');
    setRecordingSeconds(0);
    if (secondsTimerRef.current) clearInterval(secondsTimerRef.current);
    secondsTimerRef.current = window.setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    resetSilenceTimer();

    try {
      await startSpeechService();
    } catch {
      cleanupRecording();
      setError('تعذر بدء التعرف على الصوت. يرجى المحاولة مرة أخرى.');
      setRecordingState('idle');
      setRecordingSeconds(0);
    }
  };

  // ══════════════════════════════════════════════════════════
  // إدخال يدوي
  // ══════════════════════════════════════════════════════════
  const submitText = () => {
    const text = textInput.trim();
    if (!text) return;
    segmentTranscriptRef.current = text;
    interimTextRef.current = '';
    const attempt = buildAttemptFromCurrentSegment(currentIndex);
    if (attempt) {
      setAttempts(prev => ({ ...prev, [currentIndex]: attempt }));
    }
    segmentTranscriptRef.current = '';
    setTextInput('');
    setShowTextInput(false);
    setError(null);
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

  // ══════════════════════════════════════════════════════════
  // تنقل / بدء / إنهاء
  // ══════════════════════════════════════════════════════════

  const goNext = () => {
    if (recordingState === 'listening') {
      // في المتواصل: انتقل يدويًا (احفظ الحالي، ابدأ التالي)
      advanceContinuousAyah();
    } else if (currentIndex < questions.length - 1) {
      setCurrentIndex(i => i + 1);
    }
  };
  const goPrev = () => {
    if (recordingState === 'listening') return; // لا نسمح بالرجوع أثناء الاستماع
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  };

  const startTest = () => {
    if (endAyah < startAyah) return;
    const qs = buildQuestions(surah, startAyah, endAyah, {
      skipOpeningBasmalah: skipBasmalah,
    });
    if (qs.length === 0) {
      setError('لا توجد آيات في النطاق المحدد.');
      return;
    }
    setQuestions(qs);
    setCurrentIndex(0);
    setAttempts({});
    setResults(null);
    setStage('running');
    setError(null);
    activeAyahRef.current = 0;
    segmentTranscriptRef.current = '';
    interimTextRef.current = '';
  };

  const finishTest = (override?: Record<number, AttemptDraft>) => {
    // إذا كنا نستمع، خذ لقطة من النص الحالي
    let data = override ?? attempts;
    if (recordingState === 'listening') {
      const lastAttempt = buildAttemptFromCurrentSegment(activeAyahRef.current);
      if (lastAttempt) {
        data = { ...data, [activeAyahRef.current]: lastAttempt };
      }
      // أوقف التسجيل
      isFinishingRef.current = true;
      shouldContinueRef.current = false;
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      if (secondsTimerRef.current) { clearInterval(secondsTimerRef.current); secondsTimerRef.current = null; }
      void stopSpeechService();
      setRecordingState('idle');
      setRecordingSeconds(0);
    }

    // احفظ نتائج الآيات في نظام التكرار المتباعد
    questions.forEach((q, idx) => {
      const a = data[idx];
      if (a && !a.revealed) {
        recordVerseResult(
          surah.number,
          q.ayah.numberInSurah,
          isPerfectAttempt(q, a),
          buildRecitationMistakes(q.words, a),
          effectiveRiwaya,
        );
      }
    });

    const computed = summarizeQuestions(questions, data);
    setAttempts(data);
    setResults(computed);

    if (activeChallenge && onChallengeResult) {
      onChallengeResult(computed.accuracy, computed.perfectAyahs);
    }

    addPointsAndVerses(
      Math.round(computed.perfectAyahs * 20 + computed.matchedWords * 2),
      computed.perfectAyahs, computed.accuracy, computed.accuracy,
    );
    onStatsUpdate();
    setStage('finished');
  };

  // ✅ إنهاء تلقائي بعد إكمال كل الآيات في الوضع المتواصل
  useEffect(() => {
    if (!continuousMode) return;
    if (stage !== 'running') return;
    if (recordingState !== 'idle') return;
    if (questions.length === 0) return;
    const allDone = questions.every((_, i) => attempts[i]);
    if (!allDone) return;
    const t = window.setTimeout(() => finishTest(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempts, recordingState, stage, questions.length, continuousMode]);

  const resetTest = () => {
    cleanupRecording();
    setStage('idle');
    setQuestions([]); setCurrentIndex(0); setAttempts({}); setResults(null);
    setRecordingState('idle'); setLiveTranscript(''); setError(null);
    activeAyahRef.current = 0;
    segmentTranscriptRef.current = '';
    interimTextRef.current = '';
  };

  // ── مشتقات ──
  const currentQ = questions[currentIndex];
  const currentAttempt = attempts[currentIndex];
  const maxAyah = surah.ayahs.length;
  const answeredCount = Object.keys(attempts).length;

  const cumulative = useMemo(
    () => computeCumulativeAccuracy(questions, attempts),
    [attempts, questions],
  );

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-stone-50 to-stone-100">

      {/* شريط علوي: تقدم + حالة الاستماع */}
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

          {/* 🔴 مؤشر التسميع المتواصل */}
          {recordingState === 'listening' && continuousMode && (
            <div className="border-t border-rose-100 bg-rose-50 px-3 sm:px-4 py-1.5 flex items-center justify-center gap-2 text-[11px] font-bold text-rose-800">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>التسميع المتواصل نشط — سمّع الآيات بالتتابع دون توقف</span>
            </div>
          )}
        </div>
      )}

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
              </div>

              {activeChallenge && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-bold flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5" /> تحدي: {activeChallenge.title}
                  </p>
                  <p className="mt-1 text-amber-800/80">
                    النطاق محدد مسبقًا. أكمل التسميع لتُسجّل نتيجتك.
                  </p>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-xs font-semibold text-stone-700">
                  من الآية
                  <input
                    type="number" min={1} max={maxAyah} value={startAyah}
                    disabled={!!activeChallenge}
                    onChange={e => {
                      const v = Math.min(maxAyah, Math.max(1, Number(e.target.value)));
                      setStartAyah(v);
                      setEndAyah(prev => Math.max(prev, v));
                    }}
                    className="min-h-11 w-full rounded-xl border border-stone-300 px-3 text-sm disabled:bg-stone-100"
                  />
                </label>
                <label className="space-y-2 text-xs font-semibold text-stone-700">
                  إلى الآية
                  <input
                    type="number" min={startAyah} max={maxAyah} value={endAyah}
                    disabled={!!activeChallenge}
                    onChange={e => setEndAyah(Math.min(maxAyah, Math.max(startAyah, Number(e.target.value))))}
                    className="min-h-11 w-full rounded-xl border border-stone-300 px-3 text-sm disabled:bg-stone-100"
                  />
                </label>
              </div>

              {/* ✅ خيار التسميع المتواصل */}
              <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-stone-200 bg-stone-50/60 p-3 hover:bg-stone-50 transition-colors">
                <input
                  type="checkbox"
                  checked={continuousMode}
                  onChange={e => setContinuousMode(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-emerald-700 shrink-0"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-emerald-700" />
                    التسميع المتواصل
                  </span>
                  <span className="text-[10px] text-stone-500 leading-5 block">
                    استمع مرة واحدة فقط. ينتقل التطبيق تلقائيًا بين الآيات عند إتمام كل آية (مطابقة كاملة أو صمت قصير) دون الحاجة لضغط الميكروفون مجددًا.
                  </span>
                </div>
              </label>

              {/* تجاهل البسملة في أول السورة */}
              <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-stone-200 bg-stone-50/60 p-3 hover:bg-stone-50 transition-colors">
                <input
                  type="checkbox"
                  checked={skipBasmalah}
                  onChange={e => setSkipBasmalah(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-emerald-700 shrink-0"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-700" />
                    تجاهل البسملة في أول السورة
                  </span>
                  <span className="text-[10px] text-stone-500 leading-5 block">
                    لا تُحتسب البسملة في أول آية من السور غير الفاتحة؛ البسملة في الفاتحة جزء من التسميع دائمًا.
                  </span>
                </div>
              </label>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-stone-700">المساعدة البصرية</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['none', 'بدون'],
                    ['first_word', 'الكلمة الأولى'],
                    ['full', 'كاملة'],
                  ] as const).map(([key, label]) => (
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
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600 flex items-start gap-2">
                <BookOpen className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-6">
                  النطاق: الآيات {startAyah}–{endAyah} ({endAyah - startAyah + 1} آية) · الرواية{' '}
                  {RIWAYA_LABELS[effectiveRiwaya]}
                </span>
              </div>

              {!speechSupported && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{isNativePlatform ? 'خدمة التعرف على الصوت غير متوفرة على هذا الجهاز. يمكنك كتابة تسميعك يدويًا.' : 'متصفحك لا يدعم التعرف على الصوت. استخدم Chrome أو Edge، أو اكتب تسميعك يدويًا.'}</span>
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
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-stone-100 flex items-center justify-between bg-stone-50/60">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md text-white text-[11px] font-bold tabular-nums px-1.5 ${
                      recordingState === 'listening' && continuousMode ? 'bg-rose-600 animate-pulse' : 'bg-emerald-700'
                    }`}>
                      {currentQ.ayah.numberInSurah}
                    </span>
                    <span className="text-[11px] text-stone-500 font-semibold">
                      آية {currentIndex + 1} من {questions.length}
                    </span>
                    {recordingState === 'listening' && continuousMode && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700">
                        <Radio className="w-3 h-3 animate-pulse" />
                        يستمع...
                      </span>
                    )}
                  </div>

                <div className="px-4 py-6">
                  {/* الانتظار / التلميح */}
                  {!currentAttempt && recordingState === 'idle' && (
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
                        <div dir="rtl" className="font-quran text-2xl leading-[2] text-stone-800">
                          {currentQ.words.join(' ')}
                        </div>
                      )}
                    </div>

                  {/* 🔴 الاستماع */}
                  {recordingState === 'listening' && (
                    <div className="space-y-4">
                      <div className="flex justify-center">
                        <div className="relative inline-flex h-20 w-20 items-center justify-center rounded-full bg-rose-100">
                          <span className="absolute inset-0 rounded-full bg-rose-200 animate-ping opacity-60" />
                          <Mic className="w-9 h-9 text-rose-700 relative" />
                        </div>
                      </div>
                      <div className="text-center text-xs font-semibold text-rose-700">
                        {continuousMode ? 'يستمع (متواصل)' : 'يستمع...'} {formatTime(recordingSeconds)}
                      </div>

                      {/* تلميح الوضع المتواصل */}
                      {continuousMode && (
                        <p className="text-center text-[10px] text-stone-400">
                          سيُنتقل تلقائيًا عند إتمام الآية — لا حاجة لضغط إيقاف
                        </p>
                      )}

                      {liveTranscript && (
                        <div dir="rtl" className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-sm text-stone-800 font-quran text-center min-h-12">
                          {liveTranscript}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={goPrev}
                        disabled={currentIndex === 0}
                        className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-40"
                      >
                        <Square className="w-4 h-4" /> إيقاف
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
                  )}

                  {/* المعالجة */}
                  {recordingState === 'processing' && (
                    <div className="flex flex-col items-center gap-3 py-4">
                      <Loader2 className="w-8 h-8 text-emerald-700 animate-spin" />
                      <p className="text-xs text-stone-500 font-semibold">جاري المقارنة...</p>
                    </div>
                  )}

                  {/* نتيجة المحاولة */}
                  {currentAttempt && (
                    <div className="space-y-4">
                      <div dir="rtl" className="font-quran text-2xl sm:text-3xl leading-[2.2] text-center flex flex-wrap gap-x-2 gap-y-2 justify-center">
                        {currentQ.words.map((w, idx) => {
                          const matched = currentAttempt.matched.has(idx);
                          const close = currentAttempt.closeWords?.has(idx);
                          if (currentAttempt.revealed) {
                            return <span key={idx} className="text-stone-800">{w}</span>;
                          }
                          return (
                            <span key={idx} className={matched
                              ? close
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                              : 'text-rose-600 underline decoration-rose-400 decoration-2 underline-offset-4'}>
                              {w}
                            </span>
                          );
                        })}
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

                      {!currentAttempt.revealed &&
                        currentAttempt.matched.size < currentQ.normalized.length && (
                          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs">
                            <span className="font-semibold text-rose-800">كلمات تحتاج مراجعة: </span>
                            <span className="font-quran text-base text-rose-700">
                              {currentQ.words
                                .filter((_, index) => !currentAttempt.matched.has(index))
                                .join(' ')}
                            </span>
                          </div>
                        )}

                      {!currentAttempt.revealed &&
                        (currentAttempt.closeWords?.size ?? 0) > 0 && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-xs">
                            <span className="font-semibold text-amber-800">كلمات قريبة من الصحة (راجع تلفظها): </span>
                            <span className="font-quran text-base text-amber-700">
                              {currentQ.words
                                .filter((_, index) => currentAttempt.closeWords?.has(index))
                                .join(' ')}
                            </span>
                          </div>
                        )}

                      {currentAttempt.extraWords.length > 0 && !currentAttempt.revealed && (
                        <div dir="rtl" className="text-xs text-stone-500 text-center">
                          <span className="font-semibold">كلمات إضافية: </span>
                          <span className="text-amber-700 font-quran">{currentAttempt.extraWords.join(' ')}</span>
                        </div>
                      )}

                      {!currentAttempt.revealed && (
                        <div className="text-center">
                          <span className={`text-3xl font-bold tabular-nums ${
                            currentAttempt.accuracy >= 85 ? 'text-emerald-700'
                            : currentAttempt.accuracy >= 50 ? 'text-amber-700'
                            : 'text-rose-700'
                          }`}>{currentAttempt.accuracy}%</span>
                          <p className="text-[11px] text-stone-500 mt-1">
                            {currentAttempt.matched.size} من {currentQ.normalized.length} كلمة صحيحة
                          </p>
                        </div>
                      )}

                      {/* المعالجة */}
                      {recordingState === 'processing' && (
                        <div className="flex flex-col items-center gap-3 py-4">
                          <Loader2 className="w-8 h-8 text-emerald-700 animate-spin" />
                          <p className="text-xs text-stone-500 font-semibold">جاري المقارنة...</p>
                        </div>
                      )}

                      {currentAttempt.transcript && !currentAttempt.revealed && (
                        <div dir="rtl" className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-xs text-stone-600 font-quran text-center">
                          <span className="text-[10px] font-sans font-bold text-stone-400 block mb-1">ما سُمِع</span>
                          {currentAttempt.transcript}
                        </div>
                      )}

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

                  {!currentAttempt && recordingState === 'idle' && (
                    <div className="pt-4 text-center">
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
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* زر الميكروفون */}
              {recordingState === 'idle' && !currentAttempt && (
                <div className="flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={startRecording}
                    className="inline-flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-lg shadow-emerald-900/20 hover:shadow-xl active:scale-95 transition-all"
                    aria-label={continuousMode ? 'ابدأ التسميع المتواصل' : 'ابدأ التسميع'}
                  >
                    <Mic className="w-11 h-11" />
                  </button>
                  <p className="text-xs font-semibold text-stone-600">
                    {continuousMode ? 'اضغط لبدء التسميع المتواصل' : 'اضغط للتسميع'}
                  </p>
                  {!showTextInput && (
                    <button
                      type="button"
                      onClick={() => setShowTextInput(true)}
                      className="inline-flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-700"
                    >
                      <Keyboard className="w-3 h-3" /> أو اكتب تسميعك
                    </button>
                  )}

              {/* إدخال يدوي */}
              {showTextInput && !currentAttempt && recordingState === 'idle' && (
                <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 space-y-2">
                  <textarea
                    dir="rtl"
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    placeholder="اكتب تسميعك هنا..."
                    className="w-full min-h-24 rounded-xl border border-stone-300 p-3 text-sm font-quran resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    lang="ar"
                  />
                  <div className="flex gap-2">
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

              {/* تنقل (معطّل أثناء الاستماع المتواصل) */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={currentIndex === 0 || recordingState === 'listening'}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" /> السابق
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={
                    (currentIndex === questions.length - 1 && recordingState !== 'listening') ||
                    (recordingState === 'listening' && !continuousMode)
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-30"
                >
                  التالي <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* ════════ FINISHED ════════ */}
          {stage === 'finished' && results && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 text-center space-y-4">
                <div className={`inline-flex h-20 w-20 items-center justify-center rounded-full ${
                  results.accuracy >= 80 ? 'bg-emerald-100 text-emerald-700'
                  : results.accuracy >= 50 ? 'bg-amber-100 text-amber-700'
                  : 'bg-rose-100 text-rose-700'
                }`}>
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
                  {activeChallenge && (
                    <p className="text-xs text-emerald-700 font-semibold mt-2">
                      ✓ تم تسجيل نتيجتك في التحدي
                    </p>
                  )}
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

              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700 pb-1">
                  <BookOpen className="w-4 h-4 text-stone-400" /> تفصيل الآيات
                </div>
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {questions.map((q, i) => {
                    const a = attempts[i];
                    const total = q.normalized.length;
                    const matched = a?.matched.size ?? 0;
                    const perfect = isPerfectAttempt(q, a);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setCurrentIndex(i);
                          setStage('running');
                        }}
                        aria-label={`مراجعة الآية ${q.ayah.numberInSurah}`}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-right transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                          !a ? 'border-stone-200 bg-stone-50/60'
                            : perfect ? 'border-emerald-200 bg-emerald-50/60'
                            : 'border-rose-200 bg-rose-50/60'
                        }`}
                      >
                        <span className="text-xs font-semibold text-stone-700">
                          {testMode === 'next_ayah'
                            ? `بعد الآية ${q.ayah.numberInSurah.toLocaleString('ar-EG')}`
                            : `الآية ${q.ayah.numberInSurah.toLocaleString('ar-EG')}`}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold tabular-nums ${
                          !a ? 'text-stone-400' : perfect ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                          {!a ? 'لم تُسمَّع'
                            : a.revealed ? 'مكشوفة'
                            : perfect ? <><CheckCircle2 className="w-3.5 h-3.5" /> {matched}/{total}</>
                            : <><XCircle className="w-3.5 h-3.5" /> {matched}/{total}</>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* الشريط السفلي */}
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
                {recordingState === 'listening' && continuousMode && (
                  <span className="text-rose-600"> · متواصل</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => finishTest()}
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
                  setQuestions(questions);
                  setCurrentIndex(0);
                  setAttempts({});
                  setResults(null);
                  setStage('running');
                  segmentTranscriptRef.current = '';
                  interimTextRef.current = '';
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
