import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import {
  Play,
  Pause,
  Repeat,
  Volume2,
  EyeOff,
  Mic,
  MicOff,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RotateCcw,
  Link2,
  Sparkles,
  Target,
  Headphones,
  ListChecks,
  SkipForward,
  Settings2,
} from 'lucide-react';
import { ALL_SURAHS } from '../data/quranSurahsList';
import { getSurahWithAyahsByRiwayah } from '../data/riwayahData';
import { RIWAYAT, riwayahFontFamily, ensureRiwayahFont } from '../data/riwayahConfig';
import { getAyahAudioUrl, POPULAR_RECITERS } from '../utils/audioReciters';
import { extractWords, toArabicDigits } from '../utils/arabicUtils';
import { useRecitationSession } from '../hooks/useRecitationSession';
import {
  recordVerseResult,
  addPointsAndVerses,
  getVerseMasteryMap,
} from '../services/storageService';
import { Surah, RiwayahKey } from '../types/quran';

type Phase = 'setup' | 'listen' | 'recite' | 'results';

interface MemorizationSessionProps {
  riwayah: RiwayahKey;
  onStatsUpdate: () => void;
}

interface AyahResult {
  numberInSurah: number;
  isFlawless: boolean;
  mistakeCount: number;
}

const STEPS: { key: Phase; label: string }[] = [
  { key: 'setup', label: 'الاختيار' },
  { key: 'listen', label: 'الاستماع والتكرار' },
  { key: 'recite', label: 'التسميع' },
  { key: 'results', label: 'النتيجة' },
];

const DAILY_AMOUNT_OPTIONS = [1, 2, 3, 5, 7, 10];
const REPEAT_OPTIONS = [1, 2, 3, 5, 7, 10];

/** مستويات الإخفاء التدريجي للنص: 0 كامل · 1 ثلث · 2 ثلثان · 3 مخفي كليًا. */
const HIDE_LEVELS = [
  { value: 0, label: 'كامل' },
  { value: 1, label: 'جزئي' },
  { value: 2, label: 'خافت' },
  { value: 3, label: 'مخفي' },
];

function isWordHidden(wordIndex: number, level: number): boolean {
  if (level <= 0) return false;
  if (level >= 3) return true;
  if (level === 1) return wordIndex % 3 === 1;
  return wordIndex % 3 !== 0;
}

