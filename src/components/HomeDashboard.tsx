import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarClock,
  ChevronLeft,
  Flame,
  GraduationCap,
  Mic,
  Minus,
  Orbit,
  Plus,
  Target,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { UserStats, VerseMastery } from '../types/quran';
import { ALL_SURAHS } from '../data/quranSurahsList';
import {
  getDailyRecitationActivity,
  getDailyVerseGoal,
  saveDailyVerseGoal,
} from '../services/storageService';
import { Button, ProgressBar, SectionCard } from './ui';

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
  const reduceMotion = useReducedMotion();

  const todayActivity = getDailyRecitationActivity(1)[0];
  const versesToday = todayActivity?.verses ?? 0;
  const sessionsToday = todayActivity?.sessions ?? 0;
  const goalProgress = Math.min(100, Math.round((versesToday / dailyGoal) * 100));

  const latestVerse = useMemo(
    () =>
      Object.values(verseMasteryMap).sort(
        (a, b) =>
          (Date.parse(b.lastReviewedAt) || 0) - (Date.parse(a.lastReviewedAt) || 0),
      )[0],
    [verseMasteryMap],
  );
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
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative isolate overflow-hidden rounded-[2rem] border border-emerald-800/70 bg-[radial-gradient(ellipse_at_82%_15%,rgba(16,185,129,0.28),transparent_38%),linear-gradient(125deg,#022c22_0%,#064e3b_58%,#073b32_100%)] px-6 py-8 text-white shadow-xl shadow-emerald-950/10 sm:px-9 sm:py-10"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-20 -top-28 h-72 w-72 rounded-full border border-emerald-200/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-8 -top-16 h-52 w-52 rounded-full border border-amber-200/10"
        />
        <div className="relative z-10 flex flex-col justify-between gap-8 sm:flex-row sm:items-center">
          <div className="max-w-2xl space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-950/35 px-3 py-1 text-xs font-semibold text-amber-200">
              <Orbit className="h-4 w-4" />
              رفيق رحلتك مع القرآن
            </span>
            <h1 className="font-serif text-3xl font-bold leading-tight sm:text-4xl">
              وردٌ يسير، وأثرٌ يبقى
            </h1>
            <p className="max-w-xl text-sm leading-7 text-emerald-50/85">
              تابع حفظك ومراجعتك على مهل. ابدأ جلسة تسميع جديدة أو أكمل من آخر موضع وصلت إليه.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Button
                variant="accent"
                size="lg"
                icon={<Mic className="h-5 w-5" />}
                onClick={onStartSession}
                className="bg-amber-200 text-emerald-950 shadow-lg shadow-black/10 hover:bg-amber-100 focus-visible:outline-amber-200"
              >
                ابدأ جلسة تسميع
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                icon={<GraduationCap className="h-5 w-5 text-amber-200" />}
                onClick={onOpenMemorization}
                className="border border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/15 focus-visible:outline-amber-200"
              >
                ابدأ وضع الحفظ
              </Button>
            </div>
          </div>

          <motion.div
            aria-hidden="true"
            className="mx-auto flex h-36 w-36 shrink-0 items-center justify-center rounded-full border border-amber-100/20 bg-emerald-950/30 shadow-[0_0_70px_rgba(16,185,129,0.16)] sm:mx-2 sm:h-44 sm:w-44"
            style={{ perspective: 700 }}
            whileHover={reduceMotion ? undefined : { rotateY: -5, rotateX: 3, scale: 1.03 }}
            transition={{ type: 'spring', stiffness: 180, damping: 18 }}
          >
            <div className="flex h-[78%] w-[78%] items-center justify-center rounded-full border border-dashed border-amber-200/40 bg-gradient-to-br from-emerald-700/40 to-emerald-950/50">
              <BookOpen className="h-16 w-16 stroke-[1.2] text-amber-200 drop-shadow-[0_0_18px_rgba(253,230,138,0.28)] sm:h-[4.5rem] sm:w-[4.5rem]" />
            </div>
          </motion.div>
        </div>
      </motion.section>

      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: reduceMotion ? 0 : 0.08, ease: 'easeOut' }}
        className="grid gap-4 md:grid-cols-3"
      >
        <SectionCard
          className="border-emerald-900/10 shadow-sm transition-shadow duration-300 hover:shadow-md md:col-span-2"
          title="ورد اليوم"
          description="الآيات المسجلة من جلسات التسميع والمراجعة"
          icon={<Target className="h-5 w-5" />}
          action={
            <div className="flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 p-1">
              <button
                type="button"
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
                type="button"
                onClick={() => updateDailyGoal(1)}
                disabled={dailyGoal >= 100}
                className="rounded-lg p-1.5 text-stone-600 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="زيادة هدف الورد"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          }
        >
          <div className="mt-2 flex items-end justify-between gap-4">
            <p className="text-sm text-stone-600">
              أتممت{' '}
              <span className="font-bold text-emerald-800">
                {versesToday.toLocaleString('ar-EG')}
              </span>{' '}
              من {dailyGoal.toLocaleString('ar-EG')} آية
            </p>
            <span className="text-lg font-bold text-emerald-800">{goalProgress}٪</span>
          </div>
          <ProgressBar value={goalProgress} label="تقدم الورد اليومي" className="mt-3" />
          <p className="mt-3 text-[11px] leading-relaxed text-stone-500">
            هدفك قابل للتعديل، ولا يُعدّ تجاوز النسبة أو بلوغها مقياسًا لإتقان الحفظ.
          </p>
        </SectionCard>

        <button
          type="button"
          onClick={onOpenReview}
          className="group flex min-h-40 items-center justify-between rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-[#fffaf0] p-5 text-right shadow-xs transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
        >
          <div>
            <div className="mb-3 inline-flex rounded-xl bg-white p-2.5 text-amber-800 shadow-sm transition-transform duration-300 group-hover:scale-105">
              <CalendarClock className="h-5 w-5" />
            </div>
            <h2 className="font-bold text-stone-900">مراجعات مستحقة</h2>
            <p className="mt-1 text-sm text-amber-900">
              {forgottenVersesCount.toLocaleString('ar-EG')} آية بانتظار المراجعة
            </p>
          </div>
          <ChevronLeft className="h-5 w-5 text-amber-800" />
        </button>
      </motion.section>

      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: reduceMotion ? 0 : 0.16, ease: 'easeOut' }}
        className="grid gap-4 md:grid-cols-2"
      >
        <SectionCard
          title="آخر موضع"
          icon={<BookOpen className="h-5 w-5" />}
          className="border-emerald-900/10 shadow-sm transition-shadow duration-300 hover:shadow-md"
        >
          {latestVerse && latestSurah ? (
            <>
              <p className="text-sm text-stone-600">
                سورة {latestSurah.name} · الآية {latestVerse.ayahNumber}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onResumeVerse(latestVerse.surahNumber, latestVerse.ayahNumber)}
                className="mt-4"
              >
                تابع من هنا
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <p className="text-sm text-stone-500">ستظهر هنا آخر آية راجعتها</p>
          )}
        </SectionCard>

        <button
          type="button"
          onClick={onOpenStats}
          className="group flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-5 text-right shadow-xs transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/40 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
        >
          <div>
            <div className="mb-3 inline-flex rounded-xl bg-emerald-50 p-2.5 text-emerald-800 transition-transform duration-300 group-hover:scale-105">
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
      </motion.section>
    </div>
  );
};
