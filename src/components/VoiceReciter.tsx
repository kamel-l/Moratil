import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import {
  Mic, MicOff, RotateCcw, Volume2, CheckCircle2, AlertCircle,
  ChevronRight, ChevronLeft, HelpCircle, BookOpen, Headphones, Sparkles,
  Eye, EyeOff, Info,
} from 'lucide-react';
import { Surah, Ayah, Reciter } from '../types/quran';
import { extractWords } from '../utils/arabicUtils';
import { getAyahAudioUrl } from '../utils/audioReciters';
import { recordVerseResult, addPointsAndVerses } from '../services/storageService';
import { useRecitationSession } from '../hooks/useRecitationSession';
import { useAyahAudio } from '../hooks/useAyahAudio';

interface VoiceReciterProps {
  surah: Surah;
  initialAyahNumber?: number;
  selectedReciter: Reciter;
  onOpenTafsir: (ayah: Ayah) => void;
  onStatsUpdate: () => void;
  onSelectSurahChange: (surahNum: number, ayahNum?: number) => void;
  allSurahsList: { number: number; name: string; numberOfAyahs: number }[];
}

type RecitationMode = 'karaoke' | 'listen_repeat';

export const VoiceReciter: React.FC<VoiceReciterProps> = ({
  surah, initialAyahNumber = 1, selectedReciter,
  onOpenTafsir, onStatsUpdate, onSelectSurahChange, allSurahsList,
}) => {
  const [currentAyahIndex, setCurrentAyahIndex] = useState(() =>
    Math.max(0, Math.min(surah.ayahs.length - 1, initialAyahNumber - 1)),
  );
  const [mode, setMode] = useState<RecitationMode>('karaoke');
  const [isListening, setIsListening] = useState(false);
  const [isSurahRecitationMode, setIsSurahRecitationMode] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(
    () => typeof window !== 'undefined' &&
      !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
  );
  const [showSimulatedInput, setShowSimulatedInput] = useState(false);
  const [hideUnrecitedWords, setHideUnrecitedWords] = useState(true);
  const [surahRecitationResult, setSurahRecitationResult] = useState<{
    completedAyahs: number; accuratelyMatchedAyahs: number;
  } | null>(null);

  // ============ Refs ============
  const recognitionRef = useRef<any>(null);
  const incomingSpeechHandlerRef = useRef<
    (text: string, confidence?: number) => { completed: boolean; isFlawless: boolean } | undefined
  >(() => undefined);
  const ayahCompletionHandlerRef = useRef<(isFlawless: boolean) => void>(() => {});
  const nativeRecognitionRunnerRef = useRef<() => Promise<void>>(async () => {});
  const nativeRecognitionActiveRef = useRef(false);
  const recognitionEnabledRef = useRef(false);
  const recognitionRequestIdRef = useRef(0);
  const isSurahRecitationModeRef = useRef(false);
  const isAyahCompletedRef = useRef(false);
  const ayahCompletionHandledRef = useRef(false);
  const surahRecitationSummaryRef = useRef({ completedAyahs: 0, accuratelyMatchedAyahs: 0 });
  const cooldownUntilRef = useRef(0);
  const currentWordIdxForAltRef = useRef(0);

  const currentAyah = surah.ayahs[currentAyahIndex] || surah.ayahs[0];
  const verseWords = useMemo(() => extractWords(currentAyah.text), [currentAyah]);

  const {
    currentWordIdx, matchedWords, activeMistakeAlert, isAyahCompleted, setIsAyahCompleted,
    setActiveMistakeAlert, completionLockRef, handleIncomingSpokenText,
    resetRecitationState, failedWordsRef,
  } = useRecitationSession(verseWords);

  useEffect(() => {
    currentWordIdxForAltRef.current = currentWordIdx;
  }, [currentWordIdx]);

  const { isPlayingAudio, playAudio, stopAudio } = useAyahAudio();

  // ============================================================
  // ✅ معالج إتمام الآية
  // ============================================================
  function handleAyahCompletion(isFlawless: boolean) {
    if (ayahCompletionHandledRef.current) return;
    ayahCompletionHandledRef.current = true;
    completionLockRef.current = true;
    isAyahCompletedRef.current = true;

    const isFinalAyah = currentAyahIndex >= surah.ayahs.length - 1;
    const shouldContinueSurah = isSurahRecitationModeRef.current;

    if (shouldContinueSurah) {
      const summary = {
        completedAyahs: surahRecitationSummaryRef.current.completedAyahs + 1,
        accuratelyMatchedAyahs:
          surahRecitationSummaryRef.current.accuratelyMatchedAyahs + (isFlawless ? 1 : 0),
      };
      surahRecitationSummaryRef.current = summary;
      if (isFinalAyah) setSurahRecitationResult(summary);
    }

    setIsAyahCompleted(isFinalAyah);

    const mistakesArray = Object.entries(failedWordsRef.current).map(([idx, heard]) => ({
      expectedWord: verseWords[parseInt(idx, 10)]?.original || '',
      recitedWord: heard,
    }));
    recordVerseResult(surah.number, currentAyah.numberInSurah, isFlawless, mistakesArray);
    addPointsAndVerses(isFlawless ? 35 : 20, 1, 30, isFlawless ? 100 : 85);
    onStatsUpdate();

    if (shouldContinueSurah) {
      if (isFinalAyah) {
        isSurahRecitationModeRef.current = false;
        recognitionEnabledRef.current = false;
        setIsSurahRecitationMode(false);
        setIsListening(false);

        if (Capacitor.isNativePlatform() && nativeRecognitionActiveRef.current) {
          nativeRecognitionActiveRef.current = false;
          SpeechRecognition.stop().catch(() => {});
        }
        if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
        }
      } else {
        cooldownUntilRef.current = Date.now() + 200;
        setCurrentAyahIndex((prev) => prev + 1);
      }
      return;
    }

    if (isFlawless && !isFinalAyah) handleNextAyah();
  }

  ayahCompletionHandlerRef.current = handleAyahCompletion;

  useEffect(() => {
    ayahCompletionHandledRef.current = false;
    isAyahCompletedRef.current = false;
    completionLockRef.current = false;
    resetRecitationState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAyahIndex, surah.number]);

  useEffect(() => {
    setCurrentAyahIndex(Math.max(0, Math.min(surah.ayahs.length - 1, initialAyahNumber - 1)));
    setSurahRecitationResult(null);
    surahRecitationSummaryRef.current = { completedAyahs: 0, accuratelyMatchedAyahs: 0 };
    isSurahRecitationModeRef.current = false;
    recognitionEnabledRef.current = false;
    setIsSurahRecitationMode(false);
    setIsListening(false);
  }, [initialAyahNumber, surah.number, surah.ayahs.length]);

  useEffect(() => { isSurahRecitationModeRef.current = isSurahRecitationMode; }, [isSurahRecitationMode]);
  useEffect(() => { isAyahCompletedRef.current = isAyahCompleted; }, [isAyahCompleted]);

  // ============================================================
  // تهيئة التعرف الصوتي (Web)
  // ============================================================
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      return () => {
        recognitionRequestIdRef.current += 1;
        recognitionEnabledRef.current = false;
        if (nativeRecognitionActiveRef.current) {
          nativeRecognitionActiveRef.current = false;
          void SpeechRecognition.stop().catch(() => {});
        }
      };
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    try {
      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      recognition.lang = 'ar-SA';

      recognition.onstart = () => { if (recognitionEnabledRef.current) setIsListening(true); };
      recognition.onend = () => {
        if (recognitionEnabledRef.current && isSurahRecitationModeRef.current) {
          setTimeout(() => {
            if (recognitionEnabledRef.current && isSurahRecitationModeRef.current) {
              try { recognition.start(); setIsListening(true); }
              catch (error) {
                if (error instanceof DOMException && error.name === 'InvalidStateError') {
                  setIsListening(true); return;
                }
                recognitionEnabledRef.current = false;
                setIsListening(false);
                setShowSimulatedInput(true);
              }
            }
          }, 250);
          return;
        }
        setIsListening(false);
      };
      recognition.onerror = (event: any) => {
        console.warn('[Web SR] error:', event.error);
        if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(event.error)) {
          recognitionEnabledRef.current = false;
          setIsListening(false);
          setShowSimulatedInput(true);
          try { recognitionRef.current?.stop(); } catch (e) { /* ignore */ }
        }
      };
      recognition.onresult = (event: any) => {
        if (!recognitionEnabledRef.current) return;
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
              ayahCompletionHandlerRef.current(nextState.isFlawless);
              return;
            }
            if (currentWordIdxForAltRef.current > beforeIdx) { progressed = true; break; }
          }
          if (progressed) break;
        }
      };
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn('[Web SR] init error:', e);
      setSpeechSupported(false);
    }

    return () => {
      recognitionRequestIdRef.current += 1;
      recognitionEnabledRef.current = false;
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  incomingSpeechHandlerRef.current = handleIncomingSpokenText;

  // ============================================================
  // التعرف الأصلي (Android/iOS)
  // ============================================================
  const listenWithNativeRecognition = async () => {
    if (!nativeRecognitionActiveRef.current) return;
    try {
      const { matches } = await SpeechRecognition.start({
        language: 'ar-SA', maxResults: 3, partialResults: false, popup: false,
      });
      if (!nativeRecognitionActiveRef.current) return;

      if (Date.now() >= cooldownUntilRef.current) {
        const alts = (matches || []).slice(0, 3);
        for (const raw of alts) {
          const text = raw?.trim();
          if (!text) continue;
          const beforeIdx = currentWordIdxForAltRef.current;
          const nextState = incomingSpeechHandlerRef.current(text);
          if (nextState?.completed) {
            ayahCompletionHandlerRef.current(nextState.isFlawless);
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
      const message = String(error?.message || error || '').toLowerCase();
      const isSilenceError =
        message.includes('no match') || message.includes('speech timeout') ||
        message.includes('no speech') || message.includes('timed out');

      if (isSilenceError && nativeRecognitionActiveRef.current) {
        setTimeout(() => {
          if (nativeRecognitionActiveRef.current) void nativeRecognitionRunnerRef.current();
        }, 600);
        return;
      }

      nativeRecognitionActiveRef.current = false;
      recognitionEnabledRef.current = false;
      setIsListening(false);
      setShowSimulatedInput(true);
    }
  };
  nativeRecognitionRunnerRef.current = listenWithNativeRecognition;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let listenerHandle: any = null;
    let cancelled = false;

    const setupListener = async () => {
      try {
        listenerHandle = await SpeechRecognition.addListener(
          'listeningState',
          (data: { status: 'started' | 'stopped' }) => {
            if (cancelled) return;
            if (
              data.status === 'stopped' &&
              nativeRecognitionActiveRef.current &&
              isSurahRecitationModeRef.current
            ) {
              setTimeout(() => {
                if (nativeRecognitionActiveRef.current && isSurahRecitationModeRef.current) {
                  void nativeRecognitionRunnerRef.current();
                }
              }, 300);
            }
          },
        );
      } catch (error) {
        console.warn('[Native SR] addListener failed:', error);
      }
    };
    void setupListener();

    return () => {
      cancelled = true;
      if (listenerHandle) listenerHandle.remove().catch(() => {});
    };
  }, []);

  // ============================================================
  // بدء / إيقاف الاستماع
  // ============================================================
  const startListening = async () => {
    if (isListening) return;
    const requestId = ++recognitionRequestIdRef.current;

    if (ayahCompletionHandledRef.current) {
      resetRecitationState();
      ayahCompletionHandledRef.current = false;
      isAyahCompletedRef.current = false;
      completionLockRef.current = false;
    }
    if (!isSurahRecitationModeRef.current) {
      surahRecitationSummaryRef.current = { completedAyahs: 0, accuratelyMatchedAyahs: 0 };
      setSurahRecitationResult(null);
    }
    isSurahRecitationModeRef.current = true;
    setIsSurahRecitationMode(true);
    setIsListening(true);
    cooldownUntilRef.current = 0;

    if (Capacitor.isNativePlatform()) {
      try {
        const { available } = await SpeechRecognition.available();
        if (requestId !== recognitionRequestIdRef.current) return;
        if (!available) { setSpeechSupported(false); setShowSimulatedInput(true); setIsListening(false); return; }
        let perm = await SpeechRecognition.checkPermissions();
        if (perm.speechRecognition !== 'granted') perm = await SpeechRecognition.requestPermissions();
        if (requestId !== recognitionRequestIdRef.current) return;
        if (perm.speechRecognition !== 'granted') { setShowSimulatedInput(true); setIsListening(false); return; }

        nativeRecognitionActiveRef.current = true;
        recognitionEnabledRef.current = true;
        void listenWithNativeRecognition();
      } catch (error) {
        recognitionEnabledRef.current = false;
        setIsListening(false);
        setShowSimulatedInput(true);
      }
      return;
    }

    if (!speechSupported) { setShowSimulatedInput(true); setIsListening(false); return; }
    if (recognitionRef.current) {
      recognitionEnabledRef.current = true;
      try { recognitionRef.current.start(); setIsListening(true); }
      catch (error) {
        if (error instanceof DOMException && error.name === 'InvalidStateError') {
          setIsListening(true); return;
        }
        recognitionEnabledRef.current = false;
        setIsListening(false);
        setShowSimulatedInput(true);
      }
    } else {
      setIsListening(false);
      setShowSimulatedInput(true);
    }
  };

  const stopListening = async () => {
    recognitionRequestIdRef.current += 1;
    const wasEnabled = recognitionEnabledRef.current;
    recognitionEnabledRef.current = false;
    isSurahRecitationModeRef.current = false;
    setIsSurahRecitationMode(false);
    setIsAyahCompleted(false);
    isAyahCompletedRef.current = false;
    setIsListening(false);

    if (Capacitor.isNativePlatform()) {
      if (nativeRecognitionActiveRef.current) {
        nativeRecognitionActiveRef.current = false;
        try { await SpeechRecognition.stop(); } catch (e) { /* ignore */ }
      }
      return;
    }
    if (recognitionRef.current && wasEnabled) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
    }
  };

  const stopSurahRecitation = async () => {
    await stopListening();
    surahRecitationSummaryRef.current = { completedAyahs: 0, accuratelyMatchedAyahs: 0 };
    setSurahRecitationResult(null);
    ayahCompletionHandledRef.current = false;
    completionLockRef.current = false;
    resetRecitationState();
  };

  const toggleListening = async () => {
    if (isListening) await stopListening();
    else await startListening();
  };

  // ============================================================
  // أدوات مساعدة
  // ============================================================
  const playAyahAudio = () => {
    const url = getAyahAudioUrl(selectedReciter.id, surah.number, currentAyah.numberInSurah);
    if (isPlayingAudio) { stopAudio(); return; }
    playAudio(url, () => { if (mode === 'listen_repeat') void toggleListening(); });
  };

  const handleNextAyah = () => {
    if (currentAyahIndex < surah.ayahs.length - 1) {
      if (isSurahRecitationModeRef.current) void stopSurahRecitation();
      setCurrentAyahIndex((prev) => prev + 1);
    }
  };

  const handlePrevAyah = () => {
    if (currentAyahIndex > 0) {
      if (isSurahRecitationModeRef.current) void stopSurahRecitation();
      setCurrentAyahIndex((prev) => prev - 1);
    }
  };

  const submitSimulatedWord = (wordText: string) => {
    const next = handleIncomingSpokenText(wordText);
    if (next?.completed) handleAyahCompletion(next.isFlawless);
  };

  const giveHint = () => {
    if (currentWordIdx < verseWords.length) {
      setActiveMistakeAlert({
        expected: verseWords[currentWordIdx].original,
        heard: 'تلميح استحضار',
        wordIdx: currentWordIdx,
      });
    }
  };

  const allWordsProcessed = currentWordIdx >= verseWords.length;
  const shouldHideUnrecited = hideUnrecitedWords && isSurahRecitationMode && !allWordsProcessed;

  // ============================================================
  // ✅ الواجهة — h-[50dvh] مع تخطيط flex صارم
  // ============================================================
  return (
    <div
      className="h-[50dvh] max-w-4xl mx-auto flex flex-col bg-stone-100 overflow-hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* ══════════════ الرأس المضغوط ══════════════ */}
      <header className="shrink-0 bg-white border-b border-stone-200 px-3 py-2">
        <div className="flex items-center gap-2">
          {/* اختيار السورة */}
          <select
            value={surah.number}
            onChange={(e) => { void stopSurahRecitation(); onSelectSurahChange(Number(e.target.value)); }}
            className="min-w-0 max-w-[45%] sm:max-w-none bg-stone-50 border border-stone-300 text-stone-900 rounded-lg px-2 py-1.5 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer"
          >
            {allSurahsList.map((s) => (
              <option key={s.number} value={s.number}>
                {s.number}. {s.name}
              </option>
            ))}
          </select>

          {/* مؤشر الآية */}
          <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg text-[11px] sm:text-xs font-medium text-emerald-800 shrink-0">
            <span>{currentAyah.numberInSurah}</span>
            <span className="text-emerald-500">/</span>
            <span>{surah.ayahs.length}</span>
          </div>

          {/* الوضع */}
          <button
            onClick={() => setMode(mode === 'listen_repeat' ? 'karaoke' : 'listen_repeat')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold shrink-0 ${
              mode === 'listen_repeat'
                ? 'bg-emerald-100 text-emerald-900'
                : 'bg-stone-100 text-stone-600'
            }`}
            title="استمع ثم ردّد"
          >
            <Headphones className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">استمع ثم ردّد</span>
          </button>

          {/* التفسير */}
          <button
            onClick={() => onOpenTafsir(currentAyah)}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">تفسير</span>
          </button>
        </div>
      </header>

      {/* ══════════════ منطقة الآية (تتمدد) ══════════════ */}
      <main className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
        {/* شريط الكلمات — يُمرّر داخليًا فقط عند الحاجة */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-6 py-4">
          <div className="flex flex-wrap gap-1.5 text-xl sm:text-2xl leading-[2.2] font-quran">
            {verseWords.map((w, idx) => {
              const isMatched = matchedWords.includes(idx);
              const isFailed = idx in failedWordsRef.current;
              const isCurrent = idx === currentWordIdx && !isAyahCompleted;
              const isHidden = shouldHideUnrecited && !isMatched && !isFailed;

              return (
                <span
                  key={idx}
                  className={`px-1.5 py-0.5 rounded transition-all duration-300 ${
                    isFailed
                      ? 'bg-rose-100 text-rose-700 line-through'
                      : isMatched
                      ? 'bg-emerald-100 text-emerald-800'
                      : isHidden
                      ? `bg-stone-200/70 text-stone-400 blur-[6px] select-none ${
                          isCurrent ? 'ring-2 ring-amber-400' : ''
                        }`
                      : isCurrent
                      ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-400'
                      : 'text-stone-500'
                  }`}
                >
                  {w.original}
                </span>
              );
            })}
          </div>

          {shouldHideUnrecited && (
            <p className="mt-3 text-[11px] text-stone-500 flex items-center gap-1">
              <EyeOff className="w-3 h-3" />
              <span>وضع التسميع من الذاكرة — الكلمات تُكشف عند نطقها</span>
            </p>
          )}
        </div>

        {/* تنبيه الخطأ — Overlay فوق منطقة الآية */}
        {activeMistakeAlert && !isAyahCompleted && (
          <div className="absolute bottom-2 left-2 right-2 sm:left-4 sm:right-4">
            <div className="bg-rose-50 border border-rose-300 rounded-xl p-2.5 shadow-lg" role="alert">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-xs text-rose-800 truncate">
                      {activeMistakeAlert.heard === 'تلميح استحضار'
                        ? 'تلميح'
                        : `الصحيح: ${activeMistakeAlert.expected}`}
                    </span>
                    <button
                      onClick={playAyahAudio}
                      className="flex items-center gap-1 text-[10px] text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded font-semibold shrink-0"
                    >
                      <Volume2 className="w-3 h-3" />
                      <span>استمع</span>
                    </button>
                  </div>
                  {activeMistakeAlert.heard &&
                    activeMistakeAlert.heard !== 'تلميح استحضار' && (
                      <p className="text-[10px] text-stone-500 mt-0.5 truncate">
                        سُمِع: <span className="text-rose-600 font-medium">{activeMistakeAlert.heard}</span>
                      </p>
                    )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* بانر إتمام السورة — Overlay */}
        {surahRecitationResult &&
          isAyahCompleted &&
          currentAyahIndex === surah.ayahs.length - 1 && (
            <div className="absolute inset-2 flex items-center justify-center bg-black/40 rounded-xl backdrop-blur-sm">
              <div className="w-full max-w-sm bg-emerald-50 border border-emerald-300 rounded-2xl p-4 text-center shadow-2xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-1" />
                <p className="font-bold text-emerald-800 text-sm mb-1">ما شاء الله! اكتمل التسميع</p>
                <p className="text-xs text-emerald-700">
                  جودة المطابقة:{' '}
                  <span className="font-bold">
                    {Math.round(
                      (surahRecitationResult.accuratelyMatchedAyahs /
                        surahRecitationResult.completedAyahs) *
                        100,
                    )}
                    %
                  </span>
                </p>
                <p className="mt-1 text-[10px] text-stone-500">
                  التقييم يعتمد على مطابقة النص، ولا يقيّم التجويد.
                </p>
                <button
                  onClick={() => setSurahRecitationResult(null)}
                  className="mt-3 px-4 py-1.5 bg-emerald-700 text-white text-xs font-semibold rounded-lg"
                >
                  إغلاق
                </button>
              </div>
            </div>
          )}
      </main>

      {/* ══════════════ شريط التحكم المضغوط ══════════════ */}
      <footer className="shrink-0 bg-white border-t border-stone-200 px-2 sm:px-4 py-2">
        <div className="flex items-center justify-between gap-1 sm:gap-2">
          {/* اليسار: تنقل */}
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevAyah}
              disabled={currentAyahIndex === 0}
              className="p-2 rounded-lg border border-stone-200 bg-stone-50 text-stone-700 disabled:opacity-30"
              title="السابق"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextAyah}
              disabled={currentAyahIndex === surah.ayahs.length - 1}
              className="p-2 rounded-lg border border-stone-200 bg-stone-50 text-stone-700 disabled:opacity-30"
              title="التالي"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                ayahCompletionHandledRef.current = false;
                completionLockRef.current = false;
                resetRecitationState();
              }}
              className="p-2 rounded-lg border border-stone-200 bg-stone-50 text-stone-600"
              title="إعادة"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* الوسط: زر الميكروفون الضخم */}
          <button
            onClick={toggleListening}
            className={`flex items-center justify-center gap-2 px-5 sm:px-7 py-2.5 rounded-full font-bold text-sm shadow-lg transition-all ${
              isListening
                ? 'bg-rose-600 hover:bg-rose-700 text-white ring-4 ring-rose-200 animate-pulse'
                : 'bg-emerald-700 hover:bg-emerald-800 text-white ring-4 ring-emerald-100'
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="w-5 h-5" />
                <span>إيقاف</span>
              </>
            ) : (
              <>
                <Mic className="w-5 h-5" />
                <span>ابدأ التسميع</span>
              </>
            )}
          </button>

          {/* اليمين: أدوات */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setHideUnrecitedWords(!hideUnrecitedWords)}
              className={`p-2 rounded-lg border ${
                hideUnrecitedWords
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-stone-50 text-stone-600 border-stone-200'
              }`}
              title={hideUnrecitedWords ? 'كشف النص' : 'إخفاء النص'}
            >
              {hideUnrecitedWords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={giveHint}
              className="p-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-700"
              title="تلميح"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            <button
              onClick={playAyahAudio}
              className={`p-2 rounded-lg border ${
                isPlayingAudio
                  ? 'bg-emerald-100 border-emerald-300 text-emerald-800 animate-pulse'
                  : 'bg-stone-50 border-stone-200 text-emerald-600'
              }`}
              title="استمع للشيخ"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* سطر ثانوي صغير: إيقاف السورة + المحاكي */}
        <div className="flex items-center justify-center gap-3 mt-1.5 text-[10px] text-stone-500">
          <button
            onClick={() => void stopSurahRecitation()}
            className="hover:text-rose-600 underline decoration-dotted"
          >
            إيقاف السورة
          </button>
          <span>·</span>
          <button
            onClick={() => setShowSimulatedInput(!showSimulatedInput)}
            className="hover:text-stone-800 underline decoration-dotted"
          >
            {showSimulatedInput ? 'إخفاء المحاكي' : 'محاكي'}
          </button>
        </div>

        {/* المحاكي — Drawer صغير */}
        {showSimulatedInput && (
          <div className="mt-2 pt-2 border-t border-amber-200 flex items-center justify-center gap-2">
            {currentWordIdx < verseWords.length && (
              <button
                onClick={() => submitSimulatedWord(verseWords[currentWordIdx].original)}
                className="bg-emerald-700 text-white text-[10px] font-medium px-2 py-1 rounded"
              >
                نطق: "{verseWords[currentWordIdx].original}"
              </button>
            )}
            <button
              onClick={() => submitSimulatedWord('كلمة_خاطئة')}
              className="bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-medium px-2 py-1 rounded"
            >
              خطأ
            </button>
          </div>
        )}
      </footer>
    </div>
  );
};