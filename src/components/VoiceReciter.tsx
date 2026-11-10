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
import { Surah, Ayah, Reciter, RiwayahKey } from '../types/quran';
import { extractWords } from '../utils/arabicUtils';
import { getAyahAudioUrl } from '../utils/audioReciters';
import { recordVerseResult, addPointsAndVerses } from '../services/storageService';
import { useRecitationSession } from '../hooks/useRecitationSession';
import { useAyahAudio } from '../hooks/useAyahAudio';
import { RIWAYAT, riwayahFontFamily } from '../data/riwayahConfig';
import { getAyahPages } from '../data/mushafPages';
import {
  buildAyahUnits,
  findUnitIndexForAyah,
  unitLabel,
  DisplayUnit,
} from '../utils/displayUnits';
import { DisplayUnitControl } from './ui/DisplayUnitControl';

interface VoiceReciterProps {
  surah: Surah;
  initialAyahNumber?: number;
  selectedReciter: Reciter;
  riwayah: RiwayahKey;
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
  riwayah,
  onOpenTafsir,
  onStatsUpdate,
  onSelectSurahChange,
  allSurahsList,
}) => {
  const [currentAyahIndex, setCurrentAyahIndex] = useState(() =>
    Math.max(0, Math.min(surah.ayahs.length - 1, initialAyahNumber - 1)),
  );

  const [unit, setUnit] = useState<DisplayUnit>(1);
  const [pages, setPages] = useState<number[] | null>(null);

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
    (spokenText: string, alternatives?: string[]) => { completed: boolean; isFlawless: boolean } | undefined
  >(() => undefined);
  const previewSpeechHandlerRef = useRef<(interimText: string) => void>(() => {});
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

  // Mushaf page numbers are only needed for the "full page" navigation unit.
  useEffect(() => {
    let isMounted = true;
    setPages(null);
    getAyahPages(surah.number, riwayah)
      .then((data) => {
        if (isMounted) setPages(data);
      })
      .catch(() => {
        if (isMounted) setPages(null);
      });
    return () => {
      isMounted = false;
    };
  }, [surah.number, riwayah]);

  const units = useMemo(
    () => buildAyahUnits(surah.ayahs.length, unit, pages ?? undefined),
    [surah.ayahs.length, unit, pages],
  );

  const currentUnitIndex = findUnitIndexForAyah(units, currentAyahIndex);
  const {
    currentWordIdx,
    matchedWords,
    failedWords,
    activeMistakeAlert,
    isAyahCompleted,
    previewWordIdx,
    setIsAyahCompleted,
    setActiveMistakeAlert,
    setPreviewWordIdx,
    completionLockRef,
    handleIncomingSpokenText,
    previewSpokenText,
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

    recordVerseResult(
      surah.number,
      currentAyah.numberInSurah,
      isFlawless,
      mistakesArray,
      riwayah,
    );

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
      recognition.maxAlternatives = 3; // Ask for extra candidates to recover misheard words
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
        let interimTranscript = '';
        const alternatives: string[] = [];

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          const trans = result[0]?.transcript ?? '';
          if (result.isFinal) {
            finalTranscript += trans + ' ';
            for (let k = 1; k < result.length; k += 1) {
              const alt = result[k]?.transcript?.trim();
              if (alt) alternatives.push(alt);
            }
          } else {
            interimTranscript += trans + ' ';
          }
        }

        // Interim results give instant visual progress while the user is speaking.
        if (interimTranscript.trim()) {
          previewSpeechHandlerRef.current(interimTranscript.trim());
        }

        if (finalTranscript.trim()) {
          const nextState = incomingSpeechHandlerRef.current(
            finalTranscript.trim(),
            alternatives,
          );
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
  previewSpeechHandlerRef.current = previewSpokenText;

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

      const recognizedText = matches?.[0]?.trim();
      if (recognizedText) {
        const alternatives = (matches ?? []).slice(1).filter((match) => match && match.trim());
        const nextState = incomingSpeechHandlerRef.current(recognizedText, alternatives);
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
    setPreviewWordIdx(null);

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

  const goToAyahIndex = (targetIndex: number) => {
    const clamped = Math.max(0, Math.min(surah.ayahs.length - 1, targetIndex));
    if (clamped === currentAyahIndex) return;
    if (isSurahRecitationModeRef.current) void stopSurahRecitation();
    setCurrentAyahIndex(clamped);
  };

  // Recitation keeps advancing ayah by ayah so word matching stays per-ayah.
  const handleNextAyah = () => goToAyahIndex(currentAyahIndex + 1);

  // Manual navigation follows the selected display unit (1 / 3 / 5 / full page).
  const handleNextUnit = () => {
    const nextUnit = units[currentUnitIndex + 1];
    if (nextUnit) goToAyahIndex(nextUnit.startIndex);
  };

  const handlePrevUnit = () => {
    const prevUnit = units[currentUnitIndex - 1];
    if (prevUnit) goToAyahIndex(prevUnit.startIndex);
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
      <div className="glass-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Surah Selector & Ayah Index */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              value={surah.number}
              onChange={(e) => {
                void stopSurahRecitation();
                onSelectSurahChange(Number(e.target.value));
              }}
              style={{ colorScheme: 'dark' }}
              className="min-w-0 flex-1 sm:flex-initial bg-white/5 border border-white/15 text-white rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-gold-400 cursor-pointer"
            >
              {allSurahsList.map((s) => (
                <option key={s.number} value={s.number} className="bg-jade-900 text-white">
                  {s.number}. سورة {s.name} ({s.numberOfAyahs} آيات)
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 bg-white/5 px-3 py-1.5 rounded-lg text-xs font-medium text-jade-100/80">
              <span>الآية</span>
              <span className="font-bold text-gold-300 text-sm">
                {currentAyah.numberInSurah}
              </span>
              <span>من</span>
              <span>{surah.ayahs.length}</span>
            </div>
          </div>

          {/* Reference audio mode */}
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl w-full sm:w-auto justify-center">
            <button
              onClick={() => setMode(mode === 'listen_repeat' ? 'karaoke' : 'listen_repeat')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                mode === 'listen_repeat'
                  ? 'bg-white/10 text-gold-300 shadow-xs'
                  : 'text-jade-100/60 hover:text-white'
              }`}
              title="الشيخ يقرأ أولاً ثم يفتح لك الميكروفون لتردد بعده وتصحح"
            >
              <Headphones className="w-3.5 h-3.5 text-gold-300" />
              <span>استمع ثم ردّد</span>
            </button>
          </div>

          {/* Tafsir Quick Action */}
          <button
            onClick={() => onOpenTafsir(currentAyah)}
            className="flex items-center gap-1.5 text-xs font-medium text-gold-300 hover:text-gold-200 bg-white/5 hover:bg-white/10 border border-gold-400/30 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>التفسير الميسر</span>
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <DisplayUnitControl value={unit} onChange={setUnit} />
          <span className="text-[11px] font-semibold text-jade-100/70">
            وحدة التنقّل: {unitLabel(units[currentUnitIndex])}
            <span className="text-jade-100/45">
              {' '}
              · {currentUnitIndex + 1}/{units.length}
            </span>
          </span>
        </div>
      </div>

      {/* Main Recitation Arena */}
      <div className="glass-panel rounded-3xl overflow-hidden relative">
        {/* Top Header of Ayah Box */}
        <div className="px-6 py-4 bg-white/5 border-b border-white/10 flex items-center justify-between text-xs text-jade-100/60">
          <div className="flex items-center gap-2">
            <span className="font-semibold font-display text-jade-100/80">
              سورة {surah.name} ({surah.revelationType})
            </span>
            <span>·</span>
            <span>الجزء {currentAyah.juz}</span>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-gold-200 bg-gold-400/10 border border-gold-400/30 px-2 py-0.5 rounded-md">
              رواية {RIWAYAT[riwayah].label}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={giveHint}
              className="flex items-center gap-1 text-jade-100/70 hover:text-white hover:bg-white/10 px-2 py-1 rounded-md text-[11px] transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-gold-200" />
              <span>تلميح</span>
            </button>
          </div>
        </div>

        <div className="flex min-h-56 flex-col items-center justify-center gap-5 bg-white/5 px-4 py-8">
          {/* Live word-by-word progress. Letters stay hidden to preserve blind recitation. */}
          {verseWords.length > 0 && (
            <div className="w-full max-w-md space-y-3">
              <div className="flex items-center justify-center gap-4 text-[11px] font-medium">
                <span className="flex items-center gap-1 text-jade-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-gold-300" />
                  متقن: {matchedWords.length}
                </span>
                <span className="flex items-center gap-1 text-rose-300">
                  <AlertCircle className="w-3.5 h-3.5" />
                  خطأ: {Object.keys(failedWords).length}
                </span>
                <span className="text-jade-100/60">
                  المتبقي: {Math.max(0, verseWords.length - currentWordIdx)}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-1.5" dir="rtl">
                {verseWords.map((word) => {
                  const isMatched = matchedWords.includes(word.index);
                  const isFailed = failedWords[word.index] !== undefined;
                  const isCurrent = word.index === currentWordIdx && !isAyahCompleted;
                  const isPreview =
                    previewWordIdx !== null &&
                    word.index < previewWordIdx &&
                    !isMatched &&
                    !isFailed;

                  let tone = 'bg-white/10 border-white/10';
                  if (isFailed) tone = 'bg-rose-500/60 border-rose-400/50';
                  else if (isMatched) tone = 'bg-jade-500/60 border-jade-400/50';
                  if (isPreview) tone = 'bg-gold-400/40 border-gold-400/40';
                  if (isCurrent) tone = 'bg-gold-400 border-gold-400';

                  return (
                    <span
                      key={word.index}
                      className={`h-4 w-4 rounded-md border transition-all duration-200 ${tone} ${
                        isCurrent ? 'scale-125 animate-pulse' : ''
                      }`}
                      title={
                        isFailed
                          ? `كلمة ${word.index + 1}: ${failedWords[word.index]}`
                          : `كلمة ${word.index + 1}`
                      }
                    />
                  );
                })}
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gold-400 transition-all duration-300"
                  style={{
                    width: `${
                      verseWords.length
                        ? Math.round((currentWordIdx / verseWords.length) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Active Error Detection / Correction Alert */}
          {activeMistakeAlert && !isAyahCompleted && (
            <div
              className="w-full max-w-lg bg-rose-500/15 border border-rose-400/30 rounded-2xl p-4 text-right shadow-xs animate-in fade-in slide-in-from-bottom-2"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" />
                <div className="space-y-1.5 text-xs text-rose-200 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-rose-200">
                      {activeMistakeAlert.heard === 'تلميح استحضار'
                        ? 'تلميح للكلمة التالية'
                        : 'كلمة غير صحيحة'}
                    </span>
                    <button
                      onClick={playAyahAudio}
                      className="flex items-center gap-1 text-[11px] text-gold-300 bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-md font-semibold transition-colors"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>استمع للفظ الصحيح</span>
                    </button>
                  </div>

                  <p className="text-jade-100/70">
                    الكلمة الصحيحة:{' '}
                    <span
                      className="font-quran text-lg font-bold text-gold-300 px-1"
                      style={{ fontFamily: riwayahFontFamily(riwayah) }}
                    >
                      {activeMistakeAlert.expected}
                    </span>
                  </p>

                  {activeMistakeAlert.heard && activeMistakeAlert.heard !== 'تلميح استحضار' && (
                    <p className="text-jade-100/60 text-[11px]">
                      ما سُمِع:{' '}
                      <span className="text-rose-300 font-medium">{activeMistakeAlert.heard}</span>
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
              <div className="mt-6 w-full max-w-md bg-jade-500/15 border border-jade-400/30 rounded-2xl p-4 text-center shadow-xs animate-in zoom-in-95">
                <div className="flex items-center justify-center gap-2 text-jade-200 font-bold text-base mb-1">
                  <CheckCircle2 className="w-5 h-5 text-gold-300" />
                  <span>ما شاء الله! اكتمل التسميع</span>
                </div>
                <p className="text-sm font-bold text-jade-200">
                  جودة مطابقة الكلمات:{' '}
                  {Math.round(
                    (surahRecitationResult.accuratelyMatchedAyahs /
                      surahRecitationResult.completedAyahs) *
                      100,
                  )}
                  %
                </p>
                <p className="mt-1 text-xs text-jade-200">
                  {surahRecitationResult.accuratelyMatchedAyahs} من{' '}
                  {surahRecitationResult.completedAyahs} آية طوبقت كلماتها دون أخطاء متبقية.
                </p>
                <p className="mt-2 text-[11px] text-jade-100/70">
                  التقييم يعتمد على مطابقة النص عبر التعرّف الصوتي، ولا يقيّم أحكام التجويد.
                </p>
              </div>
            )}
        </div>

        {/* Bottom Recitation Control Dock */}
        <div className="bg-white/5 px-6 py-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
          {/* Navigation: Prev / Next Ayah */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevUnit}
              disabled={currentUnitIndex <= 0}
              className="p-2.5 rounded-xl border border-white/10 bg-white/5 text-jade-100 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={unit === 1 ? 'الآية السابقة' : 'المقطع السابق'}
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <button
              onClick={handleNextUnit}
              disabled={currentUnitIndex >= units.length - 1}
              className="p-2.5 rounded-xl border border-white/10 bg-white/5 text-jade-100 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={unit === 1 ? 'الآية التالية' : 'المقطع التالي'}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                ayahCompletionHandledRef.current = false;
                resetRecitationState();
              }}
              className="p-2.5 rounded-xl border border-white/10 bg-white/5 text-jade-100/70 hover:text-white hover:bg-white/10 transition-colors"
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
                  ? 'bg-rose-500 hover:bg-rose-600 text-white animate-pulse ring-4 ring-rose-500/30'
                  : 'bg-gold-400 hover:bg-gold-300 text-jade-950 ring-4 ring-gold-400/30'
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
              <span className="w-full text-center text-[11px] text-jade-100/60">
                ينتقل تلقائيًا بين الآيات حتى نهاية السورة.
              </span>
            )}

            <button
              onClick={() => void stopSurahRecitation()}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-jade-100 hover:bg-white/10 font-semibold text-xs transition-colors"
              title="إيقاف السورة الحالية"
            >
              <MicOff className="w-4 h-4 text-rose-300" />
              <span>إيقاف السورة</span>
            </button>

            {/* Reference Audio Player (Sheikh Al-Husary / Al-Afasy) */}
            <button
              onClick={playAyahAudio}
              className={`flex items-center gap-1.5 px-4 py-3 rounded-xl border font-semibold text-xs transition-colors cursor-pointer ${
                isPlayingAudio
                  ? 'bg-gold-400/15 border-gold-400/30 text-gold-200 animate-pulse'
                  : 'bg-white/5 border-white/10 text-jade-100 hover:bg-white/10'
              }`}
              title="استمع لتلاوة الشيخ للآية"
            >
              <Volume2 className="w-4 h-4 text-gold-300" />
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
              className="text-xs text-jade-100/60 hover:text-jade-100/80 underline decoration-dotted"
            >
              {showSimulatedInput ? 'إخفاء محاكي التسميع' : 'محاكي التسميع والكلمات'}
            </button>
          </div>
        </div>

        {/* Fallback Simulator Drawer (Allows testing or practicing without microphone) */}
        {showSimulatedInput && (
          <div className="bg-gold-400/10 border-t border-gold-400/30 p-4 text-xs text-gold-200">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="font-bold font-display">محاكي التسميع التفاعلي:</span>
                <p className="text-jade-100/70 text-[11px]">
                  انقر على الكلمة التالية لنطقها، أو اكتب ما تحفظه للتحقق الفوري.
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {currentWordIdx < verseWords.length && (
                  <button
                    onClick={() => submitSimulatedWord(verseWords[currentWordIdx].original)}
                    className="bg-gold-400 hover:bg-gold-300 text-jade-950 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors shadow-lg shadow-gold-500/20"
                  >
                    نطق كلمة: "{verseWords[currentWordIdx].original}"
                  </button>
                )}

                <button
                  onClick={() => submitSimulatedWord('كلمة_خاطئة')}
                  className="bg-rose-500/15 text-rose-200 border border-rose-400/30 font-medium px-2.5 py-1.5 rounded-lg text-xs hover:bg-rose-500/25 transition-colors"
                >
                  اختبار خطأ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Memorization Tips Card */}
      <div className="glass-panel rounded-2xl p-4 sm:p-5 flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl bg-gold-400/15 text-gold-300 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-gold-300" />
        </div>
        <div className="space-y-1 text-xs text-jade-100/70">
          <span className="font-bold font-display text-white text-sm">
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
