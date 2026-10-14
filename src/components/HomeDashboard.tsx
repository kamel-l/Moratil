import React, { useState } from 'react';
import {
  BookOpen,
  CalendarClock,
  ChevronLeft,
  Flame,
  GraduationCap,
  Minus,
  Mic,
  Plus,
  Sparkles,
  Target,
} from 'lucide-react';
import { VerseMastery, UserStats } from '../types/quran';
import { ALL_SURAHS } from '../data/quranSurahsList';
import {
  getDailyRecitationActivity,
  getDailyVerseGoal,
  saveDailyVerseGoal,
} from '../services/storageService';

interface HomeDashboardProps {
  stats: UserStats;
  verseMasteryMap: Record<string, VerseMastery>;
  forgottenVersesCount: number;
  onStartSession: () => void;
  onOpenMemorization: () => void;
  onResumeVerse: (surahNumber: number, ayahNumber: number) => void;
  onOpenReview: () => void;
  onOpenStats: () => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  stats,
  verseMasteryMap,
  forgottenVersesCount,
  onStartSession,
  onOpenMemorization,
  onResumeVerse,
  onOpenReview,
  onOpenStats,
}) => {
  const [dailyGoal, setDailyGoal] = useState(getDailyVerseGoal);
  const todayActivity = getDailyRecitationActivity(1)[0];
  const versesToday = todayActivity?.verses || 0;
  const sessionsToday = todayActivity?.sessions || 0;
  const goalProgress = Math.min(100, Math.round((versesToday / dailyGoal) * 100));
  const latestVerse = Object.values(verseMasteryMap).sort(
    (a, b) => (Date.parse(b.lastReviewedAt) || 0) - (Date.parse(a.lastReviewedAt) || 0),
  )[0];
  const latestSurah = latestVerse
    ? ALL_SURAHS.find((surah) => surah.number === latestVerse.surahNumber)
    : undefined;

  const updateDailyGoal = (change: number) => {
    const nextGoal = Math.max(1, Math.min(100, dailyGoal + change));
    setDailyGoal(nextGoal);
    saveDailyVerseGoal(nextGoal);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6" dir="rtl">
      <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-sm sm:px-9 sm:py-10">
        <div className="pointer-events-none absolute -left-12 -top-16 h-56 w-56 rounded-full border border-emerald-700/40" />
        <div className="pointer-events-none absolute -left-5 -top-9 h-40 w-40 rounded-full border border-emerald-700/30" />
        <div className="relative z-10 max-w-2xl space-y-4">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-700 bg-emerald-900/70 px-3 py-1 text-xs font-semibold text-amber-200">
            <Sparkles className="h-4 w-4" />
            رفيق رحلتك مع القرآن
          </span>
          <h1 className="font-serif text-3xl font-bold leading-tight sm:text-4xl">
            وردٌ يسير، وأثرٌ يبقى
          </h1>
          <p className="max-w-xl text-sm leading-7 text-emerald-100">
            تابع حفظك ومراجعتك على مهل. ابدأ جلسة تسميع جديدة أو أكمل من آخر موضع وصلت إليه.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onStartSession}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-200 px-6 py-3 text-sm font-bold text-emerald-950 shadow-sm transition-colors hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
            >
              <Mic className="h-5 w-5" />
              ابدأ جلسة تسميع
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={onOpenMemorization}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-600 bg-emerald-900 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
            >
              <GraduationCap className="h-5 w-5 text-amber-200" />
              ابدأ وضع الحفظ
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs md:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-800">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold text-stone-900">ورد اليوم</h2>
                <p className="mt-0.5 text-xs text-stone-500">الآيات المسجلة من جلسات التسميع والمراجعة</p>
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 p-1">
              <button
                onClick={() => updateDailyGoal(-1)}
                disabled={dailyGoal <= 1}
                className="rounded-lg p-1.5 text-stone-600 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="تقليل هدف الورد"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-10 text-center text-xs font-semibold text-stone-700">
                {dailyGoal.toLocaleString('ar-EG')}
              </span>
              <button
                onClick={() => updateDailyGoal(1)}
                disabled={dailyGoal >= 100}
                className="rounded-lg p-1.5 text-stone-600 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="زيادة هدف الورد"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-6 flex items-end justify-between gap-4">
            <p className="text-sm text-stone-600">
              أتممت <span className="font-bold text-emerald-800">{versesToday.toLocaleString('ar-EG')}</span>{' '}
              من {dailyGoal.toLocaleString('ar-EG')} آية
            </p>
            <span className="text-lg font-bold text-emerald-800">{goalProgress}٪</span>
          </div>
          <div
            className="mt-3 h-3 overflow-hidden rounded-full bg-stone-100"
            role="progressbar"
            aria-label="تقدم الورد اليومي"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={goalProgress}
          >
            <div
              className="h-full rounded-full bg-emerald-700 transition-all"
              style={{ width: `${goalProgress}%` }}
            />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-stone-500">
            هدفك قابل للتعديل، ولا يُعدّ تجاوز النسبة أو بلوغها مقياسًا لإتقان الحفظ.
          </p>
        </article>

        <button
          onClick={onOpenReview}
          className="flex min-h-40 items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-5 text-right transition-colors hover:bg-amber-100/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
        >
          <div>
            <div className="mb-3 inline-flex rounded-xl bg-white p-2.5 text-amber-800 shadow-xs">
              <CalendarClock className="h-5 w-5" />
            </div>
            <h2 className="font-bold text-stone-900">مراجعات مستحقة</h2>
            <p className="mt-1 text-sm text-amber-900">
              {forgottenVersesCount.toLocaleString('ar-EG')} آية بانتظار المراجعة
            </p>
          </div>
          <ChevronLeft className="h-5 w-5 text-amber-800" />
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-stone-100 p-2.5 text-emerald-800">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-stone-900">آخر موضع</h2>
              {latestVerse && latestSurah ? (
                <p className="mt-1 truncate text-sm text-stone-600">
                  سورة {latestSurah.name} · الآية {latestVerse.ayahNumber}
                </p>
              ) : (
                <p className="mt-1 text-sm text-stone-500">ستظهر هنا آخر آية راجعتها</p>
              )}
            </div>
          </div>
          {latestVerse && latestSurah && (
            <button
              onClick={() => onResumeVerse(latestVerse.surahNumber, latestVerse.ayahNumber)}
              className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-50"
            >
              تابع من هنا
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </article>

        <button
          onClick={onOpenStats}
          className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-5 text-right shadow-xs transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
        >
          <div>
            <div className="mb-3 inline-flex rounded-xl bg-emerald-50 p-2.5 text-emerald-800">
              <Flame className="h-5 w-5" />
            </div>
            <h2 className="font-bold text-stone-900">مسيرتك مستمرة</h2>
            <p className="mt-1 text-sm text-stone-600">
              {sessionsToday.toLocaleString('ar-EG')} جلسات اليوم ·{' '}
              {stats.streakDays.toLocaleString('ar-EG')} أيام متتابعة ·{' '}
              {stats.totalVersesRecited.toLocaleString('ar-EG')} آية أتممت تسميعها
            </p>
          </div>
          <ChevronLeft className="h-5 w-5 text-emerald-800" />
        </button>
      </section>
    </div>
  );
};
