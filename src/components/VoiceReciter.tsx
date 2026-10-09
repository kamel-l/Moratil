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
  Eye, 
  EyeOff, 
  BookOpen, 
  Headphones,
  Award,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Surah, Ayah, Reciter } from '../types/quran';
import { getAyahPageNumber, getQuranPage, QuranPageAyah } from '../data/quranData';
import { extractWords, wordSimilarity, normalizeArabicText, QuranWordMeta } from '../utils/arabicUtils';
import { getAyahAudioUrl } from '../utils/audioReciters';
import { recordVerseResult, addPointsAndVerses } from '../services/storageService';

interface VoiceReciterProps {
  surah: Surah;
  initialAyahNumber?: number;
  selectedReciter: Reciter;
  onOpenTafsir: (ayah: Ayah) => void;
  onStatsUpdate: () => void;
  onSelectSurahChange: (surahNum: number, ayahNum?: number) => void;
  allSurahsList: { number: number; name: string; numberOfAyahs: number }[];
}

type RecitationMode = 'karaoke' | 'memorization' | 'listen_repeat';

export const VoiceReciter: React.FC<VoiceReciterProps> = ({
  surah,
  initialAyahNumber = 1,
  selectedReciter,
  onOpenTafsir,
  onStatsUpdate,
  onSelectSurahChange,
  allSurahsList
}) => {
  const [currentAyahIndex, setCurrentAyahIndex] = useState(
    Math.max(0, Math.min(surah.ayahs.length - 1, initialAyahNumber - 1))
  );

  const [mode, setMode] = useState<RecitationMode>('karaoke');
  const [isListening, setIsListening] = useState(false);
  const [isSurahRecitationMode, setIsSurahRecitationMode] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [matchedWords, setMatchedWords] = useState<number[]>([]);
  const [failedWords, setFailedWords] = useState<Record<number, string>>({}); // wordIdx -> what user said
  const [activeMistakeAlert, setActiveMistakeAlert] = useState<{ expected: string; heard: string; wordIdx: number } | null>(null);
  const [isAyahCompleted, setIsAyahCompleted] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [showSimulatedInput, setShowSimulatedInput] = useState(false);
  const [manualWordInput, setManualWordInput] = useState('');
  const [quranPageNumber, setQuranPageNumber] = useState<number | null>(null);
  const [quranPageAyahs, setQuranPageAyahs] = useState<QuranPageAyah[]>([]);
  const [isQuranPageLoading, setIsQuranPageLoading] = useState(true);
  const [quranPageError, setQuranPageError] = useState<string | null>(null);
  const [pageReloadToken, setPageReloadToken] = useState(0);

  const recognitionRef = useRef<any>(null);
  const incomingSpeechHandlerRef = useRef<(spokenText: string) => void>(() => {});
  const nativeRecognitionActiveRef = useRef(false);
  const isSurahRecitationModeRef = useRef(false);
  const isAyahCompletedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync with initialAyahNumber if changed from parent
  useEffect(() => {
    if (initialAyahNumber >= 1 && initialAyahNumber <= surah.ayahs.length) {
      setCurrentAyahIndex(initialAyahNumber - 1);
    }
  }, [initialAyahNumber, surah]);

  const currentAyah = surah.ayahs[currentAyahIndex] || surah.ayahs[0];
  const surahProgress = surah.ayahs.length > 0 ? ((currentAyahIndex + 1) / surah.ayahs.length) * 100 : 0;
  const currentVerseOnPageIndex = quranPageAyahs.findIndex((ayah) =>
    ayah.surahNumber === surah.number && ayah.numberInSurah === currentAyah.numberInSurah
  );
  const revealedPageAyahs = currentVerseOnPageIndex >= 0
    ? quranPageAyahs.slice(0, currentVerseOnPageIndex + 1)
    : quranPageAyahs;

  useEffect(() => {
    let isMounted = true;

    const loadQuranPage = async () => {
      setIsQuranPageLoading(true);
      setQuranPageError(null);

      try {
        const pageNumber = currentAyah.page
          ?? await getAyahPageNumber(surah.number, currentAyah.numberInSurah);
        const pageAyahs = await getQuranPage(pageNumber);

        if (isMounted) {
          setQuranPageNumber(pageNumber);
          setQuranPageAyahs(pageAyahs);
        }
      } catch (error) {
        if (isMounted) {
          setQuranPageError(error instanceof Error ? error.message : 'تعذر تحميل صفحة المصحف.');
        }
      } finally {
        if (isMounted) {
          setIsQuranPageLoading(false);
        }
      }
    };

    void loadQuranPage();
    return () => {
      isMounted = false;
    };
  }, [currentAyah, pageReloadToken, surah.number]);

  // Extract Quran words for current ayah
  const verseWords = useMemo(() => {
    return extractWords(currentAyah.text);
  }, [currentAyah]);

  // Reset recitation state when ayah changes
  const resetRecitationState = () => {
    setCurrentWordIdx(0);
    setMatchedWords([]);
    setFailedWords({});
    setActiveMistakeAlert(null);
    setIsAyahCompleted(false);
    setTranscript('');
  };

  useEffect(() => {
    resetRecitationState();
  }, [currentAyahIndex, surah.number]);

  useEffect(() => {
    isSurahRecitationModeRef.current = isSurahRecitationMode;
  }, [isSurahRecitationMode]);

  useEffect(() => {
    isAyahCompletedRef.current = isAyahCompleted;
  }, [isAyahCompleted]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
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
        if (isSurahRecitationModeRef.current && !isAyahCompletedRef.current) {
          setIsListening(true);
          setTimeout(() => {
            if (isSurahRecitationModeRef.current && !isAyahCompletedRef.current) {
              setIsListening(true);
              void startListening();
            }
          }, 250);
          return;
        }

        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setShowSimulatedInput(true);
        }
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const trans = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += trans + ' ';
          } else {
            interimTranscript += trans;
          }
        }

        const textToEvaluate = (finalTranscript || interimTranscript).trim();
        setTranscript(textToEvaluate);

        if (finalTranscript.trim()) {
          incomingSpeechHandlerRef.current(finalTranscript.trim());
        }
      };

      recognitionRef.current = recognition;
    } catch (e) {
      console.warn('SpeechRecognition init error:', e);
      setSpeechSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // Handle spoken words matching against Quranic target verse
  const handleIncomingSpokenText = (spokenText: string) => {
    if (isAyahCompleted || currentWordIdx >= verseWords.length) return;

    const spokenTokens = spokenText.split(/\s+/).filter(Boolean);
    if (spokenTokens.length === 0) return;

    let nextWordIdx = currentWordIdx;
    const nextMatchedWords = [...matchedWords];
    const nextFailedWords = { ...failedWords };
    let nextMistake = activeMistakeAlert;

    for (const latestSpoken of spokenTokens) {
      const expectedMeta = verseWords[nextWordIdx];
      if (!expectedMeta) break;

      const similarity = wordSimilarity(latestSpoken, expectedMeta.original);
      if (similarity >= 0.70) {
        nextMatchedWords.push(nextWordIdx);
        delete nextFailedWords[nextWordIdx];
        nextWordIdx += 1;
        nextMistake = null;
        continue;
      }

      const normSpoken = normalizeArabicText(latestSpoken);
      if (normSpoken.length < 2 || normSpoken === 'ال') continue;

      if (nextWordIdx + 1 < verseWords.length) {
        const nextSimilarity = wordSimilarity(latestSpoken, verseWords[nextWordIdx + 1].original);
        if (nextSimilarity >= 0.70) {
          nextFailedWords[nextWordIdx] = 'تم تخطيها';
          nextMistake = {
            expected: expectedMeta.original,
            heard: `تخطيت كلمة "${expectedMeta.original}"`,
            wordIdx: nextWordIdx
          };
          break;
        }
      }

      nextFailedWords[nextWordIdx] = latestSpoken;
      nextMistake = {
        expected: expectedMeta.original,
        heard: latestSpoken,
        wordIdx: nextWordIdx
      };
      break;
    }

    setMatchedWords(nextMatchedWords);
    setFailedWords(nextFailedWords);
    setCurrentWordIdx(nextWordIdx);
    setActiveMistakeAlert(nextMistake);

    if (nextWordIdx >= verseWords.length) {
      handleAyahCompletion(
        nextMatchedWords.length === verseWords.length && Object.keys(nextFailedWords).length === 0
      );
    }
  };

  incomingSpeechHandlerRef.current = handleIncomingSpokenText;

  // Ayah Completion logic with points, spaced repetition, and celebration
  const handleAyahCompletion = (isFlawless: boolean) => {
    const isFinalAyah = currentAyahIndex >= surah.ayahs.length - 1;
    setIsAyahCompleted(isFinalAyah);
    if (!isSurahRecitationMode) {
      if (nativeRecognitionActiveRef.current) {
        nativeRecognitionActiveRef.current = false;
        setIsListening(false);
        SpeechRecognition.stop().catch(() => {});
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    }

    // Launch celebratory confetti
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 },
      colors: ['#059669', '#10b981', '#fbbf24', '#f59e0b']
    });

    // Record in Spaced Repetition System
    const mistakesArray = Object.entries(failedWords).map(([idx, heard]) => ({
      expectedWord: verseWords[parseInt(idx, 10)]?.original || '',
      recitedWord: heard
    }));

    recordVerseResult(surah.number, currentAyah.numberInSurah, isFlawless, mistakesArray);

    // Add points & update stats
    const earnedPoints = isFlawless ? 35 : 20;
    addPointsAndVerses(earnedPoints, 1, 30, isFlawless ? 100 : 85);
    onStatsUpdate();

    const moveToNextAyah = () => {
      if (currentAyahIndex < surah.ayahs.length - 1) {
        setCurrentAyahIndex(prev => prev + 1);
        setTimeout(() => {
          if (isSurahRecitationModeRef.current) {
            setIsListening(true);
            setIsSurahRecitationMode(true);
            setIsAyahCompleted(false);
            void startListening();
          }
        }, 400);
        return;
      }

      setIsSurahRecitationMode(false);
      setIsListening(false);
      if (nativeRecognitionActiveRef.current) {
        nativeRecognitionActiveRef.current = false;
        SpeechRecognition.stop().catch(() => {});
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };

    // Keep the recitation going automatically to the end of the surah.
    if (isSurahRecitationMode) {
      setTimeout(() => {
        moveToNextAyah();
      }, isFlawless ? 2200 : 1200);
      return;
    }

    if (isFlawless && currentAyahIndex < surah.ayahs.length - 1) {
      setTimeout(() => {
        handleNextAyah();
      }, 2200);
    }
  };

  const listenWithNativeRecognition = async () => {
    if (!nativeRecognitionActiveRef.current) return;

    try {
      const { matches } = await SpeechRecognition.start({
        language: 'ar-SA',
        maxResults: 1,
        partialResults: false,
        popup: false
      });
      const recognizedText = matches?.[0]?.trim();
      if (recognizedText) {
        setTranscript(recognizedText);
        incomingSpeechHandlerRef.current(recognizedText);
      }

      if (nativeRecognitionActiveRef.current) {
        void listenWithNativeRecognition();
      }
    } catch (error) {
      console.warn('Native speech recognition error:', error);
      nativeRecognitionActiveRef.current = false;
      setIsListening(false);
      setShowSimulatedInput(true);
    }
  };

  const startListening = async () => {
    setIsSurahRecitationMode(true);
    setIsListening(true);

    if (Capacitor.isNativePlatform()) {
      try {
        const { available } = await SpeechRecognition.available();
        if (!available) {
          setSpeechSupported(false);
          setShowSimulatedInput(true);
          return;
        }

        let permission = await SpeechRecognition.checkPermissions();
        if (permission.speechRecognition !== 'granted') {
          permission = await SpeechRecognition.requestPermissions();
        }
        if (permission.speechRecognition !== 'granted') {
          setShowSimulatedInput(true);
          return;
        }

        setTranscript('');
        nativeRecognitionActiveRef.current = true;
        setIsListening(true);
        setIsSurahRecitationMode(true);
        void listenWithNativeRecognition();
      } catch (error) {
        console.warn('Native speech recognition setup error:', error);
        setShowSimulatedInput(true);
      }
      return;
    }

    if (!speechSupported) {
      setShowSimulatedInput(true);
      return;
    }

    setTranscript('');
    setIsSurahRecitationMode(true);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        setIsListening(true);
      }
    }
  };

  const stopListening = async () => {
    setIsSurahRecitationMode(false);
    setIsAyahCompleted(false);

    if (Capacitor.isNativePlatform()) {
      if (nativeRecognitionActiveRef.current) {
        nativeRecognitionActiveRef.current = false;
        setIsListening(false);
        await SpeechRecognition.stop().catch(() => {});
      }
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  const stopSurahRecitation = async () => {
    await stopListening();
    setCurrentWordIdx(0);
    setMatchedWords([]);
    setFailedWords({});
    setActiveMistakeAlert(null);
    setTranscript('');
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
    if (isPlayingAudio && audioRef.current) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
      return;
    }

    const audioUrl = getAyahAudioUrl(selectedReciter.id, surah.number, currentAyah.numberInSurah);
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
    } else {
      audioRef.current.src = audioUrl;
    }

    setIsPlayingAudio(true);
    audioRef.current.play().catch(e => {
      console.warn("Audio play blocked", e);
      setIsPlayingAudio(false);
    });

    audioRef.current.onended = () => {
      setIsPlayingAudio(false);
      // In listen & repeat mode, auto-start mic after Sheikh finishes!
      if (mode === 'listen_repeat') {
        toggleListening();
      }
    };
  };

  const handleNextAyah = () => {
    if (currentAyahIndex < surah.ayahs.length - 1) {
      setCurrentAyahIndex(prev => prev + 1);
    }
  };

  const handlePrevAyah = () => {
    if (currentAyahIndex > 0) {
      setCurrentAyahIndex(prev => prev - 1);
    }
  };

  // Manual word simulator (for devices where mic is restricted or testing)
  const submitSimulatedWord = (wordText: string) => {
    handleIncomingSpokenText(wordText);
    setManualWordInput('');
  };

  // Quick hint
  const giveHint = () => {
    if (currentWordIdx < verseWords.length) {
      const target = verseWords[currentWordIdx];
      setActiveMistakeAlert({
        expected: target.original,
        heard: 'تلميح استحضار',
        wordIdx: currentWordIdx
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
              onChange={(e) => onSelectSurahChange(Number(e.target.value))}
              className="min-w-0 flex-1 sm:flex-initial bg-stone-50 border border-stone-300 text-stone-900 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer"
            >
              {allSurahsList.map(s => (
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

          {/* Mode Selector Tabs */}
          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl w-full sm:w-auto justify-center">
            <button
              onClick={() => setMode('karaoke')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                mode === 'karaoke'
                  ? 'bg-white text-emerald-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-emerald-600" />
              <span>مراجعة مرئية</span>
            </button>

            <button
              onClick={() => setMode('memorization')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                mode === 'memorization'
                  ? 'bg-white text-emerald-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
              title="تُخفى الكلمات لتختبر قوة حفظك واستحضارك، وتظهر فور نطقها صواباً"
            >
              <EyeOff className="w-3.5 h-3.5 text-amber-600" />
              <span>تسميع عن غيب</span>
            </button>

            <button
              onClick={() => setMode('listen_repeat')}
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

      {/* Surah Progress */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs">
        <div className="flex items-center justify-between gap-3 text-[11px] sm:text-xs font-medium text-stone-600 mb-2">
          <span>تقدم السورة</span>
          <span className="font-bold text-stone-800">
            {currentAyahIndex + 1} / {surah.ayahs.length}
          </span>
        </div>
        <div className="h-3 w-full rounded-full bg-stone-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-700 transition-all duration-300"
            style={{ width: `${surahProgress}%` }}
          />
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

        {/* Full Mushaf Page */}
        <div className="p-4 sm:p-8 flex flex-col items-center gap-6 relative bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.08),_transparent_52%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
          <div className="w-full max-w-4xl min-h-[560px] sm:min-h-[760px] rounded-xl border-[5px] border-double border-emerald-800/70 bg-[#fffdf6] p-4 sm:p-8 shadow-[0_12px_40px_rgba(15,23,42,0.12)]">
            <div className="flex items-center justify-between border-b border-amber-900/20 pb-3 text-xs font-semibold text-stone-600">
              <span>القرآن الكريم</span>
              <span>{quranPageNumber ? `صفحة ${quranPageNumber}` : 'صفحة المصحف'}</span>
            </div>

            {isQuranPageLoading ? (
              <div className="flex min-h-[480px] items-center justify-center text-sm text-stone-500" role="status">
                جارٍ تحميل صفحة المصحف...
              </div>
            ) : quranPageError ? (
              <div className="flex min-h-[480px] flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-rose-700" role="alert">{quranPageError}</p>
                <button
                  onClick={() => setPageReloadToken((token) => token + 1)}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  إعادة المحاولة
                </button>
              </div>
            ) : (
              <div dir="rtl" className="pt-5 text-justify text-[1.45rem] leading-[2.25] text-stone-900 sm:text-[1.8rem] sm:leading-[2.3]">
                {revealedPageAyahs.map((pageAyah) => {
                  const isCurrent = pageAyah.surahNumber === surah.number
                    && pageAyah.numberInSurah === currentAyah.numberInSurah;

                  return (
                    <React.Fragment key={`${pageAyah.surahNumber}:${pageAyah.numberInSurah}`}>
                      {pageAyah.numberInSurah === 1 && (
                        <>
                          <span className="inline-block w-full py-2 text-center font-sans text-base font-bold text-emerald-900">
                            سورة {pageAyah.surahName}
                          </span>
                          {pageAyah.surahNumber !== 1 && pageAyah.surahNumber !== 9 && (
                            <span className="inline-block w-full pb-2 text-center font-quran text-xl text-stone-700 sm:text-2xl">
                              بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                            </span>
                          )}
                        </>
                      )}
                      {isCurrent ? (
                        <>
                          {verseWords.map((wordObj) => {
                            const isMatched = matchedWords.includes(wordObj.index);
                            const isCurrentWord = wordObj.index === currentWordIdx && !isAyahCompleted;
                            const hasMistake = failedWords[wordObj.index] !== undefined;
                            const isHidden = mode === 'memorization' && !isMatched && !isCurrentWord;
                            const wordColorClass = isMatched
                              ? 'text-emerald-700 font-bold'
                              : hasMistake
                                ? 'text-rose-600 font-bold'
                                : 'text-stone-900';
                            const wordBackgroundClass = isMatched
                              ? 'bg-emerald-50 border border-emerald-200/80 shadow-sm'
                              : hasMistake
                                ? 'bg-rose-50 border border-rose-300 animate-pulse'
                                : isCurrentWord
                                  ? 'bg-amber-50 border-2 border-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.18)]'
                                  : 'border border-transparent';

                            return (
                              <span
                                key={wordObj.index}
                                onClick={() => {
                                  if (showSimulatedInput) {
                                    submitSimulatedWord(wordObj.original);
                                  }
                                }}
                                className={`inline-block cursor-pointer select-none rounded-xl px-1.5 py-0.5 transition-all duration-200 ${wordColorClass} ${wordBackgroundClass}`}
                                title={hasMistake ? `نطقت خطأ: ${failedWords[wordObj.index]}` : wordObj.original}
                              >
                                {isHidden ? (
                                  <span className="font-sans text-xl tracking-[0.24em] text-stone-300 sm:text-2xl">
                                    •••••
                                  </span>
                                ) : wordObj.original}
                              </span>
                            );
                          })}
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const localAyahIndex = pageAyah.surahNumber === surah.number
                              ? surah.ayahs.findIndex((ayah) => ayah.numberInSurah === pageAyah.numberInSurah)
                              : -1;

                            if (localAyahIndex >= 0) {
                              setCurrentAyahIndex(localAyahIndex);
                            } else {
                              onSelectSurahChange(pageAyah.surahNumber, pageAyah.numberInSurah);
                            }
                          }}
                          className="inline rounded-lg px-0.5 transition-colors hover:bg-amber-100"
                          aria-label={`سورة ${pageAyah.surahName} الآية ${pageAyah.numberInSurah}`}
                        >
                          <span className="font-quran">{pageAyah.text}</span>
                        </button>
                      )}
                      <span className="mx-1 inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-emerald-800/70 px-1 text-sm font-sans font-bold text-emerald-900">
                        {pageAyah.numberInSurah}
                      </span>
                      {' '}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active Error Detection / Correction Alert */}
          {activeMistakeAlert && !isAyahCompleted && (
            <div className="mt-6 w-full max-w-lg bg-rose-50 border border-rose-200 rounded-2xl p-4 text-right shadow-xs animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5 text-xs text-rose-900 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-rose-800">
                      تنبيه خطأ في التسميع
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
                    الكلمة المطلوبة هي:{' '}
                    <span className="font-quran text-lg font-bold text-emerald-800 px-1">
                      {activeMistakeAlert.expected}
                    </span>
                  </p>

                  {activeMistakeAlert.heard && activeMistakeAlert.heard !== 'تلميح استحضار' && (
                    <p className="text-stone-500 text-[11px]">
                      اللفظ المسموع: <span className="text-rose-600 font-medium">{activeMistakeAlert.heard}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Ayah Completion Banner */}
          {isAyahCompleted && currentAyahIndex === surah.ayahs.length - 1 && (
            <div className="mt-6 w-full max-w-md bg-emerald-50 border border-emerald-300 rounded-2xl p-4 text-center shadow-xs animate-in zoom-in-95">
              <div className="flex items-center justify-center gap-2 text-emerald-800 font-bold text-base mb-1">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>ما شاء الله! تمت تلاوة السورة بنجاح</span>
              </div>
              <p className="text-xs text-emerald-700">
                أُضيفت <span className="font-bold">+35 حسنة</span> وحُدّث مؤشر التكرار المتباعد لتثبيت الحفظ.
              </p>
            </div>
          )}

          {/* Real-time Voice Transcript preview */}
          {isListening && transcript && (
            <div className="mt-4 text-xs text-stone-500 bg-stone-100/80 px-3 py-1.5 rounded-full border border-stone-200/60 max-w-md truncate">
              المسموع الآن: <span className="text-emerald-700 font-medium">"{transcript}"</span>
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
              onClick={resetRecitationState}
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
                  <span>ابدأ التسميع بصوتك</span>
                </>
              )}
            </button>

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
                {isPlayingAudio ? 'جارٍ التشغيل...' : `استمع (${selectedReciter.name.split(' ')[1] || 'القارئ'})`}
              </span>
            </button>
          </div>

          <div className="w-full mt-2">
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-semibold text-stone-600 mb-2">
              <span>انتقال آلي</span>
              <span>{currentAyahIndex + 1} / {surah.ayahs.length}</span>
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
              {surah.ayahs.map((_, index) => {
                const isCurrent = index === currentAyahIndex;
                const isDone = index < currentAyahIndex;
                const isUpcoming = index > currentAyahIndex;

                return (
                  <button
                    key={index}
                    onClick={() => setCurrentAyahIndex(index)}
                    className={[
                      'h-10 rounded-xl border text-[11px] font-bold transition-all',
                      isCurrent ? 'bg-emerald-700 text-white border-emerald-700 shadow-md' : '',
                      isDone ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : '',
                      isUpcoming ? 'bg-stone-100 text-stone-500 border-stone-200 hover:bg-stone-200' : ''
                    ].join(' ')}
                    title={`الآية ${index + 1}`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
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
            تسميع الآية غيباً بالصوت ينشّط الذاكرة السمعية والبصرية. عند التردد في أي كلمة، استمع للشيخ الحصري لتثبيت النطق السليم ومخارج الحروف الصحيحة.
          </p>
        </div>
      </div>

    </div>
  );
};
