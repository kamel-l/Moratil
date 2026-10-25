import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import {
  Mic, MicOff, CheckCircle2, XCircle, RotateCcw, Trophy,
  Play, Eye, EyeOff, StopCircle,
} from 'lucide-react';
import { Surah, Reciter } from '../types/quran';
import { extractWords, normalizeArabicText } from '../utils/arabicUtils';
import { recordVerseResult, addPointsAndVerses } from '../services/storageService';
import { useRecitationSession } from '../hooks/useRecitationSession';

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

interface TestResult {
  ayahNumber: number;
  isFlawless: boolean;
  failedWords: { expectedWord: string; recitedWord: string }[];
}

interface MemorizationTestProps {
  surah: Surah;
  selectedReciter: Reciter;
  onStatsUpdate: () => void;
  embedded?: boolean;
}

type TestPhase = 'setup' | 'testing' | 'results';
type HintMode = 'blind' | 'letter';

export const MemorizationTest: React.FC<MemorizationTestProps> = ({
  surah, onStatsUpdate, embedded = false,
}) => {
  const [phase, setPhase] = useState<TestPhase>('setup');
  const [hintMode, setHintMode] = useState<HintMode>('blind');
  const [startAyah, setStartAyah] = useState(1);
  const [endAyah, setEndAyah] = useState(() => Math.min(3, surah.ayahs.length));
  const [currentTestAyah, setCurrentTestAyah] = useState(1);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [endedAt, setEndedAt] = useState(0);

  // Refs
  const recognitionRef = useRef<any>(null);
  const incomingSpeechHandlerRef = useRef<
    (text: string, confidence?: number) => { completed: boolean; isFlawless: boolean } | undefined
  >(() => undefined);
  const verseCompletionHandlerRef = useRef<(isFlawless: boolean) => void>(() => {});
  const nativeRecognitionRunnerRef = useRef<() => Promise<void>>(async () => {});
  const nativeRecognitionActiveRef = useRef(false);
  const recognitionEnabledRef = useRef(false);
  const recognitionRequestIdRef = useRef(0);
  const isAyahCompletedRef = useRef(false);
  const completionHandledRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  const currentWordIdxForAltRef = useRef(0);
  const phaseRef = useRef<TestPhase>('setup');

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const currentAyah = surah.ayahs[currentTestAyah - 1];

  const verseWords = useMemo(() => {
    if (!currentAyah) return [];
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
    currentWordIdx, matchedWords, isAyahCompleted,
    completionLockRef, handleIncomingSpokenText, resetRecitationState, failedWordsRef,
  } = useRecitationSession(verseWords);

  useEffect(() => { currentWordIdxForAltRef.current = currentWordIdx; }, [currentWordIdx]);

  // Reset عند تغيّر الآية داخل الاختبار
  useEffect(() => {
    if (phase !== 'testing') return;
    completionHandledRef.current = false;
    isAyahCompletedRef.current = false;
    completionLockRef.current = false;
    resetRecitationState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTestAyah, phase]);

  // Reset عند تغيير السورة
  useEffect(() => {
    setPhase('setup');
    setStartAyah(1);
    setEndAyah(Math.min(3, surah.ayahs.length));
    setCurrentTestAyah(1);
    setTestResults([]);
    setIsListening(false);
    recognitionEnabledRef.current = false;
    nativeRecognitionActiveRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah.number]);

  // ============ إتمام الآية ============
  function handleVerseComplete(isFlawless: boolean) {
    if (completionHandledRef.current) return;
    completionHandledRef.current = true;

    const failedWordsList = Object.entries(failedWordsRef.current).map(([idx, heard]) => ({
      expectedWord: verseWords[parseInt(idx, 10)]?.original || '',
      recitedWord: heard,
    }));

    const result: TestResult = {
      ayahNumber: currentAyah.numberInSurah,
      isFlawless,
      failedWords: failedWordsList,
    };

    setTestResults((prev) => [...prev, result]);
    recordVerseResult(surah.number, currentAyah.numberInSurah, isFlawless, failedWordsList);
    addPointsAndVerses(isFlawless ? 35 : 20, 1, 30, isFlawless ? 100 : 85);
    onStatsUpdate();

    if (currentTestAyah < endAyah) {
      cooldownUntilRef.current = Date.now() + 200;
      setCurrentTestAyah((prev) => prev + 1);
    } else {
      void finalizeTest();
    }
  }
  verseCompletionHandlerRef.current = handleVerseComplete;

  async function finalizeTest() {
    setEndedAt(Date.now());
    setPhase('results');
    await stopListeningInternal();
  }

  // ============ التعرف الصوتي — الويب ============
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
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
        if (recognitionEnabledRef.current && phaseRef.current === 'testing') {
          setTimeout(() => {
            if (recognitionEnabledRef.current && phaseRef.current === 'testing') {
              try { recognition.start(); setIsListening(true); }
              catch (e) {
                if (e instanceof DOMException && e.name === 'InvalidStateError') {
                  setIsListening(true); return;
                }
                recognitionEnabledRef.current = false;
                setIsListening(false);
              }
            }
          }, 250);
          return;
        }
        setIsListening(false);
      };
      recognition.onerror = (event: any) => {
        if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(event.error)) {
          recognitionEnabledRef.current = false;
          setIsListening(false);
          try { recognitionRef.current?.stop(); } catch (e) { /* ignore */ }
        }
      };
      recognition.onresult = (event: any) => {
        if (!recognitionEnabledRef.current) return;
        if (phaseRef.current !== 'testing') return;
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
              verseCompletionHandlerRef.current(nextState.isFlawless);
              return;
            }
            if (currentWordIdxForAltRef.current > beforeIdx) { progressed = true; break; }
          }
          if (progressed) break;
        }
      };
      recognitionRef.current = recognition;
    } catch (e) { console.warn('[Test SR] init error:', e); }

    return () => {
      recognitionRequestIdRef.current += 1;
      recognitionEnabledRef.current = false;
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  incomingSpeechHandlerRef.current = handleIncomingSpokenText;

  // ============ التعرف الصوتي — الجوال ============
  const listenWithNativeRecognition = async () => {
    if (!nativeRecognitionActiveRef.current) return;
    try {
      const { matches } = await SpeechRecognition.start({
        language: 'ar-SA', maxResults: 3, partialResults: false, popup: false,
      });
      if (!nativeRecognitionActiveRef.current) return;

      if (phaseRef.current === 'testing' && Date.now() >= cooldownUntilRef.current) {
        const alts = (matches || []).slice(0, 3);
        for (const raw of alts) {
          const text = raw?.trim();
          if (!text) continue;
          const beforeIdx = currentWordIdxForAltRef.current;
          const nextState = incomingSpeechHandlerRef.current(text);
          if (nextState?.completed) {
            verseCompletionHandlerRef.current(nextState.isFlawless);
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
      const msg = String(error?.message || error || '').toLowerCase();
      const isSilence =
        msg.includes('no match') || msg.includes('speech timeout') ||
        msg.includes('no speech') || msg.includes('timed out');
      if (isSilence && nativeRecognitionActiveRef.current) {
        setTimeout(() => {
          if (nativeRecognitionActiveRef.current) void nativeRecognitionRunnerRef.current();
        }, 600);
        return;
      }
      nativeRecognitionActiveRef.current = false;
      recognitionEnabledRef.current = false;
      setIsListening(false);
    }
  };
  nativeRecognitionRunnerRef.current = listenWithNativeRecognition;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle: any = null;
    let cancelled = false;
    (async () => {
      try {
        handle = await SpeechRecognition.addListener(
          'listeningState',
          (data: { status: 'started' | 'stopped' }) => {
            if (cancelled) return;
            if (data.status === 'stopped' && nativeRecognitionActiveRef.current && phaseRef.current === 'testing') {
              setTimeout(() => {
                if (nativeRecognitionActiveRef.current && phaseRef.current === 'testing') {
                  void nativeRecognitionRunnerRef.current();
                }
              }, 300);
            }
          },
        );
      } catch (e) { /* ignore */ }
    })();
    return () => {
      cancelled = true;
      if (handle) handle.remove().catch(() => {});
    };
  }, []);

  // ============ Start / Stop ============
  async function startListeningInternal() {
    recognitionEnabledRef.current = true;
    recognitionRequestIdRef.current += 1;
    const reqId = recognitionRequestIdRef.current;
    setIsListening(true);
    cooldownUntilRef.current = 0;

    if (Capacitor.isNativePlatform()) {
      try {
        const { available } = await SpeechRecognition.available();
        if (reqId !== recognitionRequestIdRef.current) return;
        if (!available) { recognitionEnabledRef.current = false; setIsListening(false); return; }
        let perm = await SpeechRecognition.checkPermissions();
        if (perm.speechRecognition !== 'granted') perm = await SpeechRecognition.requestPermissions();
        if (reqId !== recognitionRequestIdRef.current) return;
        if (perm.speechRecognition !== 'granted') { recognitionEnabledRef.current = false; setIsListening(false); return; }
        nativeRecognitionActiveRef.current = true;
        void listenWithNativeRecognition();
      } catch (e) { recognitionEnabledRef.current = false; setIsListening(false); }
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.start(); }
      catch (e) {
        if (e instanceof DOMException && e.name === 'InvalidStateError') return;
        recognitionEnabledRef.current = false;
        setIsListening(false);
      }
    } else {
      recognitionEnabledRef.current = false;
      setIsListening(false);
    }
  }

  async function stopListeningInternal() {
    recognitionRequestIdRef.current += 1;
    recognitionEnabledRef.current = false;
    if (Capacitor.isNativePlatform()) {
      if (nativeRecognitionActiveRef.current) {
        nativeRecognitionActiveRef.current = false;
        try { await SpeechRecognition.stop(); } catch (e) { /* ignore */ }
      }
    } else if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
    }
    setIsListening(false);
  }

  // ============ أفعال المستخدم ============
  async function startTest() {
    if (startAyah < 1 || endAyah > surah.ayahs.length || startAyah > endAyah) return;
    setTestResults([]);
    setCurrentTestAyah(startAyah);
    setStartedAt(Date.now());
    setEndedAt(0);
    completionHandledRef.current = false;
    isAyahCompletedRef.current = false;
    completionLockRef.current = false;
    resetRecitationState();
    setPhase('testing');
    setTimeout(() => { void startListeningInternal(); }, 300);
  }

  async function stopTest() { await finalizeTest(); }
  function resetToSetup() { setPhase('setup'); setTestResults([]); setCurrentTestAyah(startAyah); setStartedAt(0); setEndedAt(0); }
  function retryTest() { void startTest(); }

  // ============ حسابات ============
  const totalVersesInRange = endAyah - startAyah + 1;
  const completedCount = testResults.length;
  const perfectCount = testResults.filter((r) => r.isFlawless).length;
  const accuracyPercent = completedCount > 0 ? Math.round((perfectCount / completedCount) * 100) : 0;
  const durationSec = endedAt > 0 && startedAt > 0 ? Math.round((endedAt - startedAt) / 1000) : 0;
  const durationStr = `${Math.floor(durationSec / 60)}:${(durationSec % 60).toString().padStart(2, '0')}`;

  // ============ Render ============
  return (
    <div
      className={`${embedded ? 'h-full' : 'h-[100dvh]'} max-w-4xl mx-auto flex flex-col bg-stone-100 overflow-hidden`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {phase === 'setup' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-md mx-auto space-y-4">
            <div className="text-center py-4">
              <Trophy className="w-14 h-14 mx-auto text-emerald-600 mb-2" />
              <h2 className="text-xl font-bold text-stone-900">اختبار الحفظ</h2>
              <p className="text-sm text-stone-500 mt-1">سورة {surah.name} · اختبر حفظك من الذاكرة</p>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-stone-200 space-y-3">
              <h3 className="font-semibold text-sm text-stone-700">نطاق الاختبار</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-stone-500 mb-1">من آية</label>
                  <input type="number" min={1} max={surah.ayahs.length} value={startAyah}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(surah.ayahs.length, Number(e.target.value) || 1));
                      setStartAyah(v); if (v > endAyah) setEndAyah(v);
                    }}
                    className="w-full bg-stone-50 border border-stone-300 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">إلى آية</label>
                  <input type="number" min={1} max={surah.ayahs.length} value={endAyah}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(surah.ayahs.length, Number(e.target.value) || 1));
                      setEndAyah(v); if (v < startAyah) setStartAyah(v);
                    }}
                    className="w-full bg-stone-50 border border-stone-300 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>
              <p className="text-xs text-stone-500">
                عدد الآيات: <span className="font-bold text-emerald-700">{totalVersesInRange}</span> من {surah.ayahs.length}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-stone-200 space-y-2">
              <h3 className="font-semibold text-sm text-stone-700">طريقة الاختبار</h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setHintMode('blind')}
                  className={`p-3 rounded-xl border-2 transition text-center ${hintMode === 'blind' ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 bg-white'}`}
                >
                  <EyeOff className={`w-5 h-5 mx-auto mb-1 ${hintMode === 'blind' ? 'text-emerald-700' : 'text-stone-400'}`} />
                  <p className="text-xs font-bold">بدون مساعدة</p>
                  <p className="text-[10px] text-stone-500">لا شيء يظهر</p>
                </button>
                <button onClick={() => setHintMode('letter')}
                  className={`p-3 rounded-xl border-2 transition text-center ${hintMode === 'letter' ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 bg-white'}`}
                >
                  <Eye className={`w-5 h-5 mx-auto mb-1 ${hintMode === 'letter' ? 'text-emerald-700' : 'text-stone-400'}`} />
                  <p className="text-xs font-bold">أول حرف</p>
                  <p className="text-[10px] text-stone-500">تلميح بسيط</p>
                </button>
              </div>
            </div>

            <button onClick={() => void startTest()}
              className="w-full py-3 bg-emerald-700 text-white font-bold rounded-2xl text-sm hover:bg-emerald-800 flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" /> ابدأ الاختبار
            </button>
          </div>
        </div>
      )}

      {phase === 'testing' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-4 text-center bg-white border-b border-stone-200">
            <p className="text-xs text-stone-500">الآية</p>
            <p className="text-2xl font-bold text-emerald-800">{currentTestAyah}</p>
            <p className="text-xs text-stone-500">
              من {endAyah} · اختبار {completedCount + 1} من {totalVersesInRange}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-md mx-auto space-y-4">
              <div className="flex flex-wrap gap-1.5 justify-center">
                {verseWords.map((_, idx) => {
                  const isMatched = matchedWords.includes(idx);
                  const isFailed = idx in failedWordsRef.current;
                  const isCurrent = idx === currentWordIdx && !isAyahCompleted;
                  return (
                    <div key={idx}
                      className={`w-2.5 h-2.5 rounded-full transition-all ${
                        isMatched ? 'bg-emerald-500' :
                        isFailed ? 'bg-rose-500' :
                        isCurrent ? 'bg-amber-500 ring-2 ring-amber-300 scale-125' :
                        'bg-stone-300'
                      }`}
                    />
                  );
                })}
              </div>

              {hintMode === 'letter' && (
                <div className="text-center text-lg font-quran leading-loose mt-4 flex flex-wrap gap-2 justify-center">
                  {verseWords.map((w, idx) => {
                    const isMatched = matchedWords.includes(idx);
                    const isFailed = idx in failedWordsRef.current;
                    const isCurrent = idx === currentWordIdx && !isAyahCompleted;
                    const firstLetter = w.original[0] || '';
                    return (
                      <span key={idx}
                        className={`inline-block px-1 rounded ${
                          isFailed ? 'text-rose-500 line-through' :
                          isMatched ? 'text-emerald-600' :
                          isCurrent ? 'text-amber-600 font-bold ring-2 ring-amber-400' :
                          'text-stone-400'
                        }`}
                      >
                        {isMatched ? w.original : `${firstLetter}…`}
                      </span>
                    );
                  })}
                </div>
              )}

              <p className="text-center text-xs text-stone-500 mt-4">
                الكلمة {Math.min(currentWordIdx + 1, verseWords.length)} من {verseWords.length}
              </p>

              {isListening && (
                <p className="text-center text-xs text-emerald-700 flex items-center justify-center gap-1 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> جارٍ الاستماع...
                </p>
              )}
            </div>
          </div>

          <div className="p-4 bg-white border-t border-stone-200 flex justify-center">
            <button onClick={() => void stopTest()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-lg"
            >
              <StopCircle className="w-5 h-5" /> إنهاء الاختبار
            </button>
          </div>
        </div>
      )}

      {phase === 'results' && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-md mx-auto space-y-4">
            <div className="text-center py-4">
              <Trophy className={`w-14 h-14 mx-auto mb-2 ${
                accuracyPercent >= 80 ? 'text-amber-500' :
                accuracyPercent >= 50 ? 'text-emerald-600' : 'text-stone-400'
              }`} />
              <h2 className="text-xl font-bold text-stone-900">انتهى الاختبار</h2>
              <p className={`text-4xl font-bold mt-2 ${
                accuracyPercent >= 80 ? 'text-emerald-700' :
                accuracyPercent >= 50 ? 'text-amber-600' : 'text-rose-600'
              }`}>{accuracyPercent}%</p>
              <p className="text-xs text-stone-500 mt-1">جودة الحفظ</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white border border-stone-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-emerald-700">{perfectCount}</p>
                <p className="text-[10px] text-stone-500">آية كاملة</p>
              </div>
              <div className="bg-white border border-stone-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-stone-800">{completedCount}/{totalVersesInRange}</p>
                <p className="text-[10px] text-stone-500">مكتملة</p>
              </div>
              <div className="bg-white border border-stone-200 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-stone-800">{durationStr}</p>
                <p className="text-[10px] text-stone-500">الوقت</p>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-stone-700">تفاصيل النتائج</h3>
              {testResults.map((r) => (
                <div key={r.ayahNumber}
                  className={`bg-white border rounded-xl p-3 ${r.isFlawless ? 'border-emerald-200' : 'border-rose-200'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-stone-800">آية {r.ayahNumber}</span>
                    {r.isFlawless ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-4 h-4" /> صحيحة
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-rose-700 font-semibold">
                        <XCircle className="w-4 h-4" /> {r.failedWords.length} خطأ
                      </span>
                    )}
                  </div>
                  {!r.isFlawless && r.failedWords.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[11px]">
                      {r.failedWords.map((fw, i) => (
                        <li key={i} className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-stone-500">الصحيح:</span>
                          <span className="font-bold text-emerald-700 font-quran">{fw.expectedWord}</span>
                          <span className="text-stone-400">·</span>
                          <span className="text-stone-500">سُمِع:</span>
                          <span className="text-rose-600 font-quran">{fw.recitedWord}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              {completedCount < totalVersesInRange && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                  لم تُكمل {totalVersesInRange - completedCount} آية من أصل {totalVersesInRange}.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button onClick={resetToSetup}
                className="py-3 bg-stone-100 text-stone-700 font-semibold rounded-xl text-sm hover:bg-stone-200 flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" /> إعدادات جديدة
              </button>
              <button onClick={retryTest}
                className="py-3 bg-emerald-700 text-white font-semibold rounded-xl text-sm hover:bg-emerald-800 flex items-center justify-center gap-1.5"
              >
                <Play className="w-4 h-4" /> إعادة الاختبار
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};