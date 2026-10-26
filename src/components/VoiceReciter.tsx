import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import {
  Mic, MicOff, RotateCcw, Volume2, CheckCircle2, AlertCircle,
  ChevronRight, ChevronLeft, HelpCircle, BookOpen, Headphones,
  Eye, EyeOff, Trophy, Sparkles, CalendarClock,
} from 'lucide-react';
import { Surah, Ayah, Reciter } from '../types/quran';
import { extractWords, normalizeArabicText } from '../utils/arabicUtils';
import { getAyahAudioUrl } from '../utils/audioReciters';
import { recordVerseResult, addPointsAndVerses } from '../services/storageService';
import { useRecitationSession } from '../hooks/useRecitationSession';
import { useAyahAudio } from '../hooks/useAyahAudio';
import { MemorizationTest } from './MemorizationTest';

interface VoiceReciterProps {
  surah: Surah;
  initialAyahNumber?: number;
  selectedReciter: Reciter;
  onOpenTafsir: (ayah: Ayah) => void;
  onStatsUpdate: () => void;
  onSelectSurahChange: (surahNum: number, ayahNum?: number) => void;
  allSurahsList: { number: number; name: string; numberOfAyahs: number }[];
  embedded?: boolean;
  initialTab?: 'recite' | 'test';
  onClose?: () => void;
}

type RecitationMode = 'karaoke' | 'listen_repeat';

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

// ============================================================
// الغلاف الخارجي: تبويبات تسميع / اختبار
// ============================================================
export const VoiceReciter: React.FC<VoiceReciterProps> = (props) => {
  const { initialTab = 'recite', onClose } = props;
  const [tab, setTab] = useState<'recite' | 'test'>(initialTab);

  const handleClose = () => {
    if (typeof onClose === 'function') onClose();
  };

  return (
    <div className="h-full w-full flex flex-col bg-stone-100/60" dir="rtl">
      {/* شريط التبويبات */}
      <div className="shrink-0 bg-white border-b border-stone-200 shadow-sm">
        <div className="flex items-stretch h-12">
          {onClose ? (
            <button
              type="button"
              onClick={handleClose}
              className="w-12 flex items-center justify-center text-stone-700 hover:bg-stone-100 active:bg-stone-200 transition-colors shrink-0"
              aria-label="رجوع"
              title="العودة للرئيسية"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-2 shrink-0" aria-hidden="true" />
          )}

          <div className="flex-1 flex items-stretch">
            <button
              type="button"
              onClick={() => setTab('recite')}
              className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-bold transition-colors relative ${
                tab === 'recite'
                  ? 'text-emerald-800'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>تسميع</span>
              {tab === 'recite' && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-emerald-700 rounded-full" />
              )}
            </button>

            <div className="w-px bg-stone-200 my-2" />

            <button
              type="button"
              onClick={() => setTab('test')}
              className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-bold transition-colors relative ${
                tab === 'test'
                  ? 'text-emerald-800'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <Trophy className="w-4 h-4" />
              <span>اختبار</span>
              {tab === 'test' && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-emerald-700 rounded-full" />
              )}
            </button>
          </div>

          {onClose ? (
            <div className="w-12 shrink-0" aria-hidden="true" />
          ) : (
            <div className="w-2 shrink-0" aria-hidden="true" />
          )}
        </div>
      </div>

      {/* المحتوى */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'recite' && <VoiceReciterInner {...props} embedded />}
        {tab === 'test' && (
          <MemorizationTest
            surah={props.surah}
            selectedReciter={props.selectedReciter}
            onStatsUpdate={props.onStatsUpdate}
            embedded
          />
        )}
      </div>
    </div>
  );
};

