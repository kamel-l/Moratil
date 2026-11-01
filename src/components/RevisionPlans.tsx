import React, { useCallback, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle,
  Clock,
  Flame,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { RevisionPlan, VerseMastery } from '../types/quran';
import { ALL_SURAHS } from '../data/quranSurahsList';
import {
  addPointsAndVerses,
  getRevisionReminderSettings,
  resetRevisionData,
  saveRevisionReminderSettings,
  saveRevisionPlans,
  type RevisionReminderSettings,
} from '../services/storageService';
import { scheduleDueReviewReminder } from '../services/revisionReminderService';
import { Badge, Button, EmptyState, Modal } from './ui';

// ═══════════════════════════════════════════════════════════════
// الأنواع
// ═══════════════════════════════════════════════════════════════
interface RevisionPlansProps {
  plans: RevisionPlan[];
  forgottenVerses: VerseMastery[];
  onStartPracticingVerse: (surahNumber: number, ayahNumber: number) => void;
  onRefreshPlans: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  spaced_repetition: 'تكرار متباعد',
  daily_wird: 'ورد يومي',
  juz_amma: 'جزء عمّ',
  surah_fix: 'تثبيت سورة',
  custom: 'خطة مخصصة',
};

function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? 'تثبيت سورة';
}

// ═══════════════════════════════════════════════════════════════
// حلقة تقدّم دائرية (SVG)
// ═══════════════════════════════════════════════════════════════
interface ProgressRingProps {
  percent: number;
  size?: number;
  stroke?: number;
  tone?: 'emerald' | 'amber' | 'light';
  children?: React.ReactNode;
  ariaLabel?: string;
}

const ProgressRing: React.FC<ProgressRingProps> = ({
  percent,
  size = 88,
  stroke = 7,
  tone = 'emerald',
  children,
  ariaLabel,
}) => {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);

  const trackColor = tone === 'light' ? 'rgba(255,255,255,0.18)' : '#e7e5e4';
  const progressColor =
    tone === 'amber' ? '#f59e0b' : tone === 'light' ? '#fbbf24' : '#059669';

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel ?? `التقدم ${clamped}%`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={progressColor}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
        {children}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// شرائح الأيام
// ═══════════════════════════════════════════════════════════════
interface DaySegmentsProps {
  durationDays: number;
  currentDay: number;
}

