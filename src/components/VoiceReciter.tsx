import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Mic, MicOff, RotateCcw, Volume2, CheckCircle2, AlertCircle,
  ChevronRight, ChevronLeft, HelpCircle, BookOpen, Headphones,
  Eye, EyeOff, Trophy, Sparkles, CalendarClock, AlertTriangle,
} from 'lucide-react';
import { Surah, Ayah, Reciter, Riwaya } from '../types/quran';
import { extractWords, normalizeArabicText } from '../utils/arabicUtils';
import { getAyahAudioUrl, getRecitersByRiwaya } from '../utils/audioReciters';
import { recordVerseResult, addPointsAndVerses } from '../services/storageService';
import { useRecitationSession } from '../hooks/useRecitationSession';
import { useAyahAudio } from '../hooks/useAyahAudio';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
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
  riwaya?: Riwaya;
}

type RecitationMode = 'karaoke' | 'listen_repeat';

const RIWAYA_LABELS: Record<Riwaya, string> = {
  hafs: 'حفص عن عاصم',
  warsh: 'ورش عن نافع',
};

function isBasmalahPrefix(words: { original: string }[]): boolean {
  if (words.length < 4) return false;
  const n0 = normalizeArabicText(words[0].original);
  const n1 = normalizeArabicText(words[1].original);
  const n2 = normalizeArabicText(words[2].original);
  const n3 = normalizeArabicText(words[3].original);
  return (
    n0 === 'بسم' &&
    n1 === 'الله' &&
    (n2 === 'الرحمن' || n2 === 'الرحمان') &&
    n3 === 'الرحيم'
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
                tab === 'recite' ? 'text-emerald-800' : 'text-stone-500 hover:text-stone-700'
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
                tab === 'test' ? 'text-emerald-800' : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <Trophy className="w-4 h-4" />
              <span>اختبار</span>
              {tab === 'test' && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-emerald-700 rounded-full" />
              )}
            </button>
          </div>

          {onClose ? <div className="w-12 shrink-0" aria-hidden="true" /> : <div className="w-2 shrink-0" aria-hidden="true" />}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'recite' && <VoiceReciterInner {...props} embedded />}
        {tab === 'test' && (
          <MemorizationTest
            surah={props.surah}
            selectedReciter={props.selectedReciter}
            onStatsUpdate={props.onStatsUpdate}
            riwaya={props.riwaya}
          />
        )}
      </div>
    </div>
  );
};

