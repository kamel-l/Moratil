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
  Eye,
  EyeOff,
} from 'lucide-react';
import { Surah, Ayah, Reciter } from '../types/quran';
import {
  extractWords,
  findSimilarAyahs,
  removeOpeningBasmalah,
  type SimilarAyahCandidate,
} from '../utils/arabicUtils';
import { getAyahAudioUrl } from '../utils/audioReciters';
import { getAllQuranAyahs } from '../data/quranData';
import { recordVerseResult, addPointsAndVerses } from '../services/storageService';
import { useRecitationSession } from '../hooks/useRecitationSession';
import { useAyahAudio } from '../hooks/useAyahAudio';
import {
  isQuranAsrConfigured,
  transcribeQuranRecitation,
} from '../services/quranRecognition';

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
  const currentAyah = surah.ayahs[currentAyahIndex] || surah.ayahs[0];

  const [mode, setMode] = useState<RecitationMode>('karaoke');
  const [repeatCount, setRepeatCount] = useState(1);
  const [showAyahText, setShowAyahText] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showSimilarAyahs, setShowSimilarAyahs] = useState(false);
  const [isLoadingSimilarAyahs, setIsLoadingSimilarAyahs] = useState(false);
  const [similarAyahs, setSimilarAyahs] = useState<SimilarAyahCandidate[]>([]);
  const [similarAyahError, setSimilarAyahError] = useState<string | null>(null);
  const [isSurahRecitationMode, setIsSurahRecitationMode] = useState(false);
  const [speechRecognitionError, setSpeechRecognitionError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(
    () =>
      typeof window !== 'undefined' &&
      !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
  );
  const [showSimulatedInput, setShowSimulatedInput] = useState(false);
  const currentAyahRowRef = useRef<HTMLDivElement | null>(null);
  const [surahRecitationResult, setSurahRecitationResult] = useState<{
    completedAyahs: number;
    accuratelyMatchedAyahs: number;
  } | null>(null);
  const [recitationProgress, setRecitationProgress] = useState<
    Record<number, { matchedWords: number[]; failedWords: Record<number, string> }>
  >({});

  // ============ Refs ============
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingContextRef = useRef({ surahNumber: surah.number, ayahNumber: currentAyahIndex + 1 });
  const currentAyahContextRef = useRef({
    surahNumber: surah.number,
    ayahNumber: currentAyah.numberInSurah,
  });
  currentAyahContextRef.current = {
    surahNumber: surah.number,
    ayahNumber: currentAyah.numberInSurah,
  };
  const incomingSpeechHandlerRef = useRef<
    (
      spokenText: string,
      confidence?: number,
    ) => { completed: boolean; isFlawless: boolean } | undefined
  >(() => undefined);
  const ayahCompletionHandlerRef = useRef<(isFlawless: boolean) => void>(() => {});
  const nativeRecognitionRunnerRef = useRef<() => Promise<void>>(async () => {});
  const nativeRecognitionActiveRef = useRef(false);
  const nativeRecognitionStopRef = useRef<Promise<void>>(Promise.resolve());
  const recognitionEnabledRef = useRef(false);
  const recognitionRequestIdRef = useRef(0);
  const similarAyahRequestIdRef = useRef(0);
  const isSurahRecitationModeRef = useRef(false);
  const isAyahCompletedRef = useRef(false);
  const ayahCompletionHandledRef = useRef(false);
  const surahRecitationSummaryRef = useRef({ completedAyahs: 0, accuratelyMatchedAyahs: 0 });

  const currentAyahText =
    surah.number !== 1 && currentAyah.numberInSurah === 1
      ? removeOpeningBasmalah(currentAyah.text)
      : currentAyah.text;

  // استخراج كلمات الآية الحالية للمقارنة كلمة بكلمة
  const verseWords = useMemo(() => {
    return extractWords(currentAyahText);
  }, [currentAyahText]);
  const surahVerseWords = useMemo(
    () =>
      surah.ayahs.map((ayah) =>
        extractWords(
          surah.number !== 1 && ayah.numberInSurah === 1
            ? removeOpeningBasmalah(ayah.text)
            : ayah.text,
        ),
      ),
    [surah],
  );

  const {
    currentWordIdx,
    matchedWords,
    failedWords,
    activeMistakeAlert,
    isAyahCompleted,
    setIsAyahCompleted,
    setActiveMistakeAlert,
    completionLockRef,
    handleIncomingSpokenText,
    resetRecitationState,
    matchedWordsRef,
    failedWordsRef,
  } = useRecitationSession(verseWords);

  const { isPlayingAudio, playAudio, stopAudio } = useAyahAudio();

  // ============================================================
  // ✅ معالج إتمام الآية (النسخة المُصلَحة للانتقال التلقائي)
  // ============================================================
  function handleAyahCompletion(isFlawless: boolean) {
    if (ayahCompletionHandledRef.current) return;
    ayahCompletionHandledRef.current = true;
    completionLockRef.current = true;
    isAyahCompletedRef.current = true;

    const isFinalAyah = currentAyahIndex >= surah.ayahs.length - 1;
    const shouldContinueSurah = isSurahRecitationModeRef.current;

    // ① تراكم ملخص السورة (في وضع التسميع الكامل)
    if (shouldContinueSurah) {
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

    // ② إيقاف التعرف الصوتي الحالي
    if (isFinalAyah) {
      // آية أخيرة → إيقاف نهائي لكل شيء
      const wasWebRecognitionEnabled = recognitionEnabledRef.current;
      isSurahRecitationModeRef.current = false;
      recognitionEnabledRef.current = false;
      setIsSurahRecitationMode(false);
      setIsListening(false);

      if (Capacitor.isNativePlatform() && nativeRecognitionActiveRef.current) {
        nativeRecognitionActiveRef.current = false;
        SpeechRecognition.stop().catch(() => {
          console.warn('Native speech recognition stop failure');
        });
      }
      if (recognitionRef.current && wasWebRecognitionEnabled) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          console.warn('Web speech recognition stop failure', error);
        }
      }
    } else if (shouldContinueSurah) {
      // آية عادية في وضع السورة → إيقاف مؤقت ليستأنفه الـ useEffect
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
        return;
      }

      if (Capacitor.isNativePlatform()) {
        if (nativeRecognitionActiveRef.current) {
          nativeRecognitionActiveRef.current = false;
          nativeRecognitionStopRef.current = SpeechRecognition.stop().catch(() => {
            console.warn('Native stop between ayahs failed');
          });
        }
      } else if (recognitionRef.current && recognitionEnabledRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          console.warn('Web speech recognition pause between ayahs failed', error);
        }
      }
    }

    // ③ تسجيل النتيجة في نظام التكرار المتباعد
    setRecitationProgress((previous) => ({
      ...previous,
      [currentAyah.numberInSurah]: {
        matchedWords: [...matchedWordsRef.current],
        failedWords: { ...failedWordsRef.current },
      },
    }));
    const mistakesArray = Object.entries(failedWordsRef.current).map(([idx, heard]) => ({
      expectedWord: verseWords[parseInt(idx, 10)]?.original || '',
      recitedWord: heard,
    }));
    recordVerseResult(surah.number, currentAyah.numberInSurah, isFlawless, mistakesArray);

    // ④ إضافة النقاط وتحديث الإحصائيات
    const earnedPoints = isFlawless ? 35 : 20;
    addPointsAndVerses(earnedPoints, 1, 30, isFlawless ? 100 : 85);
    onStatsUpdate();

    // ⑤ الانتقال للآية التالية (سيعيد الـ useEffect تشغيل الميكروفون تلقائيًا)
    if (shouldContinueSurah) {
      if (!isFinalAyah) {
        setCurrentAyahIndex((prev) => prev + 1);
      }
      return;
    }

    // وضع الآية الواحدة: انتقال تلقائي فقط عند الإتقان
    if (isFlawless && !isFinalAyah) {
      handleNextAyah();
    }
  }

  ayahCompletionHandlerRef.current = handleAyahCompletion;

  // ============================================================
  // ✅ useEffect: إعادة التشغيل التلقائي عند تغيير الآية
  // ============================================================
  useEffect(() => {
    // فتح كل الأقفال
    ayahCompletionHandledRef.current = false;
    isAyahCompletedRef.current = false;
    completionLockRef.current = false;

    // تصفير حالة الهوك (الكلمة الحالية، التنبيهات، الأخطاء المسجلة)
    resetRecitationState();

    // لا تعيد التشغيل إن لم نكن في وضع السورة الكاملة
    if (!isSurahRecitationModeRef.current || !recognitionEnabledRef.current) return;

    const restartTimer = window.setTimeout(() => {
      if (!isSurahRecitationModeRef.current || !recognitionEnabledRef.current) return;

      // ---- الجوال (Native) ----
      if (Capacitor.isNativePlatform()) {
        void nativeRecognitionStopRef.current.then(() => {
          if (!isSurahRecitationModeRef.current || !recognitionEnabledRef.current) return;
          nativeRecognitionActiveRef.current = true;
          void nativeRecognitionRunnerRef.current();
        });
        return;
      }

      // ---- الويب (Web) ----
      const recognition = recognitionRef.current;
      if (!recognition) {
        setShowSimulatedInput(true);
        setIsListening(false);
        return;
      }

      try {
        recognition.start();
        setIsListening(true);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'InvalidStateError') {
          setIsListening(true);
          return;
        }
        console.warn('Unable to resume web speech recognition for the next ayah:', error);
        recognitionEnabledRef.current = false;
        setIsListening(false);
        setShowSimulatedInput(true);
      }
    }, 300); // ← زيادة المهلة قليلاً لتفادي سباق الحالة

    return () => window.clearTimeout(restartTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAyahIndex, surah.number]); // ← حذف resetRecitationState لتفادي إعادة التشغيل غير الضرورية

  useEffect(() => {
    currentAyahRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentAyahIndex]);

  // ============================================================
  // useEffect: عند تغيير السورة أو الآية الأولية
  // ============================================================
  useEffect(() => {
    setCurrentAyahIndex(Math.max(0, Math.min(surah.ayahs.length - 1, initialAyahNumber - 1)));
    setSurahRecitationResult(null);
    setRecitationProgress({});
    surahRecitationSummaryRef.current = { completedAyahs: 0, accuratelyMatchedAyahs: 0 };
    isSurahRecitationModeRef.current = false;
    recognitionEnabledRef.current = false;
    setIsSurahRecitationMode(false);
    setIsListening(false);
  }, [initialAyahNumber, surah.number, surah.ayahs.length]);

  // مزامنة المراجع مع الحالة
  useEffect(() => {
    isSurahRecitationModeRef.current = isSurahRecitationMode;
  }, [isSurahRecitationMode]);

  useEffect(() => {
    isAyahCompletedRef.current = isAyahCompleted;
  }, [isAyahCompleted]);

  useEffect(() => {
    similarAyahRequestIdRef.current += 1;
    setShowSimilarAyahs(false);
    setIsLoadingSimilarAyahs(false);
    setSimilarAyahs([]);
    setSimilarAyahError(null);
  }, [currentAyah.numberInSurah, surah.number]);

  // ============================================================
  // تهيئة التعرف الصوتي (Native / Web)
  // ============================================================
  useEffect(() => {
    const releaseMediaCapture = () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.onstop = null;
        try {
          mediaRecorderRef.current.stop();
        } catch (error) {
          console.warn('Unable to stop audio recording during cleanup:', error);
        }
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
    };

    // ---------- الجوال ----------
    if (Capacitor.isNativePlatform()) {
      return () => {
        recognitionRequestIdRef.current += 1;
        recognitionEnabledRef.current = false;
        releaseMediaCapture();
        if (nativeRecognitionActiveRef.current) {
          nativeRecognitionActiveRef.current = false;
          void SpeechRecognition.stop().catch((error) => {
            console.warn('Native speech recognition cleanup stop failed', error);
          });
        }
      };
    }

    // ---------- الويب ----------
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      return releaseMediaCapture;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'ar-SA'; // عربي سعودي

      recognition.onstart = () => {
        if (recognitionEnabledRef.current) {
          setSpeechRecognitionError(null);
          setIsListening(true);
        }
      };

      recognition.onend = () => {
        if (
          recognitionEnabledRef.current &&
          isSurahRecitationModeRef.current &&
          !isAyahCompletedRef.current
        ) {
          // إعادة التشغيل التلقائي عند انتهاء الجلسة بشكل غير متوقع
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
                isSurahRecitationModeRef.current = false;
                setIsSurahRecitationMode(false);
                setIsListening(false);
                setSpeechRecognitionError(
                  'تعذّر استئناف التعرّف الصوتي. تحقق من إذن الميكروفون واتصال الإنترنت.',
                );
                setShowSimulatedInput(true);
              }
            }
          }, 300);
          return;
        }

        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        const errorMessages: Record<string, string> = {
          'not-allowed': 'لم يُسمح باستخدام الميكروفون. اسمح للموقع بالوصول إليه من إعدادات المتصفح.',
          'service-not-allowed':
            'خدمة التعرّف الصوتي غير متاحة. جرّب Chrome أو Edge وتأكد من اتصال الإنترنت.',
          'audio-capture': 'لم يُعثر على ميكروفون. تحقق من توصيله واختياره في إعدادات الجهاز.',
          network: 'تعذّر الاتصال بخدمة التعرّف الصوتي. تحقق من الإنترنت وحاول مجددًا.',
          'language-not-supported': 'التعرّف الصوتي باللغة العربية غير مدعوم في هذا المتصفح.',
        };
        setSpeechRecognitionError(
          errorMessages[event.error] ?? 'حدث خطأ في التعرّف الصوتي. حاول بدء التسميع مجددًا.',
        );
        if (
          event.error === 'not-allowed' ||
          event.error === 'service-not-allowed' ||
          event.error === 'audio-capture' ||
          event.error === 'network'
        ) {
          recognitionEnabledRef.current = false;
          isSurahRecitationModeRef.current = false;
          setIsSurahRecitationMode(false);
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
        let confidenceTotal = 0;
        let confidenceCount = 0;
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const result = event.results[i][0];
            finalTranscript += result.transcript + ' ';
            if (typeof result.confidence === 'number' && Number.isFinite(result.confidence)) {
              confidenceTotal += result.confidence;
              confidenceCount += 1;
            }
          }
        }

        if (finalTranscript.trim()) {
          const confidence =
            confidenceCount > 0 ? confidenceTotal / confidenceCount : undefined;
          const nextState = incomingSpeechHandlerRef.current(finalTranscript.trim(), confidence);
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
      releaseMediaCapture();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  incomingSpeechHandlerRef.current = handleIncomingSpokenText;

  // ============================================================
  // التعرف الصوتي على الجوال (حلقة متكررة)
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
      if (recognizedText) {
        const nextState = incomingSpeechHandlerRef.current(recognizedText);
        if (nextState?.completed) {
          ayahCompletionHandlerRef.current(nextState.isFlawless);
        }
      }

      // استمر في الحلقة إن لم تنته الآية ولم يُعطَّل المشغل
      if (nativeRecognitionActiveRef.current && !isAyahCompletedRef.current) {
        setTimeout(() => {
          if (nativeRecognitionActiveRef.current && !isAyahCompletedRef.current) {
            void nativeRecognitionRunnerRef.current();
          }
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

  // ============================================================
  // بدء الاستماع
  // ============================================================
  const startListening = async () => {
    if (isListening || isTranscribing) return;
    const requestId = ++recognitionRequestIdRef.current;
    setSpeechRecognitionError(null);

    // إن كانت الآية السابقة قد انتهت، صفّر كل شيء قبل البدء
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

    if (isQuranAsrConfigured) {
      if (
        !Capacitor.isNativePlatform() &&
        !window.isSecureContext &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1'
      ) {
        setIsListening(false);
        setSpeechRecognitionError('يتطلب تسجيل الصوت فتح الموقع عبر اتصال آمن (HTTPS).');
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setIsListening(false);
        setSpeechRecognitionError('تسجيل الصوت غير مدعوم على هذا الجهاز أو المتصفح.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (requestId !== recognitionRequestIdRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        mediaStreamRef.current = stream;
        const preferredMimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(
          (mimeType) => MediaRecorder.isTypeSupported(mimeType),
        );
        const recorder = preferredMimeType
          ? new MediaRecorder(stream, { mimeType: preferredMimeType })
          : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];
        recordingContextRef.current = {
          surahNumber: surah.number,
          ayahNumber: currentAyah.numberInSurah,
        };
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };
        recorder.onerror = () => {
          setSpeechRecognitionError('تعذر تسجيل الصوت. تحقق من إذن الميكروفون وحاول مجددًا.');
          setIsListening(false);
          mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
          mediaRecorderRef.current = null;
        };
        recorder.onstop = () => {
          const audio = new Blob(audioChunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          });
          const context = recordingContextRef.current;
          audioChunksRef.current = [];
          mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
          mediaRecorderRef.current = null;

          if (audio.size === 0) {
            setSpeechRecognitionError('لم يُسجل صوت. ابدأ التسجيل مجددًا ثم أوقفه بعد التلاوة.');
            return;
          }

          setIsTranscribing(true);
          void transcribeQuranRecitation(audio, context)
            .then((transcript) => {
              const currentContext = currentAyahContextRef.current;
              if (
                currentContext.surahNumber !== context.surahNumber ||
                currentContext.ayahNumber !== context.ayahNumber
              ) {
                setSpeechRecognitionError('تغيرت الآية أثناء تحليل التسجيل. أعد تسميع الآية الحالية.');
                return;
              }
              const nextState = incomingSpeechHandlerRef.current(transcript);
              if (nextState?.completed) {
                ayahCompletionHandlerRef.current(nextState.isFlawless);
              }
            })
            .catch((error: unknown) => {
              console.error('Quran Whisper transcription failed:', error);
              setSpeechRecognitionError(
                error instanceof Error
                  ? error.message
                  : 'تعذر تحليل التلاوة. تحقق من اتصال الخادم وحاول مجددًا.',
              );
            })
            .finally(() => setIsTranscribing(false));
        };
        recorder.start();
        setSpeechRecognitionError(null);
        setIsListening(true);
      } catch (error) {
        console.error('Unable to start Quran Whisper recording:', error);
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsListening(false);
        setSpeechRecognitionError(
          'تعذر بدء التسجيل. اسمح باستخدام الميكروفون وتحقق من إعدادات الجهاز.',
        );
      }
      return;
    }

    // ---------- الجوال ----------
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

    // ---------- الويب ----------
    const hostname = window.location.hostname;
    if (
      !window.isSecureContext &&
      hostname !== 'localhost' &&
      hostname !== '127.0.0.1' &&
      hostname !== '[::1]' &&
      hostname !== '::1'
    ) {
      recognitionEnabledRef.current = false;
      isSurahRecitationModeRef.current = false;
      setIsSurahRecitationMode(false);
      setIsListening(false);
      setSpeechRecognitionError('يتطلب تشغيل الميكروفون فتح الموقع عبر اتصال آمن (HTTPS).');
      setShowSimulatedInput(true);
      return;
    }

    if (!speechSupported) {
      recognitionEnabledRef.current = false;
      isSurahRecitationModeRef.current = false;
      setIsSurahRecitationMode(false);
      setShowSimulatedInput(true);
      setIsListening(false);
      setSpeechRecognitionError(
        'التعرّف الصوتي غير مدعوم في هذا المتصفح. جرّب Chrome أو Edge محدّثًا.',
      );
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
        console.warn('Unable to start web speech recognition:', error);
        recognitionEnabledRef.current = false;
        isSurahRecitationModeRef.current = false;
        setIsSurahRecitationMode(false);
        setIsListening(false);
        setSpeechRecognitionError(
          'تعذّر بدء التعرّف الصوتي. تحقق من إذن الميكروفون واستخدم اتصال HTTPS.',
        );
        setShowSimulatedInput(true);
      }
    } else {
      recognitionEnabledRef.current = false;
      isSurahRecitationModeRef.current = false;
      setIsSurahRecitationMode(false);
      setIsListening(false);
      setSpeechRecognitionError('تعذّر تهيئة التعرّف الصوتي في هذا المتصفح.');
      setShowSimulatedInput(true);
    }
  };

  // ============================================================
  // إيقاف الاستماع
  // ============================================================
  const stopListening = async () => {
    recognitionRequestIdRef.current += 1;
    const wasRecognitionEnabled = recognitionEnabledRef.current;
    recognitionEnabledRef.current = false;
    isSurahRecitationModeRef.current = false;
    setIsSurahRecitationMode(false);
    setIsAyahCompleted(false);
    isAyahCompletedRef.current = false;
    setIsListening(false);

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      return;
    }

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

  // ============================================================
  // إيقاف التسميع للسورة بالكامل
  // ============================================================
  const stopSurahRecitation = async () => {
    await stopListening();
    surahRecitationSummaryRef.current = { completedAyahs: 0, accuratelyMatchedAyahs: 0 };
    setSurahRecitationResult(null);
    ayahCompletionHandledRef.current = false;
    completionLockRef.current = false;
    resetRecitationState();
  };

  const toggleListening = async () => {
    if (isListening) {
      await stopListening();
      return;
    }
    await startListening();
  };

  // ============================================================
  // تشغيل صوت الشيخ
  // ============================================================
  const playAyahAudio = () => {
    const audioUrl = getAyahAudioUrl(selectedReciter.id, surah.number, currentAyah.numberInSurah);

    if (isPlayingAudio) {
      stopAudio();
      return;
    }

    playAudio(
      audioUrl,
      () => {
      if (mode === 'listen_repeat') {
        void toggleListening();
      }
      },
      mode === 'listen_repeat' ? repeatCount : 1,
    );
  };

  // ============================================================
  // التنقل بين الآيات يدويًا
  // ============================================================
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

  // ============================================================
  // المحاكي اليدوي (للاختبار أو الأجهزة بدون ميكروفون)
  // ============================================================
  const submitSimulatedWord = (wordText: string) => {
    const nextState = handleIncomingSpokenText(wordText);
    if (nextState?.completed) {
      handleAyahCompletion(nextState.isFlawless);
    }
  };

  const loadSimilarAyahPractice = async () => {
    setShowSimilarAyahs(true);
    setIsLoadingSimilarAyahs(true);
    setSimilarAyahError(null);
    const requestId = ++similarAyahRequestIdRef.current;
    const sourceContext = currentAyahContextRef.current;

    try {
      const allAyahs = await getAllQuranAyahs();
      if (requestId !== similarAyahRequestIdRef.current) return;
      const currentContext = currentAyahContextRef.current;
      if (
        currentContext.surahNumber !== sourceContext.surahNumber ||
        currentContext.ayahNumber !== sourceContext.ayahNumber
      ) {
        return;
      }
      setSimilarAyahs(
        findSimilarAyahs(
          currentAyahText,
          allAyahs,
          sourceContext.surahNumber,
          sourceContext.ayahNumber,
        ),
      );
    } catch (error) {
      console.error('Unable to load similar Quran verses:', error);
      setSimilarAyahError(
        error instanceof Error ? error.message : 'تعذر تحميل الآيات المتشابهة. حاول مجددًا.',
      );
    } finally {
      if (requestId === similarAyahRequestIdRef.current) setIsLoadingSimilarAyahs(false);
    }
  };

  // ============================================================
  // التلميح
  // ============================================================
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

  const toggleSimilarAyahPractice = () => {
    if (showSimilarAyahs) {
      similarAyahRequestIdRef.current += 1;
      setIsLoadingSimilarAyahs(false);
      setShowSimilarAyahs(false);
      return;
    }
    void loadSimilarAyahPractice();
  };

  // ============================================================
  // الواجهة
  // ============================================================
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* الشريط العلوي: اختيار السورة، الوضع، التنقل */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* اختيار السورة + مؤشر الآية */}
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

          {/* تبديل الوضع: استمع ثم ردّد */}
          <div className="flex w-full flex-wrap items-center justify-center gap-1 rounded-xl bg-stone-100 p-1 sm:w-auto">
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
            {mode === 'listen_repeat' && (
              <div
                className="flex items-center gap-1 rounded-lg bg-white/70 p-1"
                role="group"
                aria-label="عدد مرات تكرار تلاوة القارئ"
              >
                {[1, 3, 5].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setRepeatCount(count)}
                    aria-pressed={repeatCount === count}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      repeatCount === count
                        ? 'bg-emerald-800 text-white'
                        : 'text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {count.toLocaleString('ar-EG')} {count === 1 ? 'مرة' : 'مرات'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* فتح التفسير */}
          <button
            onClick={() => onOpenTafsir(currentAyah)}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>التفسير الميسر</span>
          </button>
        </div>
      </div>

      {/* ساحة التسميع الرئيسية */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden relative">
        {/* رأس الصندوق */}
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
              type="button"
              onClick={() => setShowAyahText((visible) => !visible)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-stone-600 transition-colors hover:bg-stone-200/60 hover:text-stone-900"
              aria-pressed={!showAyahText}
            >
              {showAyahText ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span>{showAyahText ? 'إخفاء الآيات' : 'كشف الآيات'}</span>
            </button>
            <button
              onClick={giveHint}
              className="flex items-center gap-1 text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 px-2 py-1 rounded-md text-[11px] transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
              <span>تلميح</span>
            </button>
          </div>
        </div>

        <div className="flex min-h-56 flex-col items-center justify-center gap-6 bg-stone-50 px-4 py-8">
          <div className="w-full bg-[#f8f5ed] px-3 py-5 sm:px-6 sm:py-8">
            <div
              className="mx-auto max-w-3xl rounded-2xl border border-[#c8b98c] bg-[#fbf9f3] p-3 shadow-inner sm:p-6"
              aria-live="off"
              aria-label={showAyahText ? `آيات سورة ${surah.name}` : 'آيات السورة مخفية'}
            >
              <div className="mb-5 rounded-full border border-emerald-200 bg-gradient-to-l from-indigo-900 via-emerald-800 to-indigo-900 px-4 py-2 text-center text-lg font-bold text-white shadow-sm">
                سورة {surah.name}
              </div>
              {surah.number !== 1 && surah.number !== 9 && (
                <p className="font-quran mb-4 text-center text-2xl text-stone-900 sm:text-3xl">
                  بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                </p>
              )}
              <div className="divide-y divide-dotted divide-[#b8aa83]" dir="rtl">
                {surah.ayahs.map((ayah, ayahIndex) => {
                  const isCurrentAyah = ayahIndex === currentAyahIndex;
                  const savedProgress = recitationProgress[ayah.numberInSurah];
                  const ayahMatchedWords = isCurrentAyah
                    ? matchedWords
                    : (savedProgress?.matchedWords ?? []);
                  const ayahFailedWords = isCurrentAyah
                    ? failedWords
                    : (savedProgress?.failedWords ?? {});
                  const ayahWords = surahVerseWords[ayahIndex];

                  return (
                    <div
                      key={ayah.numberInSurah}
                      ref={isCurrentAyah ? currentAyahRowRef : undefined}
                      className={`flex items-center gap-3 py-3 sm:gap-4 sm:py-4 ${
                        isCurrentAyah ? 'bg-emerald-50/60' : ''
                      }`}
                      aria-current={isCurrentAyah ? 'location' : undefined}
                    >
                      <p className="font-quran flex-1 text-right text-2xl leading-[2.1] text-stone-900 sm:text-3xl">
                        {ayahWords.map((word, index) => {
                          const wasHeard = ayahMatchedWords.includes(index);
                          const needsReview = Object.hasOwn(ayahFailedWords, index);
                          const isCurrentWord =
                            isCurrentAyah && index === currentWordIdx && !isAyahCompleted;
                          const wordClass = needsReview
                            ? 'rounded-md bg-red-100 px-1 text-red-700'
                            : wasHeard
                              ? 'rounded-md bg-emerald-100/80 px-1 text-emerald-900'
                              : isCurrentWord
                                ? 'rounded-md bg-emerald-50 px-1 text-emerald-950 underline decoration-emerald-600 decoration-2 underline-offset-4'
                                : '';

                          return (
                            <React.Fragment key={`${word.index}-${word.original}`}>
                              <span className={wordClass}>
                                {showAyahText
                                  ? word.original
                                  : wasHeard
                                    ? word.original
                                    : needsReview
                                      ? ayahFailedWords[index] === 'تم تخطيها'
                                        ? word.original
                                        : ayahFailedWords[index]
                                      : 'ـــ'}
                              </span>{' '}
                            </React.Fragment>
                          );
                        })}
                      </p>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white text-xs font-bold text-emerald-800">
                        {ayah.numberInSurah.toLocaleString('ar-EG')}
                      </span>
                    </div>
                  );
                })}
              </div>
              {!showAyahText && (
                <p className="mt-3 text-center text-xs text-stone-500">
                  ستظهر الكلمات الصحيحة أثناء التسميع، وتظهر الكلمات المسموعة بشكل مختلف بالأحمر.
                </p>
              )}
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs text-stone-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-emerald-200" />
                كلمة صحيحة
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-red-200" />
                كلمة تحتاج إلى مراجعة
              </span>
            </div>
          </div>

          {/* تنبيه موضع اختلاف التعرّف */}
          {activeMistakeAlert && !isAyahCompleted && (
            <div
              className="w-full max-w-lg animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-right shadow-xs"
              role="status"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div className="flex-1 space-y-1.5 text-xs text-amber-950">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-amber-900">
                      {activeMistakeAlert.heard === 'تلميح استحضار'
                        ? 'تلميح للكلمة التالية'
                        : 'موضع يحتاج إلى مراجعة'}
                    </span>
                    <button
                      onClick={playAyahAudio}
                      className="flex items-center gap-1 text-[11px] text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-1 rounded-md font-semibold transition-colors"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>استمع للفظ الصحيح</span>
                    </button>
                  </div>

                  <p className="text-stone-700">
                    الكلمة الصحيحة:{' '}
                    <span className="font-quran text-lg font-bold text-emerald-800 px-1">
                      {activeMistakeAlert.expected}
                    </span>
                  </p>

                  {activeMistakeAlert.heard && activeMistakeAlert.heard !== 'تلميح استحضار' && (
                    <p className="text-[11px] text-stone-600">
                      ما تعرّف عليه النظام:{' '}
                      <span className="font-medium text-stone-800">{activeMistakeAlert.heard}</span>
                    </p>
                  )}
                  <p className="text-[11px] leading-relaxed text-stone-600">
                    {activeMistakeAlert.isUncertain
                      ? 'قد يكون هذا الاختلاف من التعرّف الصوتي، وليس خطأً مؤكدًا في التلاوة. أعد القراءة أو استمع للآية.'
                      : 'التنبيه مبني على مطابقة النص آليًا ولا يؤكد خطأ النطق أو التجويد.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveMistakeAlert(null)}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900 transition-colors hover:bg-amber-100"
                  >
                    أعد المحاولة
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* بانر إتمام السورة */}
          {surahRecitationResult &&
            isAyahCompleted &&
            currentAyahIndex === surah.ayahs.length - 1 && (
              <div className="mt-6 w-full max-w-md bg-emerald-50 border border-emerald-300 rounded-2xl p-4 text-center shadow-xs animate-in zoom-in-95">
                <div className="flex items-center justify-center gap-2 text-emerald-800 font-bold text-base mb-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>ما شاء الله! اكتمل التسميع</span>
                </div>
                <p className="text-sm font-bold text-emerald-800">
                  نسبة تطابق الكلمات آليًا:{' '}
                  {Math.round(
                    (surahRecitationResult.accuratelyMatchedAyahs /
                      surahRecitationResult.completedAyahs) *
                      100,
                  )}
                  %
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  {surahRecitationResult.accuratelyMatchedAyahs} من{' '}
                  {surahRecitationResult.completedAyahs} آية اكتملت المطابقة الآلية لنصها.
                </p>
                <p className="mt-2 text-[11px] text-stone-600">
                  التقييم يعتمد على مطابقة النص عبر التعرّف الصوتي، ولا يقيّم أحكام التجويد.
                </p>
              </div>
            )}
        </div>

        {/* شريط التحكم السفلي */}
        <div className="bg-stone-50 px-6 py-4 border-t border-stone-200 flex flex-wrap items-center justify-between gap-4">
          {/* التنقل: السابق / التالي / إعادة */}
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
                completionLockRef.current = false;
                resetRecitationState();
              }}
              className="p-2.5 rounded-xl border border-stone-200 bg-white text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
              title="إعادة تسميع هذه الآية"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>

          {/* الزر الرئيسي: الميكروفون */}
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <button
              onClick={toggleListening}
              disabled={isTranscribing}
              className={`relative flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-sm shadow-md transition-all cursor-pointer ${
                isListening
                  ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse ring-4 ring-rose-200'
                  : 'bg-emerald-700 hover:bg-emerald-800 text-white ring-4 ring-emerald-100'
              }`}
            >
              {isListening ? (
                <>
                  <MicOff className="w-5 h-5" />
                  <span>
                    {isQuranAsrConfigured
                      ? 'جارٍ التسجيل... انقر للتحليل'
                      : 'جارٍ الاستماع... انقر للإيقاف'}
                  </span>
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5" />
                  <span>{isQuranAsrConfigured ? 'ابدأ تسجيل الآية' : 'ابدأ تسميع السورة'}</span>
                </>
              )}
            </button>

            {isTranscribing && (
              <p
                className="w-full text-center text-xs font-semibold text-emerald-800"
                role="status"
              >
                يجري تحليل التلاوة بمحرك Whisper القرآني...
              </p>
            )}
            {isQuranAsrConfigured && (
              <p className="w-full text-center text-[11px] text-stone-500">
                يُرسل التسجيل إلى خادم Whisper المهيأ بعد إيقاف التسجيل.
              </p>
            )}

            {speechRecognitionError && (
              <p
                className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs leading-5 text-amber-900"
                role="alert"
              >
                {speechRecognitionError}
              </p>
            )}

            {!isListening && !isTranscribing && (
              <span className="w-full text-center text-[11px] text-stone-500">
                {isQuranAsrConfigured
                  ? 'سجّل تلاوة الآية ثم أوقف التسجيل لإرسالها للتحليل.'
                  : 'ينتقل تلقائيًا بين الآيات حتى نهاية السورة.'}
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

            {/* زر صوت الشيخ */}
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

          {/* تبديل المحاكي */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSimilarAyahPractice}
              className="text-xs text-emerald-800 hover:text-emerald-950 underline decoration-dotted"
              aria-expanded={showSimilarAyahs}
            >
              {showSimilarAyahs ? 'إخفاء المتشابهات' : 'تدرّب على الآيات المتشابهة'}
            </button>
            <button
              onClick={() => setShowSimulatedInput(!showSimulatedInput)}
              className="text-xs text-stone-500 hover:text-stone-800 underline decoration-dotted"
            >
              {showSimulatedInput ? 'إخفاء محاكي التسميع' : 'محاكي التسميع والكلمات'}
            </button>
          </div>
        </div>

        {/* المحاكي التفاعلي */}
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

      {showSimilarAyahs && (
        <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-5">
          <div>
            <h2 className="font-bold text-emerald-950">تدريب المتشابهات اللفظية</h2>
            <p className="mt-1 text-xs leading-5 text-emerald-900">
              اقتراحات آلية لآيات تشترك في مفردات قرآنية؛ راجع السياق ولا تعتمد عليها كتفسير.
            </p>
          </div>

          {isLoadingSimilarAyahs && (
            <p className="text-sm text-stone-600" role="status">
              جارٍ تحميل نص القرآن والبحث عن الآيات المتشابهة...
            </p>
          )}
          {similarAyahError && (
            <div
              className="flex items-center justify-between gap-3 text-sm text-rose-800"
              role="alert"
            >
              <span>{similarAyahError}</span>
              <button
                type="button"
                onClick={() => void loadSimilarAyahPractice()}
                className="shrink-0 rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-semibold"
              >
                إعادة المحاولة
              </button>
            </div>
          )}
          {!isLoadingSimilarAyahs && !similarAyahError && similarAyahs.length === 0 && (
            <p className="text-sm text-stone-600">لم نعثر على آيات ذات مفردات مشتركة كافية.</p>
          )}
          {!isLoadingSimilarAyahs && similarAyahs.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {similarAyahs.map((ayah) => (
                <article
                  key={`${ayah.surahNumber}_${ayah.numberInSurah}`}
                  className="space-y-3 rounded-xl border border-emerald-100 bg-white p-4"
                >
                  <p className="text-xs font-semibold text-emerald-800">
                    سورة {ayah.surahName} · الآية {ayah.numberInSurah}
                  </p>
                  <p className="font-quran text-xl leading-loose text-stone-900">{ayah.text}</p>
                  <div className="flex flex-wrap gap-1.5" aria-label="المفردات المشتركة">
                    {ayah.sharedWords.map((word) => (
                      <span
                        key={word}
                        className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900"
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void stopSurahRecitation();
                      setShowSimilarAyahs(false);
                      onSelectSurahChange(ayah.surahNumber, ayah.numberInSurah);
                    }}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                  >
                    انتقل للتسميع
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* بطاقة النصيحة */}
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