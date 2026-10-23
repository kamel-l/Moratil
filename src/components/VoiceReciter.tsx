import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import {
  Mic, MicOff, RotateCcw, Volume2, CheckCircle2, AlertCircle,
  ChevronRight, ChevronLeft, HelpCircle, BookOpen, Headphones, Sparkles,
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
  const [surahRecitationResult, setSurahRecitationResult] = useState<{
    completedAyahs: number; accuratelyMatchedAyahs: number;
  } | null>(null);

  // ============ Refs ============
  const recognitionRef = useRef<any>(null);
  const incomingSpeechHandlerRef = useRef<
    (text: string) => { completed: boolean; isFlawless: boolean } | undefined
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
  // ✅ حاجز زمني قصير لمنع تسرّب نهاية الآية السابقة إلى الآية الجديدة
  const cooldownUntilRef = useRef(0);
  // ✅ مرجع لدالة التشغيل الأصلي لتفادي الاعتماد على إعادة الرسم
  const nativeListeningStateHandlerRef = useRef<() => void>(() => {});

  const currentAyah = surah.ayahs[currentAyahIndex] || surah.ayahs[0];
  const verseWords = useMemo(() => extractWords(currentAyah.text), [currentAyah]);

  const {
    currentWordIdx, activeMistakeAlert, isAyahCompleted, setIsAyahCompleted,
    setActiveMistakeAlert, completionLockRef, handleIncomingSpokenText,
    resetRecitationState, failedWordsRef,
  } = useRecitationSession(verseWords);

  const { isPlayingAudio, playAudio, stopAudio } = useAyahAudio();

  // ============================================================
  // ✅ معالج إتمام الآية — التعرف لا يتوقف بين الآيات (ويب + أندرويد)
  // ============================================================
  function handleAyahCompletion(isFlawless: boolean) {
    if (ayahCompletionHandledRef.current) return;
    ayahCompletionHandledRef.current = true;
    completionLockRef.current = true;
    isAyahCompletedRef.current = true;

    const isFinalAyah = currentAyahIndex >= surah.ayahs.length - 1;
    const shouldContinueSurah = isSurahRecitationModeRef.current;

    console.log('[AyahComplete]', {
      ayah: currentAyah.numberInSurah,
      isFlawless, isFinalAyah, shouldContinueSurah,
    });

    // ① تراكم ملخص السورة
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

    // ② تسجيل النتيجة + النقاط
    const mistakesArray = Object.entries(failedWordsRef.current).map(([idx, heard]) => ({
      expectedWord: verseWords[parseInt(idx, 10)]?.original || '',
      recitedWord: heard,
    }));
    recordVerseResult(surah.number, currentAyah.numberInSurah, isFlawless, mistakesArray);
    addPointsAndVerses(isFlawless ? 35 : 20, 1, 30, isFlawless ? 100 : 85);
    onStatsUpdate();

    // ③ الانتقال للآية التالية
    if (shouldContinueSurah) {
      if (isFinalAyah) {
        // آخر آية → إيقاف نهائي
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
        // ✅ آية عادية → لا توقف التعرف. فقط cooldown قصير
        cooldownUntilRef.current = Date.now() + 500;
        setCurrentAyahIndex((prev) => prev + 1);
      }
      return;
    }

    // وضع الآية الواحدة: إيقاف + انتقال فقط عند الإتقان
    if (isFlawless && !isFinalAyah) {
      handleNextAyah();
    }
  }

  ayahCompletionHandlerRef.current = handleAyahCompletion;

  // ============================================================
  // ✅ useEffect: تصفير الحالة فقط عند تغيير الآية
  // ============================================================
  useEffect(() => {
    console.log('[AyahTransition] new index:', currentAyahIndex);

    ayahCompletionHandledRef.current = false;
    isAyahCompletedRef.current = false;
    completionLockRef.current = false;
    resetRecitationState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAyahIndex, surah.number]);

  // ============================================================
  // useEffect: عند تغيير السورة أو الآية الأولية
  // ============================================================
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
      recognition.lang = 'ar-SA';

      recognition.onstart = () => {
        console.log('[Web SR] onstart');
        if (recognitionEnabledRef.current) setIsListening(true);
      };

      recognition.onend = () => {
        console.log('[Web SR] onend, enabled?', recognitionEnabledRef.current);
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
        if (Date.now() < cooldownUntilRef.current) {
          console.log('[Web SR] cooldown — ignored');
          return;
        }

        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          }
        }
        if (finalTranscript.trim()) {
          console.log('[Web SR] heard:', finalTranscript.trim());
          const nextState = incomingSpeechHandlerRef.current(finalTranscript.trim());
          if (nextState?.completed) {
            ayahCompletionHandlerRef.current(nextState.isFlawless);
          }
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
  // ✅ التعرف الأصلي على Android/iOS — استمرارية مع معالجة أخطاء الصمت
  // ============================================================
  const listenWithNativeRecognition = async () => {
    if (!nativeRecognitionActiveRef.current) return;

    try {
      const { matches } = await SpeechRecognition.start({
        language: 'ar-SA',
        maxResults: 1,
        partialResults: false,
        popup: false,
      });

      if (!nativeRecognitionActiveRef.current) return;

      const recognizedText = matches?.[0]?.trim();
      if (recognizedText && Date.now() >= cooldownUntilRef.current) {
        console.log('[Native SR] heard:', recognizedText);
        const nextState = incomingSpeechHandlerRef.current(recognizedText);
        if (nextState?.completed) {
          ayahCompletionHandlerRef.current(nextState.isFlawless);
        }
      }

      // ✅ استمر في الحلقة طالما المشغل نشط
      if (nativeRecognitionActiveRef.current) {
        setTimeout(() => {
          if (nativeRecognitionActiveRef.current) {
            void nativeRecognitionRunnerRef.current();
          }
        }, 250);
      }
    } catch (error: any) {
      const message = String(error?.message || error || '').toLowerCase();
      console.warn('[Native SR] error:', message);

      // ✅ لا تعطّل المشغل عند أخطاء الصمت — أعد المحاولة
      const isSilenceError =
        message.includes('no match') ||
        message.includes('speech timeout') ||
        message.includes('no speech') ||
        message.includes('error_no_match') ||
        message.includes('timed out');

      if (isSilenceError && nativeRecognitionActiveRef.current) {
        setTimeout(() => {
          if (nativeRecognitionActiveRef.current) {
            void nativeRecognitionRunnerRef.current();
          }
        }, 800);
        return;
      }

      // أخطاء حقيقية (أذونات، شبكة، إلخ) → عطّل المشغل
      nativeRecognitionActiveRef.current = false;
      recognitionEnabledRef.current = false;
      setIsListening(false);
      setShowSimulatedInput(true);
    }
  };
  nativeRecognitionRunnerRef.current = listenWithNativeRecognition;

  // ============================================================
  // ✅ مستمع listeningState على Android/iOS — إعادة تشغيل تلقائية
  // ============================================================
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
            console.log('[Native SR] listeningState:', data.status);

            if (
              data.status === 'stopped' &&
              nativeRecognitionActiveRef.current &&
              isSurahRecitationModeRef.current
            ) {
              setTimeout(() => {
                if (
                  nativeRecognitionActiveRef.current &&
                  isSurahRecitationModeRef.current
                ) {
                  void nativeRecognitionRunnerRef.current();
                }
              }, 300);
            }
          },
        );
      } catch (error) {
        console.warn('[Native SR] addListener listeningState failed:', error);
      }
    };

    void setupListener();

    return () => {
      cancelled = true;
      if (listenerHandle) {
        listenerHandle.remove().catch(() => {});
      }
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
        console.warn('Native setup error:', error);
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

  // ============================================================
  // الواجهة
  // ============================================================
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* الشريط العلوي */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              value={surah.number}
              onChange={(e) => { void stopSurahRecitation(); onSelectSurahChange(Number(e.target.value)); }}
              className="min-w-0 flex-1 sm:flex-initial bg-stone-50 border border-stone-300 text-stone-900 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer"
            >
              {allSurahsList.map((s) => (
                <option key={s.number} value={s.number}>
                  {s.number}. سورة {s.name} ({s.numberOfAyahs} آيات)
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1 bg-stone-100 px-3 py-1.5 rounded-lg text-xs font-medium text-stone-700">
              <span>الآية</span>
              <span className="font-bold text-emerald-800 text-sm">{currentAyah.numberInSurah}</span>
              <span>من</span><span>{surah.ayahs.length}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl w-full sm:w-auto justify-center">
            <button
              onClick={() => setMode(mode === 'listen_repeat' ? 'karaoke' : 'listen_repeat')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                mode === 'listen_repeat' ? 'bg-white text-emerald-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Headphones className="w-3.5 h-3.5 text-emerald-600" />
              <span>استمع ثم ردّد</span>
            </button>
          </div>

          <button
            onClick={() => onOpenTafsir(currentAyah)}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" /><span>التفسير الميسر</span>
          </button>
        </div>
      </div>

      {/* ساحة التسميع */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden relative">
        <div className="px-6 py-4 bg-stone-50 border-b border-stone-100 flex items-center justify-between text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stone-800">سورة {surah.name} ({surah.revelationType})</span>
            <span>·</span><span>الجزء {currentAyah.juz}</span>
          </div>
          <button onClick={giveHint} className="flex items-center gap-1 text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 px-2 py-1 rounded-md text-[11px]">
            <HelpCircle className="w-3.5 h-3.5 text-amber-600" /><span>تلميح</span>
          </button>
        </div>

        <div className="flex min-h-56 items-center justify-center bg-stone-50 px-4 py-8">
          {activeMistakeAlert && !isAyahCompleted && (
            <div className="w-full max-w-lg bg-rose-50 border border-rose-200 rounded-2xl p-4 text-right shadow-xs" role="alert">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5 text-xs text-rose-900 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-rose-800">
                      {activeMistakeAlert.heard === 'تلميح استحضار' ? 'تلميح للكلمة التالية' : 'كلمة غير صحيحة'}
                    </span>
                    <button onClick={playAyahAudio} className="flex items-center gap-1 text-[11px] text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-1 rounded-md font-semibold">
                      <Volume2 className="w-3.5 h-3.5" /><span>استمع للفظ الصحيح</span>
                    </button>
                  </div>
                  <p className="text-stone-600">
                    الكلمة الصحيحة:{' '}
                    <span className="font-quran text-lg font-bold text-emerald-800 px-1">{activeMistakeAlert.expected}</span>
                  </p>
                  {activeMistakeAlert.heard && activeMistakeAlert.heard !== 'تلميح استحضار' && (
                    <p className="text-stone-500 text-[11px]">
                      ما سُمِع: <span className="text-rose-600 font-medium">{activeMistakeAlert.heard}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {surahRecitationResult && isAyahCompleted && currentAyahIndex === surah.ayahs.length - 1 && (
            <div className="mt-6 w-full max-w-md bg-emerald-50 border border-emerald-300 rounded-2xl p-4 text-center shadow-xs">
              <div className="flex items-center justify-center gap-2 text-emerald-800 font-bold text-base mb-1">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" /><span>ما شاء الله! اكتمل التسميع</span>
              </div>
              <p className="text-sm font-bold text-emerald-800">
                جودة مطابقة الكلمات:{' '}
                {Math.round((surahRecitationResult.accuratelyMatchedAyahs / surahRecitationResult.completedAyahs) * 100)}%
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                {surahRecitationResult.accuratelyMatchedAyahs} من {surahRecitationResult.completedAyahs} آية طوبقت دون أخطاء.
              </p>
              <p className="mt-2 text-[11px] text-stone-600">
                التقييم يعتمد على مطابقة النص عبر التعرّف الصوتي، ولا يقيّم أحكام التجويد.
              </p>
            </div>
          )}
        </div>

        <div className="bg-stone-50 px-6 py-4 border-t border-stone-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button onClick={handlePrevAyah} disabled={currentAyahIndex === 0}
              className="p-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronRight className="w-5 h-5" />
            </button>
            <button onClick={handleNextAyah} disabled={currentAyahIndex === surah.ayahs.length - 1}
              className="p-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={() => {
              ayahCompletionHandledRef.current = false;
              completionLockRef.current = false;
              resetRecitationState();
            }} className="p-2.5 rounded-xl border border-stone-200 bg-white text-stone-600 hover:text-stone-900 hover:bg-stone-100">
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-center">
            <button onClick={toggleListening}
              className={`relative flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm shadow-md transition-all cursor-pointer ${
                isListening
                  ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse ring-4 ring-rose-200'
                  : 'bg-emerald-700 hover:bg-emerald-800 text-white ring-4 ring-emerald-100'
              }`}>
              {isListening ? (<><MicOff className="w-5 h-5" /><span>جارٍ الاستماع... انقر للإيقاف</span></>)
                : (<><Mic className="w-5 h-5" /><span>ابدأ تسميع السورة</span></>)}
            </button>
            {!isListening && (
              <span className="w-full text-center text-[11px] text-stone-500">ينتقل تلقائيًا بين الآيات حتى نهاية السورة.</span>
            )}
            <button onClick={() => void stopSurahRecitation()}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 font-semibold text-xs">
              <MicOff className="w-4 h-4 text-rose-600" /><span>إيقاف السورة</span>
            </button>
            <button onClick={playAyahAudio}
              className={`flex items-center gap-1.5 px-4 py-3 rounded-xl border font-semibold text-xs transition-colors cursor-pointer ${
                isPlayingAudio ? 'bg-emerald-100 border-emerald-300 text-emerald-800 animate-pulse'
                  : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100'
              }`}>
              <Volume2 className="w-4 h-4 text-emerald-600" />
              <span className="hidden sm:inline">
                {isPlayingAudio ? 'جارٍ التشغيل...' : `استمع (${selectedReciter.name.split(' ')[1] || 'القارئ'})`}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setShowSimulatedInput(!showSimulatedInput)}
              className="text-xs text-stone-500 hover:text-stone-800 underline decoration-dotted">
              {showSimulatedInput ? 'إخفاء محاكي التسميع' : 'محاكي التسميع والكلمات'}
            </button>
          </div>
        </div>

        {showSimulatedInput && (
          <div className="bg-amber-50/70 border-t border-amber-200 p-4 text-xs text-amber-950">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="font-bold">محاكي التسميع التفاعلي:</span>
                <p className="text-stone-600 text-[11px]">انقر على الكلمة التالية لنطقها، أو اكتب ما تحفظه للتحقق الفوري.</p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {currentWordIdx < verseWords.length && (
                  <button onClick={() => submitSimulatedWord(verseWords[currentWordIdx].original)}
                    className="bg-emerald-700 text-white font-medium px-3 py-1.5 rounded-lg text-xs hover:bg-emerald-800">
                    نطق كلمة: "{verseWords[currentWordIdx].original}"
                  </button>
                )}
                <button onClick={() => submitSimulatedWord('كلمة_خاطئة')}
                  className="bg-rose-100 text-rose-800 border border-rose-300 font-medium px-2.5 py-1.5 rounded-lg text-xs hover:bg-rose-200">
                  اختبار خطأ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-stone-50 rounded-2xl border border-stone-200/80 p-4 sm:p-5 flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-emerald-700" />
        </div>
        <div className="space-y-1 text-xs text-stone-600">
          <span className="font-bold text-stone-900 text-sm">نصيحة إتقان الحفظ: التكرار المتباعد والتصحيح الفوري</span>
          <p>تسميع الآية غيباً بالصوت ينشّط الذاكرة السمعية والبصرية. عند التردد في أي كلمة، استمع للشيخ لتثبيت النطق السليم.</p>
        </div>
      </div>
    </div>
  );
};