// ============================================================
// المكوّن الداخلي: منطق التسميع
// ============================================================
const VoiceReciterInner: React.FC<VoiceReciterProps> = ({
  surah,
  initialAyahNumber = 1,
  selectedReciter,
  onOpenTafsir,
  onStatsUpdate,
  onSelectSurahChange,
  allSurahsList,
  riwaya,
}) => {
  const [currentAyahIndex, setCurrentAyahIndex] = useState(() =>
    Math.max(0, Math.min(surah.ayahs.length - 1, initialAyahNumber - 1)),
  );
  const [mode, setMode] = useState<RecitationMode>('karaoke');
  const [isSurahRecitationMode, setIsSurahRecitationMode] = useState(false);
  const [showSimulatedInput, setShowSimulatedInput] = useState(false);
  const [hideUnrecitedWords, setHideUnrecitedWords] = useState(true);
  const [surahRecitationResult, setSurahRecitationResult] = useState<{
    completedAyahs: number;
    accuratelyMatchedAyahs: number;
  } | null>(null);

  const isSurahRecitationModeRef = useRef(false);
  const ayahCompletionHandledRef = useRef(false);
  const surahRecitationSummaryRef = useRef({ completedAyahs: 0, accuratelyMatchedAyahs: 0 });

  const currentAyah = surah.ayahs[currentAyahIndex] || surah.ayahs[0];

  // ✅ الرواية الفعلية
  const effectiveRiwaya: Riwaya = riwaya ?? selectedReciter.riwaya ?? 'hafs';
  const reciterRiwaya: Riwaya = selectedReciter.riwaya ?? 'hafs';
  const riwayaMismatch = effectiveRiwaya !== reciterRiwaya;

  const fallbackReciter = useMemo(
    () => getRecitersByRiwaya(effectiveRiwaya)[0] ?? null,
    [effectiveRiwaya],
  );

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
    currentWordIdxRef,
    matchedWords,
    failedWords,
    failedWordsRef,
    activeMistakeAlert,
    isAyahCompleted,
    setIsAyahCompleted,
    setActiveMistakeAlert,
    completionLockRef,
    handleIncomingSpokenText,
    resetRecitationState,
  } = useRecitationSession(verseWords);

  const {
    isListening,
    start: startRecognition,
    stop: stopRecognition,
    setCooldown,
  } = useSpeechRecognition({
    onTranscript: handleIncomingSpokenText,
    onComplete: handleAyahCompletion,
    getCurrentWordIndex: () => currentWordIdxRef.current,
    shouldListen: () => isSurahRecitationModeRef.current,
    onUnavailable: () => setShowSimulatedInput(true),
  });

  const { isPlayingAudio, playAudio, stopAudio } = useAyahAudio();

  // ============================================================
  // معالج إتمام الآية
  // ============================================================
  function handleAyahCompletion(isFlawless: boolean) {
    if (ayahCompletionHandledRef.current) return;
    ayahCompletionHandledRef.current = true;
    completionLockRef.current = true;

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
        setIsSurahRecitationMode(false);
        void stopRecognition();
      } else {
        setCooldown();
        setCurrentAyahIndex((prev) => prev + 1);
      }
      return;
    }

    if (isFlawless && !isFinalAyah) handleNextAyah();
  }

  useEffect(() => {
    ayahCompletionHandledRef.current = false;
    completionLockRef.current = false;
    resetRecitationState();
  }, [currentAyahIndex, surah.number, completionLockRef, resetRecitationState]);

  useEffect(() => {
    setCurrentAyahIndex(Math.max(0, Math.min(surah.ayahs.length - 1, initialAyahNumber - 1)));
    setSurahRecitationResult(null);
    surahRecitationSummaryRef.current = { completedAyahs: 0, accuratelyMatchedAyahs: 0 };
    isSurahRecitationModeRef.current = false;
    setIsSurahRecitationMode(false);
    void stopRecognition();
  }, [initialAyahNumber, surah.number, surah.ayahs.length, stopRecognition]);

  useEffect(() => {
    isSurahRecitationModeRef.current = isSurahRecitationMode;
  }, [isSurahRecitationMode]);

  // ============================================================
  // بدء / إيقاف الاستماع
  // ============================================================
  const startListening = async () => {
    if (isListening) return;

    if (ayahCompletionHandledRef.current) {
      resetRecitationState();
      ayahCompletionHandledRef.current = false;
      completionLockRef.current = false;
    }
    if (!isSurahRecitationModeRef.current) {
      surahRecitationSummaryRef.current = { completedAyahs: 0, accuratelyMatchedAyahs: 0 };
      setSurahRecitationResult(null);
    }
    isSurahRecitationModeRef.current = true;
    setIsSurahRecitationMode(true);

    await startRecognition();
  };

  const stopListening = async () => {
    isSurahRecitationModeRef.current = false;
    setIsSurahRecitationMode(false);
    setIsAyahCompleted(false);
    await stopRecognition();
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
  // ✅ تشغيل صوت الآية — الإصلاح الأساسي هنا
  // ============================================================
  const playAyahAudio = () => {
    if (isPlayingAudio) {
      stopAudio();
      return;
    }

    // اختَر القارئ الصحيح: إن كان قارئ المستخدم لا يطابق الرواية
    // نستخدم أول قارئ من الرواية الصحيحة
    const targetReciter =
      riwayaMismatch && fallbackReciter ? fallbackReciter : selectedReciter;

    // ✅ نمرّر effectiveRiwaya صراحةً — هذا يمنع أي استبدال صامت داخل
    //    getAyahAudioUrl، ويضمن أن مجلد القارئ الصحيح يُستخدم.
    const url = getAyahAudioUrl(
      targetReciter.id,
      surah.number,
      currentAyah.numberInSurah,
      effectiveRiwaya,
    );

    console.log(
      `[Audio] riwaya=${effectiveRiwaya}, reciter=${targetReciter.name}, folder=${targetReciter.folder}`,
    );

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
  // الواجهة
  // ============================================================
  return (
    <div className="h-full flex flex-col bg-stone-100/60 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 space-y-3">
          {/* Hero */}
          <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm relative overflow-hidden">
            <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 bg-emerald-800/80 border border-emerald-700/60 px-2.5 py-0.5 rounded-full text-[11px] text-amber-300 font-medium">
                    <CalendarClock className="w-3 h-3" />
                    <span>تسميع وتصحيح فوري</span>
                  </div>

                  <div
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                      effectiveRiwaya === 'warsh'
                        ? 'bg-purple-800/80 border-purple-600/60 text-purple-100'
                        : 'bg-emerald-800/80 border-emerald-700/60 text-emerald-100'
                    }`}
                    title="الرواية الحالية"
                  >
                    <BookOpen className="w-3 h-3" />
                    <span>{RIWAYA_LABELS[effectiveRiwaya]}</span>
                  </div>
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

          {/* تنبيه عند عدم توافق القارئ مع الرواية */}
          {riwayaMismatch && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">القارئ المختار لا يقرأ بهذه الرواية</p>
                <p className="mt-0.5 text-amber-800/90">
                  الرواية الحالية: <strong>{RIWAYA_LABELS[effectiveRiwaya]}</strong> · القارئ:{' '}
                  <strong>{selectedReciter.name}</strong> ({RIWAYA_LABELS[reciterRiwaya]}).
                  عند تشغيل الصوت سيُستخدم{' '}
                  <strong>{fallbackReciter?.name ?? 'قارئ مطابق'}</strong> تلقائيًا.
                  يُفضّل اختيار قارئ ورش من الإعدادات.
                </p>
              </div>
            </div>
          )}

          {/* شريط اختيار السورة والتفسير */}
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

          {/* بطاقة الآية */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
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

            <div className="px-4 py-5 min-h-[140px]">
              <div className="flex flex-wrap gap-1.5 text-xl sm:text-2xl leading-[2.1] font-quran text-right">
                {verseWords.map((w, idx) => {
                  const isMatched = matchedWords.includes(idx);
                  const isFailed = idx in failedWords;
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

      {/* شريط التحكم السفلي */}
      <div className="shrink-0 bg-white border-t border-stone-200 shadow-lg">
        <div className="max-w-5xl mx-auto px-2 sm:px-4 py-2">
          <div className="flex items-center justify-between gap-2">
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

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={playAyahAudio}
                className={`p-2 rounded-xl border transition-colors ${
                  isPlayingAudio
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-800 animate-pulse'
                    : 'bg-white border-stone-200 text-emerald-600 hover:bg-stone-50'
                }`}
                title={`استمع للشيخ (${RIWAYA_LABELS[effectiveRiwaya]})`}
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