export const MemorizationSession: React.FC<MemorizationSessionProps> = ({
  riwayah,
  onStatsUpdate,
}) => {
  const info = RIWAYAT[riwayah];
  const audioAvailable = info.hasAudio;

  // إعدادات الجلسة
  const [surahNumber, setSurahNumber] = useState(1);
  const [startAyah, setStartAyah] = useState(1);
  const [dailyAmount, setDailyAmount] = useState(3);
  const [reciterId, setReciterId] = useState(POPULAR_RECITERS[0].id);
  const [repeatCount, setRepeatCount] = useState(3);
  const [hideLevel, setHideLevel] = useState(1);
  const [cumulative, setCumulative] = useState(true);

  // بيانات السورة
  const [surah, setSurah] = useState<Surah | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // حالة الجلسة
  const [phase, setPhase] = useState<Phase>('setup');
  const [audioIndex, setAudioIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [repeatProgress, setRepeatProgress] = useState(0);
  const [reciteIndex, setReciteIndex] = useState(0);
  const [results, setResults] = useState<AyahResult[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(
    () =>
      typeof window !== 'undefined' &&
      !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
  );

  // مشغّل الصوت
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playTokenRef = useRef(0);
  const pendingResolveRef = useRef<((ok: boolean) => void) | null>(null);

  // التعرّف الصوتي
  const recognitionRef = useRef<any>(null);
  const recognitionEnabledRef = useRef(false);
  const nativeActiveRef = useRef(false);
  const handledRef = useRef(false);

  const surahLength = surah?.ayahs.length ?? 0;
  const firstIndex = surahLength > 0 ? Math.min(Math.max(0, startAyah - 1), surahLength - 1) : 0;
  const lastIndex =
    surahLength > 0 ? Math.min(surahLength - 1, firstIndex + dailyAmount - 1) : 0;

  const rangeAyahs = useMemo(
    () => (surah ? surah.ayahs.slice(firstIndex, lastIndex + 1) : []),
    [surah, firstIndex, lastIndex],
  );

  const reciteAyah = rangeAyahs[reciteIndex];
  const reciteWords = useMemo(() => (reciteAyah ? extractWords(reciteAyah.text) : []), [reciteAyah]);

  const {
    currentWordIdx,
    matchedWords,
    failedWords,
    activeMistakeAlert,
    isAyahCompleted,
    setIsAyahCompleted,
    completionLockRef,
    handleIncomingSpokenText,
    resetRecitationState,
    failedWordsRef,
  } = useRecitationSession(reciteWords);

  // ---------- تحميل السورة ----------
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);
    getSurahWithAyahsByRiwayah(surahNumber, riwayah)
      .then((data) => {
        if (isMounted) setSurah(data);
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setSurah(null);
          setError(err instanceof Error ? err.message : 'تعذّر تحميل السورة.');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [surahNumber, riwayah]);

  useEffect(() => {
    ensureRiwayahFont(riwayah);
  }, [riwayah]);

  // ضبط بداية الحفظ داخل حدود السورة
  useEffect(() => {
    if (surahLength > 0) setStartAyah((prev) => Math.min(Math.max(1, prev), surahLength));
  }, [surahLength]);

  // ---------- مشغّل الصوت ----------
  const stopPlayback = useCallback(() => {
    playTokenRef.current += 1;
    const resolve = pendingResolveRef.current;
    pendingResolveRef.current = null;
    resolve?.(false);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setIsPlaying(false);
    setRepeatProgress(0);
  }, []);

  const playOne = (url: string, token: number) =>
    new Promise<boolean>((resolve) => {
      const audio = audioRef.current;
      if (!audio || token !== playTokenRef.current) {
        resolve(false);
        return;
      }
      const finish = (ok: boolean) => {
        audio.onended = null;
        audio.onerror = null;
        if (pendingResolveRef.current === resolve) pendingResolveRef.current = null;
        resolve(ok && token === playTokenRef.current);
      };
      pendingResolveRef.current = resolve;
      audio.onended = () => finish(true);
      audio.onerror = () => finish(false);
      audio.src = url;
      audio.play().catch(() => finish(false));
    });

  const runListening = useCallback(
    async (fromIndex: number) => {
      if (!surah || !audioAvailable || !rangeAyahs.length) return;
      stopPlayback();
      const token = playTokenRef.current;
      setIsPlaying(true);
      let index = Math.max(0, Math.min(fromIndex, rangeAyahs.length - 1));

      while (index <= rangeAyahs.length - 1) {
        setAudioIndex(index);
        setRepeatProgress(0);
        const ayah = rangeAyahs[index];

        for (let r = 0; r < repeatCount; r += 1) {
          if (token !== playTokenRef.current) return;
          setRepeatProgress(r + 1);
          const ok = await playOne(getAyahAudioUrl(reciterId, surah.number, ayah.numberInSurah), token);
          if (token !== playTokenRef.current) return;
          if (!ok) {
            setIsPlaying(false);
            return;
          }
        }

        // الحفظ التراكمي: ربط الآية الحالية بما قبلها من بداية المقطع.
        if (cumulative && index > 0) {
          for (let j = 0; j <= index; j += 1) {
            if (token !== playTokenRef.current) return;
            const ok = await playOne(
              getAyahAudioUrl(reciterId, surah.number, rangeAyahs[j].numberInSurah),
              token,
            );
            if (token !== playTokenRef.current) return;
            if (!ok) {
              setIsPlaying(false);
              return;
            }
          }
        }

        if (index === rangeAyahs.length - 1) break;
        index += 1;
      }

      if (token === playTokenRef.current) {
        setIsPlaying(false);
        setRepeatProgress(0);
      }
    },
    [audioAvailable, cumulative, rangeAyahs, reciterId, repeatCount, stopPlayback, surah],
  );

  // ---------- التعرّف الصوتي (التسميع) ----------
  const stopListening = useCallback(() => {
    recognitionEnabledRef.current = false;
    nativeActiveRef.current = false;
    setIsListening(false);
    if (Capacitor.isNativePlatform()) {
      void SpeechRecognition.stop().catch(() => undefined);
    } else {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const incomingRef = useRef(handleIncomingSpokenText);
  incomingRef.current = handleIncomingSpokenText;

  const handleAyahCompletion = useCallback(
    (isFlawless: boolean) => {
      if (handledRef.current) return;
      handledRef.current = true;
      completionLockRef.current = true;
      stopListening();

      const ayah = rangeAyahs[reciteIndex];
      if (!ayah || !surah) return;

      const mistakes = Object.entries(failedWordsRef.current).map(([idx, heard]) => ({
        expectedWord: reciteWords[parseInt(idx, 10)]?.original || '',
        recitedWord: heard,
      }));

      recordVerseResult(surah.number, ayah.numberInSurah, isFlawless, mistakes);
      addPointsAndVerses(isFlawless ? 35 : 20, 1, 30, isFlawless ? 100 : 85);
      onStatsUpdate();

      setResults((prev) => {
        const others = prev.filter((r) => r.numberInSurah !== ayah.numberInSurah);
        return [
          ...others,
          {
            numberInSurah: ayah.numberInSurah,
            isFlawless,
            mistakeCount: mistakes.length,
          },
        ].sort((a, b) => a.numberInSurah - b.numberInSurah);
      });
      setIsAyahCompleted(true);
    },
    [
      completionLockRef,
      failedWordsRef,
      onStatsUpdate,
      rangeAyahs,
      reciteIndex,
      reciteWords,
      setIsAyahCompleted,
      stopListening,
      surah,
    ],
  );

  const completionRef = useRef(handleAyahCompletion);
  completionRef.current = handleAyahCompletion;

  const nativeLoopRef = useRef<() => Promise<void>>(async () => {});

  const startListening = useCallback(async () => {
    if (isListening) return;
    if (handledRef.current) {
      resetRecitationState();
      completionLockRef.current = false;
      handledRef.current = false;
    }
    if (!reciteWords.length) return;
    recognitionEnabledRef.current = true;
    setIsListening(true);

    if (Capacitor.isNativePlatform()) {
      nativeActiveRef.current = true;
      void nativeLoopRef.current();
      return;
    }
    try {
      recognitionRef.current?.start();
    } catch {
      recognitionEnabledRef.current = false;
      setIsListening(false);
      setSpeechSupported(false);
    }
  }, [completionLockRef, isListening, reciteWords.length, resetRecitationState]);

  // تهيئة التعرّف الصوتي في المتصفح
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setSpeechSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      recognition.lang = 'ar-SA';

      recognition.onstart = () => setIsListening(true);

      recognition.onend = () => {
        if (recognitionEnabledRef.current && !handledRef.current) {
          setTimeout(() => {
            if (recognitionEnabledRef.current && !handledRef.current) {
              try {
                recognition.start();
                setIsListening(true);
              } catch (err) {
                if (!(err instanceof DOMException && err.name === 'InvalidStateError')) {
                  recognitionEnabledRef.current = false;
                  setIsListening(false);
                }
              }
            }
          }, 250);
          return;
        }
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        if (
          event.error === 'not-allowed' ||
          event.error === 'service-not-allowed' ||
          event.error === 'audio-capture' ||
          event.error === 'network'
        ) {
          recognitionEnabledRef.current = false;
          setIsListening(false);
          setSpeechSupported(false);
        }
      };

      recognition.onresult = (event: any) => {
        if (!recognitionEnabledRef.current) return;
        let finalTranscript = '';
        const alternatives: string[] = [];
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const transcript = result[0]?.transcript ?? '';
          if (result.isFinal) {
            finalTranscript += `${transcript} `;
            for (let k = 1; k < result.length; k += 1) {
              const alt = result[k]?.transcript?.trim();
              if (alt) alternatives.push(alt);
            }
          }
        }
        if (finalTranscript.trim()) {
          const next = incomingRef.current(finalTranscript.trim(), alternatives);
          if (next?.completed) completionRef.current(next.isFlawless);
        }
      };

      recognitionRef.current = recognition;
    } catch {
      setSpeechSupported(false);
    }

    return () => {
      recognitionEnabledRef.current = false;
      recognitionRef.current?.abort?.();
    };
  }, []);

  // حلقة التعرّف على المنصّات الأصلية (Capacitor)
  const runNativeLoop = useCallback(async () => {
    if (!nativeActiveRef.current) return;
    try {
      const { matches } = await SpeechRecognition.start({
        language: 'ar-SA',
        maxResults: 3,
        partialResults: false,
        popup: false,
      });
      if (!nativeActiveRef.current) return;

      const recognizedText = matches?.[0]?.trim();
      if (recognizedText) {
        const alternatives = (matches ?? []).slice(1).filter((m) => m && m.trim());
        const next = incomingRef.current(recognizedText, alternatives);
        if (next?.completed) completionRef.current(next.isFlawless);
      }
      if (nativeActiveRef.current) {
        setTimeout(() => void nativeLoopRef.current(), 250);
      }
    } catch {
      nativeActiveRef.current = false;
      recognitionEnabledRef.current = false;
      setIsListening(false);
      setSpeechSupported(false);
    }
  }, []);
  nativeLoopRef.current = runNativeLoop;

  // تنظيف عام عند إلغاء التركيب أو تغيير المرحلة
  useEffect(() => {
    return () => {
      stopPlayback();
      stopListening();
    };
  }, [stopListening, stopPlayback]);

  useEffect(() => {
    if (phase !== 'recite') stopListening();
  }, [phase, stopListening]);

  // إعادة ضبط حالة التسميع عند تغيير الآية
  useEffect(() => {
    handledRef.current = false;
    completionLockRef.current = false;
    resetRecitationState();
  }, [completionLockRef, reciteIndex, resetRecitationState]);

  // إعادة الجلسة إلى البداية عند تغيير السورة أو الرواية
  const resetSession = useCallback(() => {
    stopPlayback();
    stopListening();
    setPhase('setup');
    setAudioIndex(0);
    setRepeatProgress(0);
    setReciteIndex(0);
    setResults([]);
  }, [stopListening, stopPlayback]);

  const handleSurahChange = (value: number) => {
    resetSession();
    setSurahNumber(value);
  };

  const goToRecite = (index: number) => {
    stopPlayback();
    setReciteIndex(Math.max(0, Math.min(index, rangeAyahs.length - 1)));
    setPhase('recite');
  };

  const accuracyPercent = rangeAyahs.length
    ? Math.round((results.filter((r) => r.isFlawless).length / rangeAyahs.length) * 100)
    : 0;

  const weakAyahs = useMemo(() => {
    if (phase !== 'results') return [];
    const map = getVerseMasteryMap();
    return Object.values(map)
      .filter(
        (item) =>
          item.surahNumber === surahNumber &&
          (item.level === 'review_needed' || item.mistakeCount > 0),
      )
      .sort((a, b) => a.ayahNumber - b.ayahNumber);
  }, [phase, surahNumber]);

  const quranFont = riwayahFontFamily(riwayah);
  const stepIndex = STEPS.findIndex((s) => s.key === phase);

  return (
    <div className="glass-panel rounded-3xl p-5 sm:p-6 space-y-5">
      <audio ref={audioRef} preload="auto" className="hidden" />

      {/* رأس الجلسة + مؤشر المراحل */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="p-2 rounded-xl bg-gold-400/15 border border-gold-400/30">
            <Settings2 className="w-4 h-4 text-gold-300" />
          </span>
          <div>
            <h3 className="font-display font-bold text-white text-lg">جلسة الحفظ</h3>
            <p className="text-[11px] text-jade-100/60">
              اختر · استمع · كرّر · سمّع · ثبّت المحفوظ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {STEPS.map((step, idx) => (
            <React.Fragment key={step.key}>
              <span
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                  idx === stepIndex
                    ? 'bg-gold-400 text-jade-950 border-gold-400'
                    : idx < stepIndex
                      ? 'bg-white/5 text-gold-200 border-gold-400/30'
                      : 'bg-white/5 text-jade-100/50 border-white/10'
                }`}
              >
                {step.label}
              </span>
              {idx < STEPS.length - 1 && <ChevronLeft className="w-3 h-3 text-jade-100/30" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-10 text-jade-100/70 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-gold-300" />
          جارٍ تحميل نصّ السورة برواية {info.label}…
        </div>
      )}

      {!isLoading && error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-400/30 p-4">
          <AlertTriangle className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" />
          <div className="text-sm text-rose-200/90">
            <p className="font-bold">تعذّر تحميل السورة</p>
            <p className="text-rose-200/70 mt-1">{error}</p>
          </div>
        </div>
      )}

      {!isLoading && !error && surah && (
        <>
          {/* المرحلة 1: الاختيار */}
          {phase === 'setup' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-jade-100/70">السورة</span>
                  <select
                    value={surahNumber}
                    onChange={(e) => handleSurahChange(Number(e.target.value))}
                    style={{ colorScheme: 'dark' }}
                    className="w-full bg-white/5 border border-white/15 text-white rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-gold-400 cursor-pointer"
                  >
                    {ALL_SURAHS.map((s) => (
                      <option key={s.number} value={s.number} className="bg-jade-900 text-white">
                        {s.number}. سورة {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-jade-100/70">
                    مقدار الحفظ اليومي (عدد الآيات)
                  </span>
                  <select
                    value={dailyAmount}
                    onChange={(e) => setDailyAmount(Number(e.target.value))}
                    style={{ colorScheme: 'dark' }}
                    className="w-full bg-white/5 border border-white/15 text-white rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-gold-400 cursor-pointer"
                  >
                    {DAILY_AMOUNT_OPTIONS.map((n) => (
                      <option key={n} value={n} className="bg-jade-900 text-white">
                        {toArabicDigits(n)} {n === 1 ? 'آية' : 'آيات'}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-jade-100/70">
                    بداية الحفظ (رقم الآية)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={surahLength}
                    value={startAyah}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setStartAyah(Number.isFinite(value) ? value : 1);
                    }}
                    className="w-full bg-white/5 border border-white/15 text-white rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-gold-400"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-jade-100/70">
                    <Volume2 className="w-3.5 h-3.5 text-gold-300" /> القارئ
                  </span>
                  <select
                    value={reciterId}
                    onChange={(e) => setReciterId(e.target.value)}
                    disabled={!audioAvailable}
                    style={{ colorScheme: 'dark' }}
                    className="w-full bg-white/5 border border-white/15 text-white rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-gold-400 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {POPULAR_RECITERS.map((r) => (
                      <option key={r.id} value={r.id} className="bg-jade-900 text-white">
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="space-y-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-jade-100/70">
                    <Repeat className="w-3.5 h-3.5 text-gold-300" /> عدد مرات التكرار
                  </span>
                  <select
                    value={repeatCount}
                    onChange={(e) => setRepeatCount(Number(e.target.value))}
                    style={{ colorScheme: 'dark' }}
                    className="w-full bg-white/5 border border-white/15 text-white rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-gold-400 cursor-pointer"
                  >
                    {REPEAT_OPTIONS.map((n) => (
                      <option key={n} value={n} className="bg-jade-900 text-white">
                        {toArabicDigits(n)} مرات
                      </option>
                    ))}
                  </select>
                </label>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-jade-100/70">إخفاء النص تدريجيًا</span>
                  <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                    {HIDE_LEVELS.map((level) => (
                      <button
                        key={level.value}
                        onClick={() => setHideLevel(level.value)}
                        className={`flex-1 px-2 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          hideLevel === level.value
                            ? 'bg-gold-400 text-jade-950'
                            : 'text-jade-100/70 hover:text-white'
                        }`}
                      >
                        {level.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setCumulative((v) => !v)}
                className={`w-full flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors cursor-pointer ${
                  cumulative
                    ? 'bg-gold-400/10 border-gold-400/40'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Link2 className="w-4 h-4 text-gold-300" />
                  الحفظ التراكمي (ربط الآية الجديدة بما قبلها)
                </span>
                <span
                  className={`w-10 h-6 rounded-full relative transition-colors ${
                    cumulative ? 'bg-gold-400' : 'bg-white/15'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                      cumulative ? 'left-0.5' : 'left-4.5'
                    }`}
                  />
                </span>
              </button>

              {/* معاينة المقطع المختار */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
                <p className="text-xs font-semibold text-jade-100/70">
                  مقطع الحفظ المختار: من الآية {toArabicDigits(firstIndex + 1)} إلى{' '}
                  {toArabicDigits(lastIndex + 1)} ({toArabicDigits(rangeAyahs.length)} آيات)
                </p>
                <p
                  dir="rtl"
                  lang="ar"
                  className="text-xl leading-loose text-white/90"
                  style={{ fontFamily: quranFont }}
                >
                  {rangeAyahs[0]?.text}
                  {rangeAyahs.length > 1 && ' …'}
                </p>
                {!audioAvailable && (
                  <p className="flex items-center gap-1.5 text-[11px] text-gold-200/80">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    التلاوة الصوتية غير متوفرة لرواية {info.label}؛ يمكنك التسميع والقراءة مباشرةً.
                  </p>
                )}
              </div>

              <button
                onClick={() => {
                  setAudioIndex(0);
                  setPhase('listen');
                  if (audioAvailable) void runListening(0);
                }}
                className="w-full flex items-center justify-center gap-2 bg-gold-400 hover:bg-gold-300 text-jade-950 font-bold px-5 py-3 rounded-xl transition-colors shadow-lg shadow-gold-500/20 cursor-pointer"
              >
                <Headphones className="w-5 h-5" />
                ابدأ الجلسة
              </button>
            </motion.div>
          )}

          {/* المرحلة 2: الاستماع والتكرار */}
          {phase === 'listen' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-gold-300" />
                  استمع وكرّر ثم أتقن
                </span>
                <div className="flex items-center gap-3 text-[11px] text-jade-100/70">
                  <span className="flex items-center gap-1">
                    <Repeat className="w-3.5 h-3.5 text-gold-300" />
                    تكرار {toArabicDigits(repeatProgress)}/{toArabicDigits(repeatCount)}
                  </span>
                  {cumulative && (
                    <span className="flex items-center gap-1 text-gold-200/80">
                      <Link2 className="w-3.5 h-3.5" /> تراكمي
                    </span>
                  )}
                </div>
              </div>

              {/* معاينة الآية الحالية مع الإخفاء التدريجي */}
              <div className="rounded-2xl border border-white/10 bg-jade-950/40 p-5">
                <p
                  dir="rtl"
                  lang="ar"
                  className="text-2xl sm:text-3xl leading-loose text-white text-right"
                  style={{ fontFamily: quranFont }}
                >
                  {(rangeAyahs[audioIndex] ? extractWords(rangeAyahs[audioIndex].text) : []).map(
                    (word, idx) => (
                      <span key={idx}>
                        {isWordHidden(idx, hideLevel) ? (
                          <span className="text-gold-300/40 select-none">•</span>
                        ) : (
                          word.original
                        )}{' '}
                      </span>
                    ),
                  )}
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gold-400/50 text-gold-200 text-sm font-bold mx-2 select-none align-middle">
                    {rangeAyahs[audioIndex]?.numberInSurah}
                  </span>
                </p>
              </div>

              {/* قائمة آيات المقطع */}
              <div className="flex flex-wrap gap-2">
                {rangeAyahs.map((ayah, idx) => (
                  <button
                    key={ayah.numberInSurah}
                    onClick={() => {
                      if (isPlaying) stopPlayback();
                      setAudioIndex(idx);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      idx === audioIndex
                        ? 'bg-gold-400 text-jade-950 border-gold-400'
                        : 'bg-white/5 text-jade-100/70 border-white/10 hover:text-white'
                    }`}
                  >
                    الآية {toArabicDigits(ayah.numberInSurah)}
                  </button>
                ))}
              </div>

              {/* أزرار التحكم */}
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => {
                    const prev = Math.max(0, audioIndex - 1);
                    setAudioIndex(prev);
                    if (isPlaying) void runListening(prev);
                  }}
                  disabled={audioIndex <= 0}
                  className="p-2.5 rounded-xl border border-white/10 bg-white/5 text-jade-100 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="الآية السابقة"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                <button
                  onClick={() => (isPlaying ? stopPlayback() : void runListening(audioIndex))}
                  disabled={!audioAvailable}
                  className="flex items-center gap-2 bg-gold-400 hover:bg-gold-300 text-jade-950 font-bold px-6 py-2.5 rounded-xl transition-colors shadow-lg shadow-gold-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  {isPlaying ? 'إيقاف' : 'تشغيل'}
                </button>

                <button
                  onClick={() => {
                    const next = Math.min(rangeAyahs.length - 1, audioIndex + 1);
                    setAudioIndex(next);
                    if (isPlaying) void runListening(next);
                  }}
                  disabled={audioIndex >= rangeAyahs.length - 1}
                  className="p-2.5 rounded-xl border border-white/10 bg-white/5 text-jade-100 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="الآية التالية"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  onClick={() => goToRecite(0)}
                  className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-gold-400/30 text-gold-200 font-bold px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  انتقل إلى التسميع
                </button>
                <button
                  onClick={() => {
                    stopPlayback();
                    setPhase('setup');
                  }}
                  className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-jade-100 font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  تعديل الإعدادات
                </button>
              </div>

              {!audioAvailable && (
                <button
                  onClick={() => goToRecite(0)}
                  className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-jade-100/70 hover:text-white transition-colors cursor-pointer"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  تخطّي الاستماع (لا يتوفّر صوت لهذه الرواية)
                </button>
              )}
            </motion.div>
          )}

          {/* المرحلة 3: التسميع */}
          {phase === 'recite' && reciteAyah && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white flex items-center gap-2">
                  <Mic className="w-4 h-4 text-gold-300" />
                  سمّع الآية {toArabicDigits(reciteAyah.numberInSurah)} من الذاكرة
                </span>
                <span className="text-[11px] text-jade-100/60">
                  {toArabicDigits(reciteIndex + 1)}/{toArabicDigits(rangeAyahs.length)}
                </span>
              </div>

              {/* النص يكشف الكلمات تدريجيًا مع التسميع */}
              <div className="rounded-2xl border border-white/10 bg-jade-950/40 p-5">
                <p
                  dir="rtl"
                  lang="ar"
                  className="text-2xl sm:text-3xl leading-loose text-right"
                  style={{ fontFamily: quranFont }}
                >
                  {reciteWords.map((word, idx) => {
                    const isMatched = matchedWords.includes(idx);
                    const heard = failedWords[idx];
                    const isFailed = heard !== undefined;
                    return (
                      <span
                        key={idx}
                        className={
                          isFailed
                            ? 'text-rose-300 underline decoration-rose-400/70 decoration-wavy'
                            : isMatched
                              ? 'text-emerald-300'
                              : 'text-jade-100/20 select-none'
                        }
                        title={isFailed ? `سمعت: ${heard}` : undefined}
                      >
                        {isFailed || isMatched ? word.original : '•••'}{' '}
                      </span>
                    );
                  })}
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gold-400/50 text-gold-200 text-sm font-bold mx-2 select-none align-middle">
                    {reciteAyah.numberInSurah}
                  </span>
                </p>
              </div>

              {/* تقدّم المطابقة */}
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gold-400 transition-all"
                  style={{
                    width: `${reciteWords.length ? (currentWordIdx / reciteWords.length) * 100 : 0}%`,
                  }}
                />
              </div>

              {activeMistakeAlert && !isAyahCompleted && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {activeMistakeAlert.heard}
                </div>
              )}

              {isAyahCompleted && (
                <div
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                    results.find((r) => r.numberInSurah === reciteAyah.numberInSurah)?.isFlawless
                      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-gold-400/30 bg-gold-400/10 text-gold-200'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {results.find((r) => r.numberInSurah === reciteAyah.numberInSurah)?.isFlawless
                    ? 'تسميع متقن، أحسنت!'
                    : 'تم التسميع مع بعض الأخطاء، وستُراجع هذه الآية لاحقًا.'}
                </div>
              )}

              {/* أزرار التحكم */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => goToRecite(reciteIndex - 1)}
                  disabled={reciteIndex <= 0}
                  className="p-2.5 rounded-xl border border-white/10 bg-white/5 text-jade-100 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="الآية السابقة"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                <button
                  onClick={() => {
                    if (isAyahCompleted) {
                      void startListening();
                    } else if (isListening) {
                      stopListening();
                    } else {
                      void startListening();
                    }
                  }}
                  disabled={!speechSupported}
                  className={`flex items-center gap-2 font-bold px-6 py-2.5 rounded-xl transition-colors shadow-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    isListening
                      ? 'bg-rose-500/90 hover:bg-rose-500 text-white shadow-rose-500/20'
                      : 'bg-gold-400 hover:bg-gold-300 text-jade-950 shadow-gold-500/20'
                  }`}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  {isListening ? 'إيقاف الاستماع' : 'ابدأ التسميع'}
                </button>

                <button
                  onClick={() => goToRecite(reciteIndex + 1)}
                  disabled={reciteIndex >= rangeAyahs.length - 1}
                  className="p-2.5 rounded-xl border border-white/10 bg-white/5 text-jade-100 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="الآية التالية"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>

              {!speechSupported && (
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-gold-200/80">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  التعرّف الصوتي غير متاح في هذا المتصفح؛ يمكنك الانتقال للنتيجة.
                </p>
              )}

              <button
                onClick={() => {
                  stopListening();
                  setPhase('results');
                }}
                className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-gold-400/30 text-gold-200 font-bold px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                <ListChecks className="w-4 h-4" />
                عرض النتيجة
              </button>
            </motion.div>
          )}

          {/* المرحلة 4: النتيجة */}
          {phase === 'results' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                  <p className="text-2xl font-bold text-white font-display">
                    {toArabicDigits(results.length)}
                  </p>
                  <p className="text-[11px] text-jade-100/60 mt-0.5">آيات تم تسميعها</p>
                </div>
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-300 font-display">
                    {toArabicDigits(results.filter((r) => r.isFlawless).length)}
                  </p>
                  <p className="text-[11px] text-jade-100/60 mt-0.5">بإتقان تام</p>
                </div>
                <div className="rounded-2xl border border-gold-400/20 bg-gold-400/5 p-4 text-center">
                  <p className="text-2xl font-bold text-gold-300 font-display">
                    {toArabicDigits(accuracyPercent)}٪
                  </p>
                  <p className="text-[11px] text-jade-100/60 mt-0.5">نسبة الإتقان</p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
                <p className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-gold-300" />
                  تفصيل آيات المقطع
                </p>
                <div className="flex flex-wrap gap-2">
                  {rangeAyahs.map((ayah) => {
                    const result = results.find((r) => r.numberInSurah === ayah.numberInSurah);
                    return (
                      <span
                        key={ayah.numberInSurah}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                          !result
                            ? 'bg-white/5 text-jade-100/50 border-white/10'
                            : result.isFlawless
                              ? 'bg-emerald-500/10 text-emerald-200 border-emerald-400/30'
                              : 'bg-rose-500/10 text-rose-200 border-rose-400/30'
                        }`}
                      >
                        الآية {toArabicDigits(ayah.numberInSurah)}
                        {result && !result.isFlawless
                          ? ` · ${toArabicDigits(result.mistakeCount)} خطأ`
                          : ''}
                      </span>
                    );
                  })}
                </div>
              </div>

              {weakAyahs.length > 0 && (
                <div className="rounded-2xl border border-gold-400/25 bg-gold-400/5 p-4 space-y-2">
                  <p className="text-sm font-semibold text-gold-200 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    آيات تحتاج تدريبًا إضافيًا في هذه السورة
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {weakAyahs.map((item) => (
                      <button
                        key={`${item.surahNumber}_${item.ayahNumber}`}
                        onClick={() => {
                          setReciteIndex(
                            Math.max(0, Math.min(item.ayahNumber - 1 - firstIndex, rangeAyahs.length - 1)),
                          );
                          setPhase('recite');
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 transition-colors cursor-pointer"
                      >
                        الآية {toArabicDigits(item.ayahNumber)} · {toArabicDigits(item.mistakeCount)} خطأ
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setResults([]);
                    setReciteIndex(0);
                    setAudioIndex(0);
                    setPhase('listen');
                    if (audioAvailable) void runListening(0);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 bg-gold-400 hover:bg-gold-300 text-jade-950 font-bold px-5 py-2.5 rounded-xl transition-colors shadow-lg shadow-gold-500/20 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  أعد الجلسة
                </button>
                <button
                  onClick={() => {
                    setResults([]);
                    setReciteIndex(0);
                    setAudioIndex(0);
                    setPhase('setup');
                  }}
                  className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-jade-100 font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  <Settings2 className="w-4 h-4" />
                  مقطع جديد
                </button>
              </div>
            </motion.div>
          )}
        </>
      )}

      {!isLoading && !error && !surah && (
        <div className="flex items-center justify-center gap-2 py-8 text-jade-100/50 text-sm">
          <EyeOff className="w-4 h-4" />
          لا تتوفّر بيانات لهذه السورة.
        </div>
      )}
    </div>
  );
};
