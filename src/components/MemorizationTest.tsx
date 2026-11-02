import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic, MicOff, Trophy, RotateCcw, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  Sparkles, Settings, Play, Flag, Eye, Loader2, AlertTriangle, Keyboard,
  BookOpen, Target, Square,
} from 'lucide-react';
import { Surah, Reciter, Riwaya, Ayah } from '../types/quran';
import { extractWords } from '../utils/arabicUtils';
import { recordVerseResult, addPointsAndVerses } from '../services/storageService';

interface MemorizationTestProps {
  surah: Surah;
  selectedReciter: Reciter;
  onStatsUpdate: () => void;
  riwaya?: Riwaya;
}

type Stage = 'idle' | 'running' | 'finished';
type HintMode = 'none' | 'first_word' | 'full';
type RecordingState = 'idle' | 'listening' | 'processing';

interface Question {
  ayah: Ayah;
  words: string[];        // الأصلية بالتشكيل (للعرض)
  normalized: string[];   // بدون تشكيل (للمقارنة)
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
  surah, selectedReciter, onStatsUpdate, riwaya,
}) => {
  const effectiveRiwaya: Riwaya = riwaya ?? selectedReciter.riwaya ?? 'hafs';
  const speechSupported = useMemo(() => !!getSpeechRecognition(), []);

  // ─── الإعدادات ───
  const [startAyah, setStartAyah] = useState(1);
  const [endAyah, setEndAyah] = useState(Math.min(7, surah.ayahs.length));
  const [hintMode, setHintMode] = useState<HintMode>('none');

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
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (secondsTimerRef.current) { clearInterval(secondsTimerRef.current); secondsTimerRef.current = null; }
    try { recognitionRef.current?.abort?.(); } catch {}
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
  const buildQuestions = (): Question[] =>
    surah.ayahs
      .filter(a => a.numberInSurah >= startAyah && a.numberInSurah <= endAyah)
      .map(ayah => {
        const words = extractWords(ayah.text).map(w => w.original);
        return { ayah, words, normalized: words.map(normalizeArabic) };
      });

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
          try { recognition.start(); } catch {}
        } else {
          finalizeAttempt(recordingAyahIdxRef.current);
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

  const resetSilenceTimer = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = window.setTimeout(() => {
      if (shouldContinueRef.current) stopRecording();
    }, 4000);
  };

  const stopRecording = () => {
    shouldContinueRef.current = false;
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (secondsTimerRef.current) { clearInterval(secondsTimerRef.current); secondsTimerRef.current = null; }
    try { recognitionRef.current?.stop(); } catch {}
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
    const accuracy = q.normalized.length > 0
      ? Math.round((matchedE.size / q.normalized.length) * 100) : 0;

    setAttempts(prev => ({
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

  const goNext = () => { if (currentIndex < questions.length - 1) setCurrentIndex(i => i + 1); };
  const goPrev = () => { if (currentIndex > 0) setCurrentIndex(i => i - 1); };

  // ─── بدء/إنهاء/إعادة ───
  const startTest = () => {
    if (endAyah < startAyah) return;
    setQuestions(buildQuestions());
    setCurrentIndex(0);
    setAttempts({});
    setResults(null);
    setStage('running');
    setError(null);
  };

  const finishTest = () => {
    let perfectAyahs = 0, matchedWords = 0, totalWords = 0, attemptedAyahs = 0;
    questions.forEach((q, idx) => {
      const a = attempts[idx];
      const total = q.normalized.length;
      totalWords += total;
      if (a) {
        attemptedAyahs++;
        matchedWords += a.matched.size;
        if (!a.revealed && a.matched.size === total) perfectAyahs++;
        recordVerseResult(surah.number, q.ayah.numberInSurah, a.matched.size === total, []);
      }
    });
    const accuracy = totalWords > 0 ? Math.round((matchedWords / totalWords) * 100) : 0;
    setResults({
      totalAyahs: questions.length, attemptedAyahs, perfectAyahs, totalWords, matchedWords, accuracy,
    });
    addPointsAndVerses(
      Math.round(perfectAyahs * 20 + matchedWords * 2),
      perfectAyahs, accuracy, accuracy,
    );
    onStatsUpdate();
    setStage('finished');
  };

  const resetTest = () => {
    cleanupRecording();
    setStage('idle');
    setQuestions([]); setCurrentIndex(0); setAttempts({}); setResults(null);
    setRecordingState('idle'); setLiveTranscript(''); setError(null);
  };

  // ─── قيم مشتقة ───
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

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-stone-50 to-stone-100">

      {/* شريط تقدم علوي */}
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
        </div>
      )}

      {/* المحتوى */}
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

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-xs font-semibold text-stone-700">
                  من الآية
                  <input
                    type="number" min={1} max={maxAyah} value={startAyah}
                    onChange={e => {
                      const v = Math.min(maxAyah, Math.max(1, Number(e.target.value)));
                      setStartAyah(v);
                      setEndAyah(prev => Math.max(prev, v));
                    }}
                    className="min-h-11 w-full rounded-xl border border-stone-300 px-3 text-sm"
                  />
                </label>
                <label className="space-y-2 text-xs font-semibold text-stone-700">
                  إلى الآية
                  <input
                    type="number" min={startAyah} max={maxAyah} value={endAyah}
                    onChange={e => setEndAyah(Math.min(maxAyah, Math.max(startAyah, Number(e.target.value))))}
                    className="min-h-11 w-full rounded-xl border border-stone-300 px-3 text-sm"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-stone-700">المساعدة البصرية</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['none', 'بدون', 'تسميع من الذاكرة'],
                    ['first_word', 'الكلمة الأولى', 'تلميح لبداية الآية'],
                    ['full', 'كاملة', 'وضع القراءة'],
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
              {speechSupported && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900 flex items-start gap-2">
                  <Mic className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>عند الضغط على الميكروفون سيُطلب إذن التسجيل. تكلّم بوضوح بالعربية الفصحى.</span>
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
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-emerald-700 text-white text-[11px] font-bold tabular-nums px-1.5">
                      {currentQ.ayah.numberInSurah}
                    </span>
                    <span className="text-[11px] text-stone-500 font-semibold">
                      آية {currentIndex + 1} من {questions.length}
                    </span>
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
                          <div dir="rtl" className="font-quran text-2xl leading-[2] text-stone-800">
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
                            return <span key={idx} className="text-stone-800">{w}</span>;
                          }
                          return (
                            <span
                              key={idx}
                              className={matched
                                ? 'text-emerald-700'
                                : 'text-rose-600 underline decoration-rose-400 decoration-2 underline-offset-4'}
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
                          <span className={`text-3xl font-bold tabular-nums ${
                            currentAttempt.accuracy >= 85
                              ? 'text-emerald-700'
                              : currentAttempt.accuracy >= 50
                              ? 'text-amber-700'
                              : 'text-rose-700'
                          }`}>
                            {currentAttempt.accuracy}%
                          </span>
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

                      {/* النص المُسموع */}
                      {currentAttempt.transcript && !currentAttempt.revealed && (
                        <div dir="rtl" className="rounded-xl bg-stone-50 border border-stone-200 p-3 text-xs text-stone-600 font-quran text-center">
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

          {/* ════════ FINISHED ════════ */}
          {stage === 'finished' && results && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 text-center space-y-4">
                <div className={`inline-flex h-20 w-20 items-center justify-center rounded-full ${
                  results.accuracy >= 80
                    ? 'bg-emerald-100 text-emerald-700'
                    : results.accuracy >= 50
                    ? 'bg-amber-100 text-amber-700'
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

              {/* تفصيل الآيات */}
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
                        !a
                          ? 'border-stone-200 bg-stone-50/60'
                          : perfect
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : 'border-rose-200 bg-rose-50/60'
                      }`}>
                        <span className="text-xs font-semibold text-stone-700">
                          الآية {q.ayah.numberInSurah}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold tabular-nums ${
                          !a ? 'text-stone-400'
                            : perfect ? 'text-emerald-700'
                            : 'text-rose-700'
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

      {/* الشريط السفلي الثابت */}
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