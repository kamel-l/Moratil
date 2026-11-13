import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarClock,
  ChevronLeft,
  Flame,
  GraduationCap,
  Mic,
  Minus,
  Plus,
  Target,
} from 'lucide-react';
import type { UserStats, VerseMastery } from '../types/quran';
import { ALL_SURAHS } from '../data/quranSurahsList';
import {
  getDailyRecitationActivity,
  getDailyVerseGoal,
  saveDailyVerseGoal,
} from '../services/storageService';
import { Button, PageHero, ProgressBar, SectionCard } from './ui';

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
      <PageHero
        eyebrow="رفيق رحلتك مع القرآن"
        icon={<Mic className="h-4 w-4" />}
        title="وردٌ يسير، وأثرٌ يبقى"
        description="تابع حفظك ومراجعتك على مهل. ابدأ جلسة تسميع جديدة أو أكمل من آخر موضع وصلت إليه."
        actions={
          <>
            <Button
              variant="accent"
              size="lg"
              icon={<Mic className="h-5 w-5" />}
              onClick={onStartSession}
              className="bg-amber-200 text-emerald-950 hover:bg-amber-100 focus-visible:outline-amber-200"
            >
              ابدأ جلسة تسميع
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="lg"
              icon={<GraduationCap className="h-5 w-5 text-amber-200" />}
              onClick={onOpenMemorization}
              className="border border-emerald-600 bg-emerald-900 hover:bg-emerald-800 focus-visible:outline-amber-200"
            >
              ابدأ وضع الحفظ
            </Button>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-3">
        <SectionCard
          className="md:col-span-2"
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
        <SectionCard title="آخر موضع" icon={<BookOpen className="h-5 w-5" />}>
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