// ============================================================
// المكوّن الداخلي: منطق التسميع (ستايل RevisionPlans)
// ============================================================
const VoiceReciterInner: React.FC<VoiceReciterProps> = ({
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
  const [hideUnrecitedWords, setHideUnrecitedWords] = useState(true);
  const [surahRecitationResult, setSurahRecitationResult] = useState<{
    completedAyahs: number;
    accuratelyMatchedAyahs: number;
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

  const verseWords = useMemo(() => {
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
    activeMistakeAlert,
    isAyahCompleted,
    setIsAyahCompleted,
    setActiveMistakeAlert,
    completionLockRef,
    handleIncomingSpokenText,
    resetRecitationState,
    failedWordsRef,
  } = useRecitationSession(verseWords);

  useEffect(() => {
    currentWordIdxForAltRef.current = currentWordIdx;
  }, [currentWordIdx]);

  const { isPlayingAudio, playAudio, stopAudio } = useAyahAudio();

  // ============================================================
  // معالج إتمام الآية
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
          try {
            recognitionRef.current.stop();
          } catch (e) {
            /* ignore */
          }
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

  useEffect(() => {
    isSurahRecitationModeRef.current = isSurahRecitationMode;
  }, [isSurahRecitationMode]);

  useEffect(() => {
    isAyahCompletedRef.current = isAyahCompleted;
  }, [isAyahCompleted]);

  // ============================================================
  // تهيئة التعرف الصوتي — الويب
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

      recognition.onstart = () => {
        if (recognitionEnabledRef.current) setIsListening(true);
      };

      recognition.onend = () => {
        if (recognitionEnabledRef.current && isSurahRecitationModeRef.current) {
          setTimeout(() => {
            if (recognitionEnabledRef.current && isSurahRecitationModeRef.current) {
              try {
                recognition.start();
                setIsListening(true);
              } catch (error) {
                if (error instanceof DOMException && error.name === 'InvalidStateError') {
                  setIsListening(true);
                  return;
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
        if (
          ['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(event.error)
        ) {
          recognitionEnabledRef.current = false;
          setIsListening(false);
          setShowSimulatedInput(true);
          try {
            recognitionRef.current?.stop();
          } catch (e) {
            /* ignore */
          }
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
  // التعرف الصوتي — الجوال
  // ============================================================
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
        message.includes('no match') ||
        message.includes('speech timeout') ||
        message.includes('no speech') ||
        message.includes('timed out');

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
      } catch (error) {}
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
        if (!available) {
          setSpeechSupported(false);
          setShowSimulatedInput(true);
          setIsListening(false);
          return;
        }
        let perm = await SpeechRecognition.checkPermissions();
        if (perm.speechRecognition !== 'granted')
          perm = await SpeechRecognition.requestPermissions();
        if (requestId !== recognitionRequestIdRef.current) return;
        if (perm.speechRecognition !== 'granted') {
          setShowSimulatedInput(true);
          setIsListening(false);
          return;
        }

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

    if (!speechSupported) {
      setShowSimulatedInput(true);
      setIsListening(false);
      return;
    }
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
        try {
          await SpeechRecognition.stop();
        } catch (e) {}
      }
      return;
    }
    if (recognitionRef.current && wasEnabled) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
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
    if (isPlayingAudio) {
      stopAudio();
      return;
    }
    playAudio(url, () => {
      if (mode === 'listen_repeat') void toggleListening();
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
  // الواجهة — ستايل RevisionPlans
  // ============================================================
  return (
    <div className="h-full flex flex-col bg-stone-100/60 overflow-hidden">
      {/* ═══════════ منطقة قابلة للتمرير ═══════════ */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 space-y-3">
          {/* ─────── Hero ─────── */}
          <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm relative overflow-hidden">
            <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 bg-emerald-800/80 border border-emerald-700/60 px-2.5 py-0.5 rounded-full text-[11px] text-amber-300 font-medium">
                  <CalendarClock className="w-3 h-3" />
                  <span>تسميع وتصحيح فوري</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold font-serif">
                  سورة {surah.name}
                </h1>
                <p className="text-[11px] sm:text-xs text-emerald-100/90">
                  الآية {currentAyah.numberInSurah} من {surah.ayahs.length} · الجزء {currentAyah.juz} · {surah.revelationType}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setMode(mode === 'listen_repeat' ? 'karaoke' : 'listen_repeat')}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors shrink-0 ${
                  mode === 'listen_repeat'
                    ? 'bg-amber-300 text-emerald-900 border-amber-300'
                    : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                }`}
              >
                <Headphones className="w-3.5 h-3.5" />
                <span>استمع ثم ردّد</span>
              </button>
            </div>
          </div>

          {/* ─────── شريط اختيار السورة والتفسير ─────── */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-3 flex items-center gap-2 flex-wrap">
            <select
              value={surah.number}
              onChange={(e) => {
                void stopSurahRecitation();
                onSelectSurahChange(Number(e.target.value));
              }}
              className="min-w-0 flex-1 sm:flex-initial bg-stone-50 border border-stone-300 text-stone-900 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer"
            >
              {allSurahsList.map((s) => (
                <option key={s.number} value={s.number}>
                  {s.number}. {s.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2.5 py-2 rounded-xl text-[11px] font-semibold text-emerald-800 shrink-0">
              <span>{currentAyah.numberInSurah}</span>
              <span className="text-emerald-400">/</span>
              <span>{surah.ayahs.length}</span>
            </div>

            <button
              type="button"
              onClick={() => onOpenTafsir(currentAyah)}
              className="ms-auto flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>التفسير</span>
            </button>
          </div>

          {/* ─────── بطاقة الآية ─────── */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
            {/* رأس البطاقة */}
            <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                  <Mic className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-stone-900">نص الآية</h2>
                  <p className="text-[10px] text-stone-500">
                    {verseWords.length} كلمة · {matchedWords.length} مطابقة
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setHideUnrecitedWords(!hideUnrecitedWords)}
                  className={`p-1.5 rounded-lg border transition-colors ${
                    hideUnrecitedWords
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-stone-50 text-stone-600 border-stone-200'
                  }`}
                  title={hideUnrecitedWords ? 'كشف النص' : 'إخفاء النص'}
                >
                  {hideUnrecitedWords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={giveHint}
                  className="p-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700"
                  title="تلميح"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* الكلمات */}
            <div className="px-4 py-5 min-h-[140px]">
              <div className="flex flex-wrap gap-1.5 text-xl sm:text-2xl leading-[2.1] font-quran text-right">
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

            {/* تنبيه الخطأ داخل البطاقة */}
            {activeMistakeAlert && !isAyahCompleted && (
              <div className="px-4 pb-3">
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3" role="alert">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-rose-800 truncate">
                          {activeMistakeAlert.heard === 'تلميح استحضار'
                            ? `تلميح: ${activeMistakeAlert.expected}`
                            : `الصحيح: ${activeMistakeAlert.expected}`}
                        </span>
                        <button
                          type="button"
                          onClick={playAyahAudio}
                          className="flex items-center gap-1 text-[10px] text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded font-semibold shrink-0"
                        >
                          <Volume2 className="w-3 h-3" />
                          <span>استمع</span>
                        </button>
                      </div>
                      {activeMistakeAlert.heard && activeMistakeAlert.heard !== 'تلميح استحضار' && (
                        <p className="text-[10px] text-stone-500 mt-0.5 truncate">
                          سُمِع:{' '}
                          <span className="text-rose-600 font-medium">
                            {activeMistakeAlert.heard}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─────── نتيجة إتمام السورة ─────── */}
          {surahRecitationResult && isAyahCompleted && currentAyahIndex === surah.ayahs.length - 1 && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 text-center shadow-xs">
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
                type="button"
                onClick={() => setSurahRecitationResult(null)}
                className="mt-3 px-4 py-1.5 bg-emerald-700 text-white text-xs font-semibold rounded-lg"
              >
                إغلاق
              </button>
            </div>
          )}

          {/* ─────── المحاكي ─────── */}
          {showSimulatedInput && (
            <div className="bg-white rounded-2xl border border-amber-200 shadow-xs p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                محاكي التسميع
              </p>
              <div className="flex flex-wrap gap-2">
                {currentWordIdx < verseWords.length && (
                  <button
                    type="button"
                    onClick={() => submitSimulatedWord(verseWords[currentWordIdx].original)}
                    className="bg-emerald-700 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg hover:bg-emerald-800 transition-colors"
                  >
                    نطق: "{verseWords[currentWordIdx].original}"
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => submitSimulatedWord('كلمة_خاطئة')}
                  className="bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-medium px-2.5 py-1.5 rounded-lg hover:bg-rose-200 transition-colors"
                >
                  اختبار خطأ
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ شريط التحكم السفلي الثابت ═══════════ */}
      <div className="shrink-0 bg-white border-t border-stone-200 shadow-lg">
        <div className="max-w-5xl mx-auto px-2 sm:px-4 py-2">
          <div className="flex items-center justify-between gap-2">
            {/* تنقل */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevAyah}
                disabled={currentAyahIndex === 0}
                className="p-2 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-30 transition-colors"
                title="السابق"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextAyah}
                disabled={currentAyahIndex === surah.ayahs.length - 1}
                className="p-2 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-30 transition-colors"
                title="التالي"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  ayahCompletionHandledRef.current = false;
                  completionLockRef.current = false;
                  resetRecitationState();
                }}
                className="p-2 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 transition-colors"
                title="إعادة"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* زر الميكروفون */}
            <button
              type="button"
              onClick={toggleListening}
              className={`flex items-center justify-center gap-2 px-5 sm:px-7 py-2.5 rounded-full font-bold text-sm shadow-md transition-all ${
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

            {/* استمع + محاكي */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={playAyahAudio}
                className={`p-2 rounded-xl border transition-colors ${
                  isPlayingAudio
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-800 animate-pulse'
                    : 'bg-white border-stone-200 text-emerald-600 hover:bg-stone-50'
                }`}
                title="استمع للشيخ"
              >
                <Volume2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowSimulatedInput(!showSimulatedInput)}
                className={`p-2 rounded-xl border transition-colors ${
                  showSimulatedInput
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
                }`}
                title="محاكي التسميع"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 mt-1.5 text-[10px] text-stone-500">
            <button
              type="button"
              onClick={() => void stopSurahRecitation()}
              className="hover:text-rose-600 underline decoration-dotted"
            >
              إيقاف السورة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};