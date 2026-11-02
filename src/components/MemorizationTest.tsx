import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic, Trophy, RotateCcw, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  Settings, Play, Flag, Eye, Loader2, AlertTriangle, Keyboard,
  BookOpen, Target, Square, Radio,
} from 'lucide-react';
import { Surah, Reciter, Riwaya, Ayah, QuranChallenge } from '../types/quran';
import { extractWords } from '../utils/arabicUtils';
import { recordVerseResult, addPointsAndVerses } from '../services/storageService';

interface MemorizationTestProps {
  surah: Surah;
  selectedReciter: Reciter;
  onStatsUpdate: () => void;
  riwaya?: Riwaya;
  activeChallenge?: QuranChallenge | null;
  onChallengeResult?: (score: number, perfectAyahs: number) => void;
}

type Stage = 'idle' | 'running' | 'finished';
type HintMode = 'none' | 'first_word' | 'full';
type RecordingState = 'idle' | 'listening' | 'processing';

interface Question {
  ayah: Ayah;
  words: string[];
  normalized: string[];
}

interface AyahAttempt {
  transcript: string;
  matched: Set<number>;
  extraWords: string[];
  accuracy: number;
  revealed: boolean;
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

// ⏱️ إعدادات التوقيت
const CONTINUOUS_SILENCE_MS = 3500; // صمت قبل الانتقال التلقائي (وضع متواصل)
const NORMAL_SILENCE_MS = 4000;     // صمت قبل الإيقاف (وضع عادي)

function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\u0621-\u064A\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function alignLCS(expected: string[], recognized: string[]) {
  const m = expected.length, n = recognized.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = expected[i - 1] === recognized[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const matchedE = new Set<number>();
  const matchedR = new Set<number>();
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (expected[i - 1] === recognized[j - 1]) {
      matchedE.add(i - 1); matchedR.add(j - 1); i--; j--;
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
  surah, selectedReciter, onStatsUpdate, riwaya, activeChallenge, onChallengeResult,
}) => {
  const effectiveRiwaya: Riwaya = riwaya ?? selectedReciter.riwaya ?? 'hafs';
  const speechSupported = useMemo(() => !!getSpeechRecognition(), []);

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

  // ── حالة الجلسة ──
  const [stage, setStage] = useState<Stage>('idle');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attempts, setAttempts] = useState<Record<number, AyahAttempt>>({});
  const [results, setResults] = useState<OverallResults | null>(null);

  // ── حالة التسجيل ──
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState('');

  // ── مراجع ──
  const recognitionRef = useRef<any>(null);
  const shouldContinueRef = useRef(false);
  const segmentTranscriptRef = useRef('');    // التراكم النصي للآية الحالية
  const interimTextRef = useRef('');          // النص المؤقت (لم يُثبَّت بعد)
  const activeAyahRef = useRef(0);            // الآية التي نستمع لها حاليًا
  const isFinishingRef = useRef(false);       // حماية من الحفظ المزدوج عند الإنهاء
  const silenceTimerRef = useRef<number | null>(null);
  const secondsTimerRef = useRef<number | null>(null);

  const cleanupRecording = useCallback(() => {
    shouldContinueRef.current = false;
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (secondsTimerRef.current) { clearInterval(secondsTimerRef.current); secondsTimerRef.current = null; }
    try { recognitionRef.current?.abort?.(); } catch {}
  }, []);

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
    segmentTranscriptRef.current = '';
    interimTextRef.current = '';
    cleanupRecording();
  }, [surah.number, surah.ayahs.length, activeChallenge?.id, cleanupRecording]);

  useEffect(() => () => cleanupRecording(), [cleanupRecording]);

  // ══════════════════════════════════════════════════════════
  // منطق التسميع المتواصل
  // ══════════════════════════════════════════════════════════

  /** استخراج محاولة من النص المتراكم للآية الحالية */
  const buildAttemptFromCurrentSegment = (ayahIdx: number): AyahAttempt | null => {
    const q = questions[ayahIdx];
    if (!q) return null;
    const transcript = (segmentTranscriptRef.current + ' ' + interimTextRef.current).trim();
    if (!transcript) return null;

    const recognized = transcript.split(/\s+/).map(normalizeArabic).filter(Boolean);
    const { matchedE, matchedR } = alignLCS(q.normalized, recognized);
    const extraWords = recognized.filter((_, i) => !matchedR.has(i));
    const accuracy = q.normalized.length > 0
      ? Math.round((matchedE.size / q.normalized.length) * 100) : 0;

    return { transcript, matched: matchedE, extraWords, accuracy, revealed: false };
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
      try { recognitionRef.current?.stop(); } catch {}
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
    const ms = continuousMode ? CONTINUOUS_SILENCE_MS : NORMAL_SILENCE_MS;
    silenceTimerRef.current = window.setTimeout(() => {
      if (!shouldContinueRef.current) return;

      if (continuousMode) {
        const text = (segmentTranscriptRef.current + ' ' + interimTextRef.current).trim();
        if (text) {
          advanceContinuousAyah();
        } else {
          // صمت تام من البداية — لا نتقدم، ننتظر
          resetSilenceTimer();
        }
      } else {
        stopRecording();
      }
    }, ms);
  };

  const stopRecording = () => {
    shouldContinueRef.current = false;
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (secondsTimerRef.current) { clearInterval(secondsTimerRef.current); secondsTimerRef.current = null; }
    setRecordingState('processing');
    try { recognitionRef.current?.stop(); } catch {}
  };

  /** للتأكد من إيقاف التسجيل عند التنقل اليدوي (غير المتواصل) */
  useEffect(() => {
    if (shouldContinueRef.current) return; // نستمع متواصلًا — لا نوقف
    if (recordingState !== 'idle') stopRecording();
    setShowTextInput(false);
    setTextInput('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // ══════════════════════════════════════════════════════════
  // بدء التسجيل
  // ══════════════════════════════════════════════════════════

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

      segmentTranscriptRef.current = '';
      interimTextRef.current = '';
      setLiveTranscript('');
      activeAyahRef.current = currentIndex;

      recognition.onresult = (event: any) => {
        let interim = '';
        let gotFinal = false;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            segmentTranscriptRef.current += ' ' + t;
            gotFinal = true;
          } else {
            interim += ' ' + t;
          }
        }
        interimTextRef.current = interim;
        setLiveTranscript((segmentTranscriptRef.current + ' ' + interim).trim());
        resetSilenceTimer();

        // 🚀 في الوضع المتواصل: إذا طابق 100% → انتقال فوري
        if (continuousMode && gotFinal) {
          const q = questions[activeAyahRef.current];
          if (q) {
            const words = segmentTranscriptRef.current
              .trim().split(/\s+/).map(normalizeArabic).filter(Boolean);
            if (words.length >= q.normalized.length) {
              const { matchedE } = alignLCS(q.normalized, words);
              if (matchedE.size >= q.normalized.length) {
                advanceContinuousAyah();
              }
            }
          }
        }
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
          // المتصفح أنهى الجلسة من تلقاء نفسه — أعد التشغيل للحفاظ على الاستمرارية
          try { recognition.start(); } catch {}
          return;
        }
        if (isFinishingRef.current) {
          isFinishingRef.current = false;
          return; // تمت المعالجة بالفعل في advanceContinuousAyah
        }
        if (continuousMode) {
          finalizeCurrentOnStop();
        } else {
          // الوضع العادي: احفظ ثم توقف
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
      };

      recognitionRef.current = recognition;
      shouldContinueRef.current = true;
      recognition.start();

      setRecordingState('listening');
      setRecordingSeconds(0);
      secondsTimerRef.current = window.setInterval(() => setRecordingSeconds(s => s + 1), 1000);
      resetSilenceTimer();
    } catch {
      setError('تعذر بدء التعرف على الصوت. حاول مرة أخرى.');
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
    setAttempts(prev => ({
      ...prev,
      [currentIndex]: {
        transcript: '', matched: new Set(), extraWords: [], accuracy: 0, revealed: true,
      },
    }));
  };

  const retryAttempt = () => {
    setAttempts(prev => {
      const copy = { ...prev }; delete copy[currentIndex]; return copy;
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
    const qs = surah.ayahs
      .filter(a => a.numberInSurah >= startAyah && a.numberInSurah <= endAyah)
      .map(ayah => {
        const words = extractWords(ayah.text).map(w => w.original);
        return { ayah, words, normalized: words.map(normalizeArabic) };
      });
    setQuestions(qs);
    setCurrentIndex(0);
    setAttempts({});
    setResults(null);
    setStage('running');
    setError(null);
    segmentTranscriptRef.current = '';
    interimTextRef.current = '';
  };

  const computeResults = (data: Record<number, AyahAttempt>): OverallResults => {
    let perfectAyahs = 0, matchedWords = 0, totalWords = 0, attemptedAyahs = 0;
    questions.forEach((q, idx) => {
      const a = data[idx];
      const total = q.normalized.length;
      totalWords += total;
      if (a) {
        attemptedAyahs++;
        matchedWords += a.matched.size;
        if (!a.revealed && a.matched.size === total) perfectAyahs++;
      }
    });
    const accuracy = totalWords > 0 ? Math.round((matchedWords / totalWords) * 100) : 0;
    return { totalAyahs: questions.length, attemptedAyahs, perfectAyahs, totalWords, matchedWords, accuracy };
  };

  const finishTest = (override?: Record<number, AyahAttempt>) => {
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
      try { recognitionRef.current?.stop(); } catch {}
      setRecordingState('idle');
      setRecordingSeconds(0);
    }

    // احفظ نتائج الآيات في نظام التكرار المتباعد
    questions.forEach((q, idx) => {
      const a = data[idx];
      if (a) {
        recordVerseResult(surah.number, q.ayah.numberInSurah, a.matched.size === q.normalized.length, []);
      }
    });

    const computed = computeResults(data);
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
    segmentTranscriptRef.current = '';
    interimTextRef.current = '';
  };

  // ── مشتقات ──
  const currentQ = questions[currentIndex];
  const currentAttempt = attempts[currentIndex];
  const maxAyah = surah.ayahs.length;
  const answeredCount = Object.keys(attempts).length;

  const cumulative = useMemo(() => {
    let m = 0, t = 0;
    questions.forEach((q, i) => {
      const a = attempts[i];
      if (a) { m += a.matched.size; t += q.normalized.length; }
    });
    return t > 0 ? Math.round((m / t) * 100) : 0;
  }, [attempts, questions]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-stone-50 to-stone-100">

      {/* شريط علوي: تقدم + حالة الاستماع */}
      {stage === 'running' && currentQ && (
        <div className="shrink-0 bg-white border-b border-stone-200">
          <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3">
            <div className="flex items-center justify-between text-xs font-semibold text-stone-600 mb-2">
              <span className="inline-flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-emerald-700" />
                الآية {currentQ.ayah.numberInSurah}
              </span>
              <span className="tabular-nums">
                {answeredCount}/{questions.length} · دقة {cumulative}%
              </span>
            </div>
            <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-l from-emerald-500 to-emerald-700 transition-all duration-300"
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
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 space-y-4">

          {/* ════════ IDLE ════════ */}
          {stage === 'idle' && (
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 space-y-5">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                  <Mic className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="font-bold text-stone-900 leading-tight">اختبار الحفظ الصوتي</h2>
                  <p className="text-[11px] text-stone-500">سمّع الآيات بصوتك ودع التطبيق يقيّم</p>
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
                      {label}
                    </button>
                  ))}
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
                  <span>متصفحك لا يدعم التعرف على الصوت. استخدم Chrome أو Edge، أو اكتب تسميعك يدويًا.</span>
                </div>
              )}
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
                  {currentAttempt && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      currentAttempt.revealed
                        ? 'bg-stone-100 text-stone-600'
                        : currentAttempt.accuracy >= 85
                        ? 'bg-emerald-100 text-emerald-800'
                        : currentAttempt.accuracy >= 50
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      {currentAttempt.revealed
                        ? <><Eye className="w-3 h-3" /> مكشوفة</>
                        : <><CheckCircle2 className="w-3 h-3" /> {currentAttempt.accuracy}%</>}
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
                  )}

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
                        onClick={stopRecording}
                        className="w-full inline-flex items-center justify-center gap-2 min-h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm"
                      >
                        <Square className="w-4 h-4" /> إيقاف
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

                  {/* نتيجة المحاولة */}
                  {currentAttempt && (
                    <div className="space-y-4">
                      <div dir="rtl" className="font-quran text-2xl sm:text-3xl leading-[2.2] text-center flex flex-wrap gap-x-2 gap-y-2 justify-center">
                        {currentQ.words.map((w, idx) => {
                          const matched = currentAttempt.matched.has(idx);
                          if (currentAttempt.revealed) {
                            return <span key={idx} className="text-stone-800">{w}</span>;
                          }
                          return (
                            <span key={idx} className={matched
                              ? 'text-emerald-700'
                              : 'text-rose-600 underline decoration-rose-400 decoration-2 underline-offset-4'}>
                              {w}
                            </span>
                          );
                        })}
                      </div>

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

                      {currentAttempt.revealed && (
                        <p className="text-center text-xs text-stone-500">
                          تم كشف الآية — لن تُحتسب ضمن النتيجة
                        </p>
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
                            onClick={goNext}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 text-xs font-bold"
                          >
                            الآية التالية <ChevronLeft className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

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
                </div>
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
                      onClick={() => { setShowTextInput(false); setTextInput(''); }}
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
                    {results.accuracy >= 80 ? 'ما شاء الله — ممتاز'
                      : results.accuracy >= 50 ? 'جيد — واصل المراجعة'
                      : 'يحتاج مراجعة'}
                  </h2>
                  <p className="text-sm text-stone-500 mt-1">
                    {results.perfectAyahs} من {results.totalAyahs} آية كاملة
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
                    <p className="text-2xl font-bold text-emerald-900 tabular-nums">{results.accuracy}%</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                    <p className="text-[10px] text-amber-700 font-bold">كلمات</p>
                    <p className="text-2xl font-bold text-amber-900 tabular-nums">
                      {results.matchedWords}/{results.totalWords}
                    </p>
                  </div>
                  <div className="rounded-xl bg-stone-50 border border-stone-200 p-3">
                    <p className="text-[10px] text-stone-700 font-bold">آيات</p>
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
                    const perfect = !!a && !a.revealed && matched === total;
                    return (
                      <div key={i} className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                        !a ? 'border-stone-200 bg-stone-50/60'
                          : perfect ? 'border-emerald-200 bg-emerald-50/60'
                          : 'border-rose-200 bg-rose-50/60'
                      }`}>
                        <span className="text-xs font-semibold text-stone-700">
                          الآية {q.ayah.numberInSurah}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold tabular-nums ${
                          !a ? 'text-stone-400' : perfect ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                          {!a ? 'لم تُسمَّع'
                            : a.revealed ? 'مكشوفة'
                            : perfect ? <><CheckCircle2 className="w-3.5 h-3.5" /> {matched}/{total}</>
                            : <><XCircle className="w-3.5 h-3.5" /> {matched}/{total}</>}
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

      {/* الشريط السفلي */}
      <div className="shrink-0 bg-white border-t border-stone-200 shadow-lg">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-2 flex items-center justify-between gap-2">
          {stage === 'idle' && (
            <button
              type="button"
              onClick={startTest}
              disabled={endAyah < startAyah}
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