import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import {
  Mic,
  MicOff,
  RotateCcw,
  Volume2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  HelpCircle,
  BookOpen,
  Headphones,
  Sparkles,
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
  surah,
  initialAyahNumber = 1,
  selectedReciter,
  onOpenTafsir,
  onStatsUpdate,
  onSelectSurahChange,
  allSurahsList,
}) => {
  const [currentAyahIndex, setCurrentAyahIndex] = useState(() =>
    Math.max(0, Math.min(surah.ayahs.length - 1, initialAyahNumber - 1)),
  );

  const [mode, setMode] = useState<RecitationMode>('karaoke');
  const [isListening, setIsListening] = useState(false);
  const [isSurahRecitationMode, setIsSurahRecitationMode] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(
    () =>
      typeof window !== 'undefined' &&
      !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
  );
  const [showSimulatedInput, setShowSimulatedInput] = useState(false);
  const [surahRecitationResult, setSurahRecitationResult] = useState<{
    completedAyahs: number;
    accuratelyMatchedAyahs: number;
  } | null>(null);

  const recognitionRef = useRef<any>(null);
  const incomingSpeechHandlerRef = useRef<
    (spokenText: string) => { completed: boolean; isFlawless: boolean } | undefined
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

  const currentAyah = surah.ayahs[currentAyahIndex] || surah.ayahs[0];
  // Extract Quran words for current ayah
  const verseWords = useMemo(() => {
    return extractWords(currentAyah.text);
  }, [currentAyah]);
  const {
    currentWordIdx,
    activeMistakeAlert,
    isAyahCompleted,
    setIsAyahCompleted,
    setActiveMistakeAlert,
    completionLockRef,
    handleIncomingSpokenText,
    resetRecitationState,
    failedWordsRef,
  } = useRecitationSession(verseWords);
  const { isPlayingAudio, playAudio, stopAudio } = useAyahAudio();

  function handleAyahCompletion(isFlawless: boolean) {
    if (ayahCompletionHandledRef.current) return;
    ayahCompletionHandledRef.current = true;
    completionLockRef.current = true;

    const isFinalAyah = currentAyahIndex >= surah.ayahs.length - 1;
    if (isSurahRecitationMode) {
      const summary = {
        completedAyahs: surahRecitationSummaryRef.current.completedAyahs + 1,
        accuratelyMatchedAyahs:
          surahRecitationSummaryRef.current.accuratelyMatchedAyahs + (isFlawless ? 1 : 0),
      };
      surahRecitationSummaryRef.current = summary;
      if (isFinalAyah) {
        setSurahRecitationResult(summary);
      }
    }

    setIsAyahCompleted(isFinalAyah);
    isAyahCompletedRef.current = isFinalAyah;
    if (isFinalAyah) {
      const wasWebRecognitionEnabled = recognitionEnabledRef.current;
      isSurahRecitationModeRef.current = false;
      recognitionEnabledRef.current = false;
      setIsSurahRecitationMode(false);
      setIsListening(false);
      if (nativeRecognitionActiveRef.current) {
        nativeRecognitionActiveRef.current = false;
        SpeechRecognition.stop().catch(() => {
          console.warn('Native speech recognition stop failure');
        });
      }
      if (recognitionRef.current) {
        try {
          if (wasWebRecognitionEnabled) recognitionRef.current.stop();
        } catch (error) {
          console.warn('Web speech recognition stop failure', error);
        }
      }
    }

    // Record in Spaced Repetition System
    const mistakesArray = Object.entries(failedWordsRef.current).map(([idx, heard]) => ({
      expectedWord: verseWords[parseInt(idx, 10)]?.original || '',
      recitedWord: heard,
    }));

    recordVerseResult(surah.number, currentAyah.numberInSurah, isFlawless, mistakesArray);

    // Add points & update stats
    const earnedPoints = isFlawless ? 35 : 20;
    addPointsAndVerses(earnedPoints, 1, 30, isFlawless ? 100 : 85);
    onStatsUpdate();

    // Keep the recitation going automatically to the end of the surah.
    if (isSurahRecitationMode) {
      if (currentAyahIndex < surah.ayahs.length - 1) {
        setCurrentAyahIndex((prev) => prev + 1);
        setTimeout(() => {
          if (isSurahRecitationModeRef.current) {
            setIsListening(recognitionEnabledRef.current);
            setIsSurahRecitationMode(true);
            setIsAyahCompleted(false);
            isAyahCompletedRef.current = false;
            ayahCompletionHandledRef.current = false;
            completionLockRef.current = false;
          }
        }, 400);
      }
      return;
    }

    if (isFlawless && currentAyahIndex < surah.ayahs.length - 1) {
      handleNextAyah();
    }
  }

  ayahCompletionHandlerRef.current = handleAyahCompletion;

  useEffect(() => {
    ayahCompletionHandledRef.current = false;
    resetRecitationState();
  }, [currentAyahIndex, surah.number, resetRecitationState]);

  useEffect(() => {
    setCurrentAyahIndex(Math.max(0, Math.min(surah.ayahs.length - 1, initialAyahNumber - 1)));
    setSurahRecitationResult(null);
    surahRecitationSummaryRef.current = { completedAyahs: 0, accuratelyMatchedAyahs: 0 };
    isSurahRecitationModeRef.current = false;
    recognitionEnabledRef.current = false;
    setIsSurahRecitationMode(false);
    setIsListening(false);
  }, [initialAyahNumber, surah.number, surah.ayahs.length]);

  useEffect(() => {
    isSurahRecitationModeRef.current = isSurahRecitationMode;
  }, [isSurahRecitationMode]);

  useEffect(() => {
    isAyahCompletedRef.current = isAyahCompleted;
  }, [isAyahCompleted]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      return () => {
        recognitionRequestIdRef.current += 1;
        recognitionEnabledRef.current = false;
        if (nativeRecognitionActiveRef.current) {
          nativeRecognitionActiveRef.current = false;
          void SpeechRecognition.stop().catch((error) => {
            console.warn('Native speech recognition cleanup stop failed', error);
          });
        }
      };
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'ar-SA'; // Arabic (Saudi Arabia) for Quranic phonetics

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onend = () => {
        if (
          recognitionEnabledRef.current &&
          isSurahRecitationModeRef.current &&
          !isAyahCompletedRef.current
        ) {
          setTimeout(() => {
            if (
              recognitionEnabledRef.current &&
              isSurahRecitationModeRef.current &&
              !isAyahCompletedRef.current
            ) {
              try {
                recognition.start();
                setIsListening(true);
              } catch (error) {
                if (error instanceof DOMException && error.name === 'InvalidStateError') {
                  setIsListening(true);
                  return;
                }
                console.warn('Unable to restart web speech recognition:', error);
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
        console.warn('Speech recognition error:', event.error);
        if (
          event.error === 'not-allowed' ||
          event.error === 'service-not-allowed' ||
          event.error === 'audio-capture' ||
          event.error === 'network'
        ) {
          recognitionEnabledRef.current = false;
          setIsListening(false);
          setShowSimulatedInput(true);
          try {
            recognitionRef.current?.stop();
          } catch (error) {
            console.warn('Unable to stop web speech recognition after an error:', error);
          }
        }
      };

      recognition.onresult = (event: any) => {
        if (!recognitionEnabledRef.current) return;
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const trans = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += trans + ' ';
          }
        }

        if (finalTranscript.trim()) {
          const nextState = incomingSpeechHandlerRef.current(finalTranscript.trim());
          if (nextState?.completed) {
            ayahCompletionHandlerRef.current(nextState.isFlawless);
          }
        }
      };

      recognitionRef.current = recognition;
    } catch (e) {
      console.warn('SpeechRecognition init error:', e);
      setSpeechSupported(false);
    }

    return () => {
      recognitionRequestIdRef.current += 1;
      recognitionEnabledRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  incomingSpeechHandlerRef.current = handleIncomingSpokenText;

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
      if (recognizedText) {
        const nextState = incomingSpeechHandlerRef.current(recognizedText);
        if (nextState?.completed) {
          ayahCompletionHandlerRef.current(nextState.isFlawless);
        }
      }

      if (nativeRecognitionActiveRef.current) {
        setTimeout(() => {
          void nativeRecognitionRunnerRef.current();
        }, 250);
      }
    } catch (error) {
      console.warn('Native speech recognition error:', error);
      nativeRecognitionActiveRef.current = false;
      recognitionEnabledRef.current = false;
      setIsListening(false);
      setShowSimulatedInput(true);
    }
  };

  nativeRecognitionRunnerRef.current = listenWithNativeRecognition;

  const startListening = async () => {
    if (isListening) return;
    const requestId = ++recognitionRequestIdRef.current;
    if (ayahCompletionHandledRef.current) {
      resetRecitationState();
      ayahCompletionHandledRef.current = false;
      isAyahCompletedRef.current = false;
    }
    if (!isSurahRecitationModeRef.current) {
      surahRecitationSummaryRef.current = { completedAyahs: 0, accuratelyMatchedAyahs: 0 };
      setSurahRecitationResult(null);
    }
    isSurahRecitationModeRef.current = true;
    setIsSurahRecitationMode(true);
    setIsListening(true);

    if (Capacitor.isNativePlatform()) {
      try {
        const { available } = await SpeechRecognition.available();
        if (requestId !== recognitionRequestIdRef.current) return;
        if (!available) {
          setSpeechSupported(false);
          setShowSimulatedInput(true);
          setIsListening(false);
          return;
        }

        let permission = await SpeechRecognition.checkPermissions();
        if (permission.speechRecognition !== 'granted') {
          permission = await SpeechRecognition.requestPermissions();
        }
        if (requestId !== recognitionRequestIdRef.current) return;
        if (permission.speechRecognition !== 'granted') {
          setShowSimulatedInput(true);
          setIsListening(false);
          return;
        }

        nativeRecognitionActiveRef.current = true;
        recognitionEnabledRef.current = true;
        setIsListening(true);
        setIsSurahRecitationMode(true);
        void listenWithNativeRecognition();
      } catch (error) {
        console.warn('Native speech recognition setup error:', error);
        recognitionEnabledRef.current = false;
        setIsListening(false);
        setShowSimulatedInput(true);
      }
      return;
    }

    if (!speechSupported) {
      setShowSimulatedInput(true);
      setIsListening(false);
      return;
    }

    setIsSurahRecitationMode(true);
    if (recognitionRef.current) {
      recognitionEnabledRef.current = true;
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'InvalidStateError') {
          setIsListening(true);
          return;
        }
        console.warn('Unable to start web speech recognition:', error);
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
    const wasRecognitionEnabled = recognitionEnabledRef.current;
    recognitionEnabledRef.current = false;
    isSurahRecitationModeRef.current = false;
    setIsSurahRecitationMode(false);
    setIsAyahCompleted(false);
    isAyahCompletedRef.current = false;
    setIsListening(false);

    if (Capacitor.isNativePlatform()) {
      if (nativeRecognitionActiveRef.current) {
        nativeRecognitionActiveRef.current = false;
        try {
          await SpeechRecognition.stop();
        } catch (error) {
          console.warn('Native speech recognition stop failed during manual stop', error);
        }
      }
      return;
    }

    if (recognitionRef.current && wasRecognitionEnabled) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.warn('Web speech recognition stop failed during manual stop', error);
      }
    }
  };

  const stopSurahRecitation = async () => {
    await stopListening();
    surahRecitationSummaryRef.current = { completedAyahs: 0, accuratelyMatchedAyahs: 0 };
    setSurahRecitationResult(null);
    ayahCompletionHandledRef.current = false;
    resetRecitationState();
  };

  const toggleListening = async () => {
    if (isListening) {
      await stopListening();
      return;
    }

    await startListening();
  };

  // Play reference audio by Sheikh Al-Husary / Al-Afasy
  const playAyahAudio = () => {
    const audioUrl = getAyahAudioUrl(selectedReciter.id, surah.number, currentAyah.numberInSurah);

    if (isPlayingAudio) {
      stopAudio();
      return;
    }

    playAudio(audioUrl, () => {
      if (mode === 'listen_repeat') {
        void toggleListening();
      }
    });
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

  // Manual word simulator (for devices where mic is restricted or testing)
  const submitSimulatedWord = (wordText: string) => {
    const nextState = handleIncomingSpokenText(wordText);
    if (nextState?.completed) {
      handleAyahCompletion(nextState.isFlawless);
    }
  };

  // Quick hint
  const giveHint = () => {
    if (currentWordIdx < verseWords.length) {
      const target = verseWords[currentWordIdx];
      setActiveMistakeAlert({
        expected: target.original,
        heard: 'تلميح استحضار',
        wordIdx: currentWordIdx,
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Controller: Surah Picker, Mode, Navigation */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Surah Selector & Ayah Index */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              value={surah.number}
              onChange={(e) => {
                void stopSurahRecitation();
                onSelectSurahChange(Number(e.target.value));
              }}
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
              <span className="font-bold text-emerald-800 text-sm">
                {currentAyah.numberInSurah}
              </span>
              <span>من</span>
              <span>{surah.ayahs.length}</span>
            </div>
          </div>

          {/* Reference audio mode */}
          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl w-full sm:w-auto justify-center">
            <button
              onClick={() => setMode(mode === 'listen_repeat' ? 'karaoke' : 'listen_repeat')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                mode === 'listen_repeat'
                  ? 'bg-white text-emerald-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
              title="الشيخ يقرأ أولاً ثم يفتح لك الميكروفون لتردد بعده وتصحح"
            >
              <Headphones className="w-3.5 h-3.5 text-emerald-600" />
              <span>استمع ثم ردّد</span>
            </button>
          </div>

          {/* Tafsir Quick Action */}
          <button
            onClick={() => onOpenTafsir(currentAyah)}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>التفسير الميسر</span>
          </button>
        </div>
      </div>

      {/* Main Recitation Arena */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden relative">
        {/* Top Header of Ayah Box */}
        <div className="px-6 py-4 bg-stone-50 border-b border-stone-100 flex items-center justify-between text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stone-800">
              سورة {surah.name} ({surah.revelationType})
            </span>
            <span>·</span>
            <span>الجزء {currentAyah.juz}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={giveHint}
              className="flex items-center gap-1 text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 px-2 py-1 rounded-md text-[11px] transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
              <span>تلميح</span>
            </button>
          </div>
        </div>

        <div className="flex min-h-56 items-center justify-center bg-stone-50 px-4 py-8">
          {/* Active Error Detection / Correction Alert */}
          {activeMistakeAlert && !isAyahCompleted && (
            <div
              className="w-full max-w-lg bg-rose-50 border border-rose-200 rounded-2xl p-4 text-right shadow-xs animate-in fade-in slide-in-from-bottom-2"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5 text-xs text-rose-900 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-rose-800">
                      {activeMistakeAlert.heard === 'تلميح استحضار'
                        ? 'تلميح للكلمة التالية'
                        : 'كلمة غير صحيحة'}
                    </span>
                    <button
                      onClick={playAyahAudio}
                      className="flex items-center gap-1 text-[11px] text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-1 rounded-md font-semibold transition-colors"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>استمع للفظ الصحيح</span>
                    </button>
                  </div>

                  <p className="text-stone-600">
                    الكلمة الصحيحة:{' '}
                    <span className="font-quran text-lg font-bold text-emerald-800 px-1">
                      {activeMistakeAlert.expected}
                    </span>
                  </p>

                  {activeMistakeAlert.heard && activeMistakeAlert.heard !== 'تلميح استحضار' && (
                    <p className="text-stone-500 text-[11px]">
                      ما سُمِع:{' '}
                      <span className="text-rose-600 font-medium">{activeMistakeAlert.heard}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Ayah Completion Banner */}
          {surahRecitationResult &&
            isAyahCompleted &&
            currentAyahIndex === surah.ayahs.length - 1 && (
              <div className="mt-6 w-full max-w-md bg-emerald-50 border border-emerald-300 rounded-2xl p-4 text-center shadow-xs animate-in zoom-in-95">
                <div className="flex items-center justify-center gap-2 text-emerald-800 font-bold text-base mb-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>ما شاء الله! اكتمل التسميع</span>
                </div>
                <p className="text-sm font-bold text-emerald-800">
                  جودة مطابقة الكلمات:{' '}
                  {Math.round(
                    (surahRecitationResult.accuratelyMatchedAyahs /
                      surahRecitationResult.completedAyahs) *
                      100,
                  )}
                  %
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  {surahRecitationResult.accuratelyMatchedAyahs} من{' '}
                  {surahRecitationResult.completedAyahs} آية طوبقت كلماتها دون أخطاء متبقية.
                </p>
                <p className="mt-2 text-[11px] text-stone-600">
                  التقييم يعتمد على مطابقة النص عبر التعرّف الصوتي، ولا يقيّم أحكام التجويد.
                </p>
              </div>
            )}
        </div>

        {/* Bottom Recitation Control Dock */}
        <div className="bg-stone-50 px-6 py-4 border-t border-stone-200 flex flex-wrap items-center justify-between gap-4">
          {/* Navigation: Prev / Next Ayah */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevAyah}
              disabled={currentAyahIndex === 0}
              className="p-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="الآية السابقة"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <button
              onClick={handleNextAyah}
              disabled={currentAyahIndex === surah.ayahs.length - 1}
              className="p-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="الآية التالية"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                ayahCompletionHandledRef.current = false;
                resetRecitationState();
              }}
              className="p-2.5 rounded-xl border border-stone-200 bg-white text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
              title="إعادة تسميع هذه الآية"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>

          {/* Center Main Action: Microphone Recitation Button */}
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <button
              onClick={toggleListening}
              className={`relative flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm shadow-md transition-all cursor-pointer ${
                isListening
                  ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse ring-4 ring-rose-200'
                  : 'bg-emerald-700 hover:bg-emerald-800 text-white ring-4 ring-emerald-100'
              }`}
            >
              {isListening ? (
                <>
                  <MicOff className="w-5 h-5" />
                  <span>جارٍ الاستماع... انقر للإيقاف</span>
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5" />
                  <span>ابدأ تسميع السورة</span>
                </>
              )}
            </button>
            {!isListening && (
              <span className="w-full text-center text-[11px] text-stone-500">
                ينتقل تلقائيًا بين الآيات حتى نهاية السورة.
              </span>
            )}

            <button
              onClick={() => void stopSurahRecitation()}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 font-semibold text-xs transition-colors"
              title="إيقاف السورة الحالية"
            >
              <MicOff className="w-4 h-4 text-rose-600" />
              <span>إيقاف السورة</span>
            </button>

            {/* Reference Audio Player (Sheikh Al-Husary / Al-Afasy) */}
            <button
              onClick={playAyahAudio}
              className={`flex items-center gap-1.5 px-4 py-3 rounded-xl border font-semibold text-xs transition-colors cursor-pointer ${
                isPlayingAudio
                  ? 'bg-emerald-100 border-emerald-300 text-emerald-800 animate-pulse'
                  : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100'
              }`}
              title="استمع لتلاوة الشيخ للآية"
            >
              <Volume2 className="w-4 h-4 text-emerald-600" />
              <span className="hidden sm:inline">
                {isPlayingAudio
                  ? 'جارٍ التشغيل...'
                  : `استمع (${selectedReciter.name.split(' ')[1] || 'القارئ'})`}
              </span>
            </button>
          </div>

          {/* Simulated / Fallback Mode Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSimulatedInput(!showSimulatedInput)}
              className="text-xs text-stone-500 hover:text-stone-800 underline decoration-dotted"
            >
              {showSimulatedInput ? 'إخفاء محاكي التسميع' : 'محاكي التسميع والكلمات'}
            </button>
          </div>
        </div>

        {/* Fallback Simulator Drawer (Allows testing or practicing without microphone) */}
        {showSimulatedInput && (
          <div className="bg-amber-50/70 border-t border-amber-200 p-4 text-xs text-amber-950">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="font-bold">محاكي التسميع التفاعلي:</span>
                <p className="text-stone-600 text-[11px]">
                  انقر على الكلمة التالية لنطقها، أو اكتب ما تحفظه للتحقق الفوري.
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {currentWordIdx < verseWords.length && (
                  <button
                    onClick={() => submitSimulatedWord(verseWords[currentWordIdx].original)}
                    className="bg-emerald-700 text-white font-medium px-3 py-1.5 rounded-lg text-xs hover:bg-emerald-800 transition-colors shadow-xs"
                  >
                    نطق كلمة: "{verseWords[currentWordIdx].original}"
                  </button>
                )}

                <button
                  onClick={() => submitSimulatedWord('كلمة_خاطئة')}
                  className="bg-rose-100 text-rose-800 border border-rose-300 font-medium px-2.5 py-1.5 rounded-lg text-xs hover:bg-rose-200 transition-colors"
                >
                  اختبار خطأ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Memorization Tips Card */}
      <div className="bg-stone-50 rounded-2xl border border-stone-200/80 p-4 sm:p-5 flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-emerald-700" />
        </div>
        <div className="space-y-1 text-xs text-stone-600">
          <span className="font-bold text-stone-900 text-sm">
            نصيحة إتقان الحفظ: التكرار المتباعد والتصحيح الفوري
          </span>
          <p>
            تسميع الآية غيباً بالصوت ينشّط الذاكرة السمعية والبصرية. عند التردد في أي كلمة، استمع
            للشيخ الحصري لتثبيت النطق السليم ومخارج الحروف الصحيحة.
          </p>
        </div>
      </div>
    </div>
  );
};