const DaySegments: React.FC<DaySegmentsProps> = ({ durationDays, currentDay }) => {
  const segments = Math.min(durationDays, 30);
  const daysPerSegment = durationDays / segments;

  return (
    <div
      className="flex gap-[2px]"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={durationDays}
      aria-valuenow={currentDay}
      aria-label={`اليوم ${currentDay} من ${durationDays}`}
    >
      {Array.from({ length: segments }).map((_, index) => {
        const dayThreshold = (index + 1) * daysPerSegment;
        const isCompleted = currentDay - 1 >= dayThreshold;
        const isCurrent = !isCompleted && currentDay >= index * daysPerSegment;

        return (
          <span
            key={index}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              isCompleted
                ? 'bg-emerald-500'
                : isCurrent
                ? 'animate-pulse bg-amber-400'
                : 'bg-stone-200'
            }`}
          />
        );
      })}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// مسار السور
// ═══════════════════════════════════════════════════════════════
interface SurahPathProps {
  surahNumbers: number[];
  surahNameByNumber: Map<number, string>;
  forgottenSurahSet: Set<number>;
  onPickSurah: (surahNumber: number) => void;
}

const SurahPath: React.FC<SurahPathProps> = ({
  surahNumbers,
  surahNameByNumber,
  forgottenSurahSet,
  onPickSurah,
}) => {
  if (surahNumbers.length === 0) return null;

  const getSurahName = (n: number) => surahNameByNumber.get(n) ?? `سورة ${n}`;

  return (
    <div className="relative pt-2 pb-1">
      <div
        className="absolute inset-x-2 top-4 h-0.5 bg-gradient-to-l from-emerald-200 via-stone-200 to-emerald-200"
        aria-hidden="true"
      />
      <div className="relative flex justify-between gap-1 overflow-x-auto pb-1">
        {surahNumbers.map((surahNumber) => {
          const hasDue = forgottenSurahSet.has(surahNumber);
          return (
            <button
              key={surahNumber}
              type="button"
              onClick={() => onPickSurah(surahNumber)}
              title={`بدء مراجعة سورة ${getSurahName(surahNumber)}`}
              className="group flex min-w-12 shrink-0 flex-col items-center gap-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              <span
                className={`relative flex h-4 w-4 items-center justify-center rounded-full border-2 transition-all group-hover:scale-125 ${
                  hasDue ? 'border-amber-500 bg-amber-100' : 'border-emerald-500 bg-emerald-100'
                }`}
              >
                {hasDue && (
                  <span className="absolute inset-0 animate-ping rounded-full border-2 border-amber-400 opacity-60" />
                )}
              </span>
              <span
                className={`max-w-[64px] truncate text-[10px] font-medium transition-colors ${
                  hasDue ? 'text-amber-800' : 'text-stone-600 group-hover:text-emerald-800'
                }`}
              >
                {getSurahName(surahNumber)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// المكوّن الرئيسي
// ═══════════════════════════════════════════════════════════════
export const RevisionPlans: React.FC<RevisionPlansProps> = ({
  plans,
  forgottenVerses,
  onStartPracticingVerse,
  onRefreshPlans,
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [newPlanTitle, setNewPlanTitle] = useState('');
  const [selectedSurahNums, setSelectedSurahNums] = useState<number[]>([1, 112, 113, 114]);
  const [dailyTarget, setDailyTarget] = useState(15);
  const [durationDays, setDurationDays] = useState(14);
  const [reminderSettings, setReminderSettings] =
    useState<RevisionReminderSettings>(getRevisionReminderSettings);
  const [reminderNotice, setReminderNotice] = useState('');
  const [reminderError, setReminderError] = useState('');
  const [isSavingReminder, setIsSavingReminder] = useState(false);

  const surahNameByNumber = useMemo(
    () => new Map(ALL_SURAHS.map((surah) => [surah.number, surah.name])),
    [],
  );

  const getSurahName = useCallback(
    (number: number) => surahNameByNumber.get(number) ?? `سورة ${number}`,
    [surahNameByNumber],
  );

  const forgottenSurahSet = useMemo(
    () => new Set(forgottenVerses.map((v) => v.surahNumber)),
    [forgottenVerses],
  );

  // ✅ تجميع الآيات المستحقة حسب السورة — إطار واحد لكل سورة
  const forgottenBySurah = useMemo(() => {
    const map = new Map<number, VerseMastery[]>();
    for (const item of forgottenVerses) {
      if (!map.has(item.surahNumber)) map.set(item.surahNumber, []);
      map.get(item.surahNumber)!.push(item);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([surahNumber, verses]) => ({
        surahNumber,
        verses: [...verses].sort((a, b) => a.ayahNumber - b.ayahNumber),
      }));
  }, [forgottenVerses]);

  const aggregate = useMemo(() => {
    const active = plans.filter((p) => p.currentDay < p.durationDays);
    const completed = plans.filter((p) => p.currentDay >= p.durationDays);
    const avgPercent =
      plans.length > 0
        ? Math.round(
            plans.reduce(
              (sum, p) => sum + Math.min(100, (p.currentDay / p.durationDays) * 100),
              0,
            ) / plans.length,
          )
        : 0;
    const todayTarget = active.reduce((sum, p) => sum + p.dailyTargetAyahs, 0);

    return {
      activeCount: active.length,
      completedCount: completed.length,
      avgPercent,
      todayTarget,
    };
  }, [plans]);

  const isNativePlatform = Capacitor.isNativePlatform();

  const handleCompleteDay = (planId: string) => {
    const updated = plans.map((plan) => {
      if (plan.id !== planId) return plan;
      const nextDay = plan.currentDay + 1;
      return {
        ...plan,
        currentDay: nextDay,
        isCompleted: nextDay >= plan.durationDays,
      };
    });

    saveRevisionPlans(updated);
    addPointsAndVerses(50, 15, 600);
    onRefreshPlans();
  };

  const handleCreatePlan = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newPlanTitle.trim() || selectedSurahNums.length === 0) return;

    const newPlan: RevisionPlan = {
      id: `plan_${Date.now()}`,
      title: newPlanTitle.trim(),
      description: `خطة مراجعة مخصصة تشمل ${selectedSurahNums.length} سور بمعدل ${dailyTarget} آية يومياً`,
      category: 'custom',
      targetSurahs: [...selectedSurahNums].sort((a, b) => a - b),
      dailyTargetAyahs: dailyTarget,
      durationDays,
      currentDay: 1,
      isCompleted: false,
      startDate: new Date().toISOString(),
    };

    saveRevisionPlans([newPlan, ...plans]);
    setIsCreateModalOpen(false);
    setNewPlanTitle('');
    onRefreshPlans();
  };

  const handleResetRevision = () => {
    const confirmed = window.confirm(
      'سيتم حذف جميع خطط المراجعة وسجلات إتقان الآيات، بما فيها البيانات الافتراضية. لن تتأثر نقاطك أو إحصائياتك العامة. هل تريد المتابعة؟',
    );
    if (!confirmed) return;

    resetRevisionData();
    onRefreshPlans();
  };

  const updateReminderSettings = async (nextSettings: RevisionReminderSettings) => {
    setReminderError('');
    setReminderNotice('');
    try {
      saveRevisionReminderSettings(nextSettings);
      setReminderSettings(nextSettings);
      setIsSavingReminder(true);
      const result = await scheduleDueReviewReminder(nextSettings.enabled);
      if (result === 'permission-denied') {
        setReminderError('لم يُسمح بالإشعارات. فعّلها من إعدادات النظام ثم أعد المحاولة.');
      } else if (result === 'no-upcoming-reviews') {
        setReminderNotice('سيُجدول التذكير عند وجود آيات مستحقة أو لها موعد مراجعة قادم.');
      } else if (result === 'disabled') {
        setReminderNotice('تم إيقاف تذكير المراجعة.');
      } else if (result === 'scheduled') {
        setReminderNotice(`تم ضبط التذكير اليومي على ${nextSettings.time}.`);
      } else {
        setReminderError('التنبيهات المحلية متاحة في تطبيق Android أو iOS فقط.');
      }
    } catch (error) {
      console.error('Unable to update revision reminder:', error);
      setReminderError(
        error instanceof Error ? error.message : 'تعذر ضبط تذكير المراجعة. حاول مجددًا.',
      );
    } finally {
      setIsSavingReminder(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16" dir="rtl">
      {/* ═══════════ لوحة Hero ═══════════ */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-950 p-6 text-white shadow-lg sm:p-8">
        <div
          className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
              <span>رحلة الحفظ</span>
            </div>
            <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
              خطط المراجعة وتثبيت الحفظ
            </h1>
            <p className="text-xs leading-relaxed text-emerald-100/90 sm:text-sm">
              مسارٌ متكامل يعتني بما حفظت، ويلتفت إلى ما كاد يتفلّت، بخطوات يومية واضحة.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleResetRevision}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm transition-colors hover:bg-white/20"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                تصفير المراجعة
              </button>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-center">
            <ProgressRing
              percent={aggregate.avgPercent}
              size={128}
              stroke={9}
              tone="light"
              ariaLabel={`متوسط التقدم في الخطط ${aggregate.avgPercent}%`}
            >
              <span className="text-3xl font-bold text-white">{aggregate.avgPercent}%</span>
              <span className="text-[10px] text-emerald-200">متوسط التقدم</span>
            </ProgressRing>
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-200">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              خطط نشطة
            </div>
            <p className="mt-1 text-2xl font-bold text-white">
              {aggregate.activeCount.toLocaleString('ar-EG')}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-200">
              <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
              مكتملة
            </div>
            <p className="mt-1 text-2xl font-bold text-white">
              {aggregate.completedCount.toLocaleString('ar-EG')}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-200">
              <Target className="h-3.5 w-3.5" aria-hidden="true" />
              هدف اليوم
            </div>
            <p className="mt-1 text-2xl font-bold text-white">
              {aggregate.todayTarget.toLocaleString('ar-EG')}
              <span className="mr-1 text-[10px] font-normal text-emerald-200">آية</span>
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════ تذكير المراجعة المختصر ═══════════ */}
      <section className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
          <Clock className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          تذكير المراجعة اليومي
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-stone-700">
            <input
              type="checkbox"
              checked={reminderSettings.enabled}
              disabled={!isNativePlatform || isSavingReminder}
              onChange={(event) =>
                void updateReminderSettings({
                  ...reminderSettings,
                  enabled: event.target.checked,
                })
              }
              className="h-4 w-4 accent-emerald-700"
            />
            تفعيل
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-stone-700">
            الساعة
            <input
              type="time"
              value={reminderSettings.time}
              disabled={!isNativePlatform || isSavingReminder}
              onChange={(event) =>
                void updateReminderSettings({ ...reminderSettings, time: event.target.value })
              }
              className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-900 disabled:opacity-50"
            />
          </label>
          {!isNativePlatform && (
            <span className="text-[11px] text-stone-500">(متاح على Android/iOS)</span>
          )}
        </div>
        {(reminderNotice || reminderError) && (
          <p
            className={`text-xs ${reminderError ? 'text-rose-800' : 'text-emerald-800'}`}
            role={reminderError ? 'alert' : 'status'}
          >
            {reminderError || reminderNotice}
          </p>
        )}
      </section>

      {/* ═══════════ المراجعات المستحقة — إطار واحد لكل سورة ═══════════ */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
            <h2 className="font-bold text-stone-900">آيات تحتاج إلى تثبيت</h2>
          </div>
          <Badge tone="amber">{forgottenVerses.length} آية</Badge>
        </header>

        {forgottenBySurah.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 text-center">
            <CheckCircle className="h-8 w-8 text-emerald-600" aria-hidden="true" />
            <p className="text-sm font-bold text-emerald-900">لا توجد مراجعات مستحقة حاليًا</p>
            <p className="max-w-md text-xs leading-relaxed text-emerald-900/70">
              واصل المراجعة المنتظمة، وتذكّر أن مطابقة النص آليًا لا تقيّم النطق أو التجويد.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {forgottenBySurah.map(({ surahNumber, verses }) => (
              <article
                key={surahNumber}
                className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-xs transition-shadow hover:shadow-md"
              >
                {/* رأس الإطار: اسم السورة + عدد الآيات */}
                <header className="flex items-center justify-between gap-2 border-b border-amber-100 bg-gradient-to-l from-amber-50 to-white px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-[11px] font-bold text-amber-800"
                      aria-hidden="true"
                    >
                      {verses.length.toLocaleString('ar-EG')}
                    </span>
                    <h3 className="text-sm font-bold text-stone-900">
                      سورة {getSurahName(surahNumber)}
                    </h3>
                  </div>
                  <span className="rounded-md bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    {verses.length === 1 ? 'آية واحدة' : `${verses.length.toLocaleString('ar-EG')} آيات`}
                  </span>
                </header>

                {/* قائمة الآيات داخل الإطار */}
                <ul className="divide-y divide-stone-100">
                  {verses.map((verse) => {
                    const lastMistake = verse.recentMistakes[0];
                    return (
                      <li
                        key={verse.ayahNumber}
                        className="flex items-start justify-between gap-3 px-4 py-2.5"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold text-stone-900">
                              الآية {verse.ayahNumber.toLocaleString('ar-EG')}
                            </span>
                            <span className="text-[10px] text-amber-800">
                              · {verse.mistakeCount} اختلاف
                            </span>
                          </div>
                          {lastMistake && (
                            <p className="truncate text-[10px] text-stone-500">
                              النظام سمع:{' '}
                              <span className="font-bold text-amber-800">
                                «{lastMistake.recitedWord}»
                              </span>{' '}
                              · في المصحف:{' '}
                              <span className="font-quran font-bold text-emerald-700">
                                «{lastMistake.expectedWord}»
                              </span>
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          icon={<Play className="h-3.5 w-3.5" />}
                          onClick={() =>
                            onStartPracticingVerse(surahNumber, verse.ayahNumber)
                          }
                          aria-label={`تسميع الآية ${verse.ayahNumber} من سورة ${getSurahName(surahNumber)}`}
                        >
                          تسميع
                        </Button>
                      </li>
                    );
                  })}
                </ul>

                {/* تذييل خفيف بالتنبيه */}
                <footer className="border-t border-stone-100 bg-stone-50/60 px-4 py-1.5 text-[10px] text-stone-500">
                  قد يكون الاختلاف من التعرّف الصوتي لا من التلاوة.
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ═══════════ مسار الخطط ═══════════ */}
      <section className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-bold text-stone-900">
              <CalendarClock className="h-5 w-5 text-emerald-700" aria-hidden="true" />
              محطات المسار
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">
              كل بطاقة محطة على رحلتك — تابع التقدم، اختر سورة، وأكمل وردك اليومي.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus className="h-4 w-4 text-emerald-600" />}
            onClick={() => setIsCreateModalOpen(true)}
          >
            محطة جديدة
          </Button>
        </header>

        {plans.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-5 w-5" />}
            title="لم تبدأ رحلتك بعد"
            description="أضف أول محطة مراجعة لتوزيع الحفظ على أيام محددة ومعدل يومي يناسبك."
            action={
              <Button
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setIsCreateModalOpen(true)}
              >
                ابدأ رحلتك
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan, index) => {
              const progressPercent = Math.min(
                100,
                Math.round((plan.currentDay / plan.durationDays) * 100),
              );
              const isFinished = plan.currentDay >= plan.durationDays;
              const isExpanded = expandedPlanId === plan.id;
              const hasDueInPlan = plan.targetSurahs.some((n) => forgottenSurahSet.has(n));

              return (
                <article
                  key={plan.id}
                  className={`group relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-white shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md ${
                    isFinished
                      ? 'border-emerald-300'
                      : hasDueInPlan
                      ? 'border-amber-300'
                      : 'border-stone-200'
                  }`}
                >
                  <div
                    className={`h-1 w-full ${
                      isFinished
                        ? 'bg-gradient-to-l from-emerald-500 to-teal-500'
                        : hasDueInPlan
                        ? 'bg-gradient-to-l from-amber-400 to-orange-500'
                        : 'bg-gradient-to-l from-emerald-400 to-emerald-600'
                    }`}
                    aria-hidden="true"
                  />

                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                            isFinished
                              ? 'bg-emerald-100 text-emerald-800'
                              : hasDueInPlan
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                          aria-hidden="true"
                        >
                          #{index + 1}
                        </span>
                        <Badge tone={isFinished ? 'emerald' : 'stone'}>
                          {getCategoryLabel(plan.category)}
                        </Badge>
                      </div>
                      {isFinished && (
                        <CheckCircle
                          className="h-4 w-4 text-emerald-600"
                          aria-label="خطة مكتملة"
                        />
                      )}
                    </div>

                    <h3 className="text-sm font-bold leading-snug text-stone-900">
                      {plan.title}
                    </h3>

                    <div className="flex items-center gap-3 rounded-xl bg-stone-50/70 p-3">
                      <ProgressRing
                        percent={progressPercent}
                        size={64}
                        stroke={6}
                        tone={isFinished ? 'emerald' : hasDueInPlan ? 'amber' : 'emerald'}
                        ariaLabel={`تقدم الخطة ${progressPercent}%`}
                      >
                        <span className="text-sm font-bold text-stone-900">
                          {progressPercent}%
                        </span>
                      </ProgressRing>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-baseline justify-between text-[11px] text-stone-600">
                          <span>اليوم</span>
                          <span className="font-bold text-stone-900">
                            {plan.currentDay.toLocaleString('ar-EG')} /{' '}
                            {plan.durationDays.toLocaleString('ar-EG')}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between text-[11px] text-stone-600">
                          <span>الهدف اليومي</span>
                          <span className="font-bold text-stone-900">
                            {plan.dailyTargetAyahs.toLocaleString('ar-EG')} آية
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <DaySegments
                        durationDays={plan.durationDays}
                        currentDay={plan.currentDay}
                      />
                      <div className="flex justify-between text-[10px] text-stone-500">
                        <span>بداية</span>
                        <span>{plan.targetSurahs.length.toLocaleString('ar-EG')} سور</span>
                        <span>اكتمال</span>
                      </div>
                    </div>

                    <div className="border-t border-stone-100 pt-2">
                      <p className="mb-1 text-[10px] font-semibold text-stone-500">
                        محطات السور
                      </p>
                      <SurahPath
                        surahNumbers={plan.targetSurahs}
                        surahNameByNumber={surahNameByNumber}
                        forgottenSurahSet={forgottenSurahSet}
                        onPickSurah={(n) => onStartPracticingVerse(n, 1)}
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedPlanId((current) =>
                            current === plan.id ? null : plan.id,
                          )
                        }
                        className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition-colors hover:border-stone-400 hover:bg-stone-50"
                      >
                        {isExpanded ? 'إخفاء' : 'تفاصيل'}
                      </button>
                      <button
                        type="button"
                        disabled={isFinished}
                        onClick={() => handleCompleteDay(plan.id)}
                        title="تأكيد إتمام ورد اليوم (+50 حسنة)"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                      >
                        <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        إتمام اليوم
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="mt-1 space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-[11px] text-emerald-900">
                        <p className="font-semibold">سور هذه الخطة:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {plan.targetSurahs.map((surahNumber) => {
                            const hasDue = forgottenSurahSet.has(surahNumber);
                            return (
                              <button
                                key={surahNumber}
                                type="button"
                                onClick={() => onStartPracticingVerse(surahNumber, 1)}
                                className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${
                                  hasDue
                                    ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                                    : 'border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-100'
                                }`}
                              >
                                {getSurahName(surahNumber)}
                                {hasDue && ' ⚠'}
                              </button>
                            );
                          })}
                        </div>
                        <p className="pt-1 text-[10px] text-emerald-900/70">
                          💡 السور المعلّمة بـ ⚠ تحتوي على آيات تحتاج تثبيتًا.
                        </p>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══════════ شرح التكرار المتباعد ═══════════ */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-stone-900">
          <Sparkles className="h-5 w-5 text-emerald-700" aria-hidden="true" />
          كيف يعمل التكرار المتباعد؟
        </h2>
        <div className="grid gap-3 text-xs text-stone-600 sm:grid-cols-3">
          <div className="rounded-xl bg-stone-50 p-4">
            <Flame className="mb-2 h-4 w-4 text-amber-600" aria-hidden="true" />
            <p className="font-bold text-stone-800">مراجعة قصيرة متكرّرة</p>
            <p className="mt-1 leading-relaxed">
              الآيات المتعثرة تعود إليك أسرع من الآيات المتقنة.
            </p>
          </div>
          <div className="rounded-xl bg-stone-50 p-4">
            <ShieldAlert className="mb-2 h-4 w-4 text-rose-600" aria-hidden="true" />
            <p className="font-bold text-stone-800">إشارات دقيقة</p>
            <p className="mt-1 leading-relaxed">
              نسجّل الاختلافات بين التلاوة والنص لتوجيه المراجعة.
            </p>
          </div>
          <div className="rounded-xl bg-stone-50 p-4">
            <CheckCircle className="mb-2 h-4 w-4 text-emerald-600" aria-hidden="true" />
            <p className="font-bold text-stone-800">تقدّم واضح</p>
            <p className="mt-1 leading-relaxed">
              تابع نسبة الإنجاز اليومية واحصل على الحسنات عند الإتمام.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════ نافذة إنشاء خطة ═══════════ */}
      <Modal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="محطة مراجعة جديدة"
        description="اختر اسماً ومدة وهدفاً يومياً ثم حدّد السور المستهدفة."
        icon={<CalendarClock className="h-5 w-5" />}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" form="create-revision-plan" disabled={!newPlanTitle.trim()}>
              إنشاء المحطة والبدء
            </Button>
          </>
        }
      >
        <form id="create-revision-plan" onSubmit={handleCreatePlan} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label htmlFor="plan-title" className="font-semibold text-stone-800">
              اسم الخطة أو الهدف
            </label>
            <input
              id="plan-title"
              type="text"
              required
              placeholder="مثال: مراجعة سورة الكهف أسبوعياً، تثبيت جزء تبارك..."
              value={newPlanTitle}
              onChange={(event) => setNewPlanTitle(event.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-stone-50 p-3 text-xs text-stone-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-600/25"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="plan-daily-target" className="font-semibold text-stone-800">
                الهدف اليومي (آيات)
              </label>
              <input
                id="plan-daily-target"
                type="number"
                min={1}
                max={100}
                value={dailyTarget}
                onChange={(event) => setDailyTarget(Number(event.target.value))}
                className="w-full rounded-xl border border-stone-300 bg-stone-50 p-3 text-xs text-stone-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-600/25"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="plan-duration" className="font-semibold text-stone-800">
                المدة (بالأيام)
              </label>
              <input
                id="plan-duration"
                type="number"
                min={3}
                max={90}
                value={durationDays}
                onChange={(event) => setDurationDays(Number(event.target.value))}
                className="w-full rounded-xl border border-stone-300 bg-stone-50 p-3 text-xs text-stone-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-600/25"
              />
            </div>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="font-semibold text-stone-800">
              اختر السور المستهدفة ({selectedSurahNums.length})
            </legend>
            <div className="grid max-h-44 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-2.5">
              {ALL_SURAHS.map((surah) => (
                <label
                  key={surah.number}
                  className="flex cursor-pointer select-none items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white"
                >
                  <input
                    type="checkbox"
                    checked={selectedSurahNums.includes(surah.number)}
                    onChange={(event) => {
                      setSelectedSurahNums((current) =>
                        event.target.checked
                          ? [...current, surah.number]
                          : current.filter((number) => number !== surah.number),
                      );
                    }}
                    className="accent-emerald-600"
                  />
                  <span className="text-[11px] text-stone-700">
                    {surah.number}. {surah.name}
                  </span>
                </label>
              ))}
            </div>
            {selectedSurahNums.length === 0 && (
              <p className="text-[11px] text-rose-700" role="alert">
                اختر سورة واحدة على الأقل.
              </p>
            )}
          </fieldset>
        </form>
      </Modal>
    </div>
  );
};