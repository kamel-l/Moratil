import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Trophy, Eye, EyeOff, RotateCcw, CheckCircle2, XCircle,
  ChevronLeft, ChevronRight, Sparkles, Settings, Play, Flag,
} from 'lucide-react';
import { Surah, Reciter, Riwaya, Ayah } from '../types/quran';
import { extractWords } from '../utils/arabicUtils';
import { recordVerseResult, addPointsAndVerses } from '../services/storageService';

interface MemorizationTestProps {
  surah: Surah;
  selectedReciter: Reciter;
  onStatsUpdate: () => void;
  riwaya?: Riwaya;
}

type TestStage = 'idle' | 'running' | 'finished';
type TestMode = 'fill_blanks' | 'hide_ayahs';

interface Question {
  ayah: Ayah;
  hiddenIndices: number[];
}

interface TestResults {
  totalAyahs: number;
  correctAyahs: number;
  totalHiddenWords: number;
  correctWords: number;
}

const RIWAYA_LABELS: Record<Riwaya, string> = {
  hafs: 'حفص عن عاصم',
  warsh: 'ورش عن نافع',
};

/** خلط مصفوفة (Fisher-Yates) */
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** اختيار فهارس كلمات للإخفاء داخل آية */
function pickHiddenIndices(total: number, ratio: number): number[] {
  const count = Math.max(1, Math.round(total * ratio));
  return shuffle(Array.from({ length: total }, (_, i) => i))
    .slice(0, count)
    .sort((a, b) => a - b);
}

export const MemorizationTest: React.FC<MemorizationTestProps> = ({
  surah,
  selectedReciter,
  onStatsUpdate,
  riwaya,
}) => {
  const effectiveRiwaya: Riwaya = riwaya ?? selectedReciter.riwaya ?? 'hafs';

  // ─── حالة النطاق (تُضبط في شاشة البداية) ───
  const [startAyah, setStartAyah] = useState(1);
  const [endAyah, setEndAyah] = useState(Math.min(7, surah.ayahs.length));
  const [testMode, setTestMode] = useState<TestMode>('fill_blanks');
  const [hiddenRatio, setHiddenRatio] = useState(0.4);

  // ─── حالة الاختبار ───
  const [stage, setStage] = useState<TestStage>('idle');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(() => new Set());
  const [answered, setAnswered] = useState<Set<number>>(() => new Set());
  const [results, setResults] = useState<TestResults | null>(null);

  // ─── إعادة الضبط عند تغيّر السورة ───
  useEffect(() => {
    setStartAyah(1);
    setEndAyah(Math.min(7, surah.ayahs.length));
    setStage('idle');
    setQuestions([]);
    setCurrentIndex(0);
    setRevealedIndices(new Set());
    setAnswered(new Set());
    setResults(null);
  }, [surah.number, surah.ayahs.length]);

  // ─── بناء الأسئلة عند بدء الاختبار ───
  const buildQuestions = useCallback((): Question[] => {
    const ayahsInRange = surah.ayahs.filter(
      (a) => a.numberInSurah >= startAyah && a.numberInSurah <= endAyah,
    );
    return ayahsInRange.map((ayah) => {
      const words = extractWords(ayah.text);
      const hiddenIndices =
        testMode === 'hide_ayahs'
          ? words.map((_, i) => i) // إخفاء كل الكلمات
          : pickHiddenIndices(words.length, hiddenRatio);
      return { ayah, hiddenIndices };
    });
  }, [surah.ayahs, startAyah, endAyah, testMode, hiddenRatio]);

  const currentQuestion = questions[currentIndex];

  // ─── بدء الاختبار ───
  const startTest = () => {
    if (endAyah < startAyah) return;
    setQuestions(buildQuestions());
    setCurrentIndex(0);
    setRevealedIndices(new Set());
    setAnswered(new Set());
    setResults(null);
    setStage('running');
  };

  // ─── كشف كلمة واحدة ───
  const revealWord = (idx: number) => {
    setRevealedIndices((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
    setAnswered((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  };

  // ─── كشف كل الكلمات في الآية الحالية ───
  const revealAll = () => {
    if (!currentQuestion) return;
    setRevealedIndices((prev) => {
      const next = new Set(prev);
      currentQuestion.hiddenIndices.forEach((i) => next.add(i));
      return next;
    });
    setAnswered((prev) => {
      const next = new Set(prev);
      currentQuestion.hiddenIndices.forEach((i) => next.add(i));
      return next;
    });
  };

  const goNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  };

  // ─── إنهاء الاختبار وحساب النتائج ───
  const finishTest = () => {
    const totalHiddenWords = questions.reduce(
      (sum, q) => sum + q.hiddenIndices.length,
      0,
    );
    // عدد الكلمات التي كُشفت = المطابقة (لأننا لا نملك إدخالًا صوتيًا هنا)
    const correctWords = answered.size;
    const correctAyahs = questions.filter((q) =>
      q.hiddenIndices.every((i) => answered.has(i)),
    ).length;

    const computed: TestResults = {
      totalAyahs: questions.length,
      correctAyahs,
      totalHiddenWords,
      correctWords,
    };
    setResults(computed);

    // ─── حفظ النتائج لكل آية ───
    questions.forEach((q) => {
      const flawless = q.hiddenIndices.every((i) => answered.has(i));
      recordVerseResult(surah.number, q.ayah.numberInSurah, flawless, []);
    });

    const score = totalHiddenWords > 0 ? (correctWords / totalHiddenWords) * 100 : 0;
    addPointsAndVerses(
      Math.round(correctAyahs * 20),
      correctAyahs,
      Math.round(score),
      Math.round(score),
    );
    onStatsUpdate();
    setStage('finished');
  };

  const resetTest = () => {
    setStage('idle');
    setQuestions([]);
    setCurrentIndex(0);
    setRevealedIndices(new Set());
    setAnswered(new Set());
    setResults(null);
  };

  const maxAyah = surah.ayahs.length;
  const scorePercent =
    results && results.totalHiddenWords > 0
      ? Math.round((results.correctWords / results.totalHiddenWords) * 100)
      : 0;

  // ═══════════════════════════════════════════════════════════
  // الواجهة
  // ═══════════════════════════════════════════════════════════
  return (
    // ✅ عمود كامل الارتفاع: محتوى قابل للتمرير + شريط سفلي مثبّت
    <div className="h-full flex flex-col bg-stone-100/60">
      {/* ─────── المحتوى القابل للتمرير ─────── */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 space-y-4">
          {/* شاشة البداية */}
          {stage === 'idle' && (
            <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-5 space-y-4">
              <div className="flex items-center gap-2 text-emerald-800">
                <Trophy className="w-5 h-5" />
                <h2 className="font-bold text-stone-900">اختبار الحفظ</h2>
              </div>
              <p className="text-sm text-stone-600 leading-6">
                اختر نطاق الآيات وطريقة الاختبار، ثم اضغط «ابدأ الاختبار» من الشريط السفلي.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold text-stone-700">
                  من الآية
                  <input
                    type="number"
                    min={1}
                    max={maxAyah}
                    value={startAyah}
                    onChange={(e) => {
                      const v = Math.min(maxAyah, Math.max(1, Number(e.target.value)));
                      setStartAyah(v);
                      setEndAyah((prev) => Math.max(prev, v));
                    }}
                    className="min-h-11 w-full rounded-xl border border-stone-300 px-3 text-sm"
                  />
                </label>
                <label className="space-y-2 text-sm font-semibold text-stone-700">
                  إلى الآية
                  <input
                    type="number"
                    min={startAyah}
                    max={maxAyah}
                    value={endAyah}
                    onChange={(e) => {
                      const v = Math.min(maxAyah, Math.max(startAyah, Number(e.target.value)));
                      setEndAyah(v);
                    }}
                    className="min-h-11 w-full rounded-xl border border-stone-300 px-3 text-sm"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-stone-700">طريقة الاختبار</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setTestMode('fill_blanks')}
                    className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-colors ${
                      testMode === 'fill_blanks'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    إخفاء كلمات
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestMode('hide_ayahs')}
                    className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-colors ${
                      testMode === 'hide_ayahs'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <EyeOff className="w-4 h-4" />
                    إخفاء الآيات
                  </button>
                </div>
              </div>

              {testMode === 'fill_blanks' && (
                <label className="space-y-2 text-sm font-semibold text-stone-700">
                  نسبة الكلمات المخفية: {Math.round(hiddenRatio * 100)}%
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={10}
                    value={hiddenRatio * 100}
                    onChange={(e) => setHiddenRatio(Number(e.target.value) / 100)}
                    className="w-full accent-emerald-700"
                  />
                </label>
              )}

              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600 flex items-start gap-2">
                <Settings className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  النطاق: الآيات {startAyah}–{endAyah} · {endAyah - startAyah + 1} آية · الرواية{' '}
                  {RIWAYA_LABELS[effectiveRiwaya]}
                </span>
              </div>
            </div>
          )}

          {/* شاشة الاختبار */}
          {stage === 'running' && currentQuestion && (
            <>
              <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-stone-900">
                      الآية {currentQuestion.ayah.numberInSurah}
                    </h2>
                    <p className="text-[10px] text-stone-500">
                      {currentIndex + 1} من {questions.length}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={revealAll}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    اكشف الكل
                  </button>
                </div>

                <div className="px-4 py-6">
                  <div
                    dir="rtl"
                    className="flex flex-wrap gap-2 text-xl sm:text-2xl leading-[2.2] font-quran"
                  >
                    {extractWords(currentQuestion.ayah.text).map((word, idx) => {
                      const isHidden = currentQuestion.hiddenIndices.includes(idx);
                      const isRevealed = revealedIndices.has(idx);

                      if (!isHidden) {
                        return (
                          <span key={idx} className="text-stone-800">
                            {word.original}
                          </span>
                        );
                      }

                      if (isRevealed) {
                        return (
                          <span
                            key={idx}
                            className="rounded bg-emerald-100 px-1.5 text-emerald-800"
                          >
                            {word.original}
                          </span>
                        );
                      }

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => revealWord(idx)}
                          className="rounded border-2 border-dashed border-amber-400 bg-amber-50 px-3 py-0.5 text-amber-700 hover:bg-amber-100 transition-colors"
                          aria-label="اكشف الكلمة"
                        >
                          ؟؟؟
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={currentIndex === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                  السابق
                </button>
                <span className="text-xs text-stone-500">
                  مكشوف: {revealedIndices.size} كلمة
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={currentIndex === questions.length - 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-30"
                >
                  التالي
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* شاشة النتائج */}
          {stage === 'finished' && results && (
            <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-6 text-center space-y-4">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Trophy className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-stone-900">نتيجة الاختبار</h2>
                <p className="text-sm text-stone-500 mt-1">
                  {results.correctAyahs} من {results.totalAyahs} آية كاملة
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                  <p className="text-[10px] text-emerald-700 font-semibold">النسبة</p>
                  <p className="text-xl font-bold text-emerald-900">{scorePercent}%</p>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                  <p className="text-[10px] text-amber-700 font-semibold">كلمات</p>
                  <p className="text-xl font-bold text-amber-900">
                    {results.correctWords}/{results.totalHiddenWords}
                  </p>
                </div>
                <div className="rounded-xl bg-stone-50 border border-stone-200 p-3">
                  <p className="text-[10px] text-stone-700 font-semibold">آيات</p>
                  <p className="text-xl font-bold text-stone-900">
                    {results.correctAyahs}/{results.totalAyahs}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-2 text-xs pt-2">
                {scorePercent >= 80 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-emerald-800 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    ممتاز — ما شاء الله
                  </span>
                )}
                {scorePercent >= 50 && scorePercent < 80 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-amber-800 font-semibold">
                    جيد — واصل المراجعة
                  </span>
                )}
                {scorePercent < 50 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-rose-800 font-semibold">
                    <XCircle className="w-3.5 h-3.5" />
                    يحتاج مراجعة
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─────── الشريط السفلي المثبّت ─────── */}
      <div className="shrink-0 bg-white border-t border-stone-200 shadow-lg">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-2 flex items-center justify-between gap-2">
          {stage === 'idle' && (
            <button
              type="button"
              onClick={startTest}
              disabled={endAyah < startAyah}
              className="w-full inline-flex items-center justify-center gap-2 min-h-11 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white font-bold text-sm transition-colors"
            >
              <Play className="w-4 h-4" />
              ابدأ الاختبار
            </button>
          )}

          {stage === 'running' && (
            <>
              <span className="text-xs font-semibold text-stone-600">
                السؤال {currentIndex + 1} من {questions.length}
              </span>
              <button
                type="button"
                onClick={finishTest}
                className="inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm transition-colors"
              >
                <Flag className="w-4 h-4" />
                إنهاء الاختبار
              </button>
            </>
          )}

          {stage === 'finished' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setStage('running');
                  setCurrentIndex(0);
                  setRevealedIndices(new Set());
                  setAnswered(new Set());
                }}
                className="inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl border border-stone-300 bg-white text-stone-700 font-semibold text-sm hover:bg-stone-50"
              >
                <RotateCcw className="w-4 h-4" />
                إعادة الاختبار
              </button>
              <button
                type="button"
                onClick={resetTest}
                className="inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm transition-colors"
              >
                <Settings className="w-4 h-4" />
                إعدادات جديدة
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};