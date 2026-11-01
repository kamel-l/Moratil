import React, { useCallback, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle,
  Flame,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
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
import {
  Badge,
  Button,
  EmptyState,
  Modal,
  PageHero,
  ProgressBar,
  SectionCard,
} from './ui';

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
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHero
        eyebrow="نظام التكرار المتباعد (Spaced Repetition)"
        icon={<CalendarClock className="h-4 w-4" />}
        title="خطط المراجعة وتنبيهات تثبيت الحفظ"
        description="القرآن أشد تفلتاً من الإبل في عقلها. خطط المراجعة الدورية الذكية تتابع أدائك وتنبّهك للآيات التي قاربت على النسيان أو تعثرت بها سابقاً لضمان رسوخ الحفظ في صدرك."
        actions={
          <Button
            variant="accent"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={handleResetRevision}
          >
            تصفير المراجعة
          </Button>
        }
      />

      <SectionCard
        title="تذكير المراجعة اليومي"
        description="يصلك تنبيه محلي في الوقت المحدد عند وجود مراجعات مستحقة أو قادمة."
        icon={<CalendarClock className="h-5 w-5" />}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
          <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
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
            تفعيل التنبيه
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
            الساعة
            <input
              type="time"
              value={reminderSettings.time}
              disabled={!isNativePlatform || isSavingReminder}
              onChange={(event) =>
                void updateReminderSettings({ ...reminderSettings, time: event.target.value })
              }
              className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-stone-900 disabled:opacity-50"
            />
          </label>
        </div>

        {!isNativePlatform && (
          <p className="mt-3 text-xs text-stone-500">التنبيهات المحلية تعمل في تطبيق Android أو iOS.</p>
        )}
        {reminderNotice && (
          <p className="mt-3 text-xs text-emerald-800" role="status">
            {reminderNotice}
          </p>
        )}
        {reminderError && (
          <p className="mt-3 text-xs text-rose-800" role="alert">
            {reminderError}
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="مراجعات مستحقة وإشارات تحتاج إلى تثبيت"
        description="آيات حان موعد مراجعتها أو ظهر فيها اختلاف بين النص القرآني والتعرّف الصوتي."
        icon={<AlertTriangle className="h-5 w-5 text-amber-700" />}
        action={<Badge tone="amber">{forgottenVerses.length} آيات</Badge>}
      >
        {forgottenVerses.length === 0 ? (
          <EmptyState
            icon={<CheckCircle className="h-5 w-5 text-emerald-600" />}
            title="لا توجد مراجعات مستحقة حاليًا"
            description="واصل المراجعة المنتظمة، وتذكّر أن مطابقة النص آليًا لا تقيّم النطق أو التجويد."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {forgottenVerses.map((item) => {
              const lastMistake = item.recentMistakes[0];

              return (
                <article
                  key={`${item.surahNumber}_${item.ayahNumber}`}
                  className="space-y-3 rounded-2xl border border-amber-200/80 bg-white p-5 shadow-xs transition-colors hover:border-amber-400"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-stone-900">
                        سورة {getSurahName(item.surahNumber)}
                      </span>
                      <Badge tone="stone">الآية {item.ayahNumber}</Badge>
                    </div>
                    <Badge tone="amber">اختلافات مسجلة: {item.mistakeCount}</Badge>
                  </div>

                  {lastMistake && (
                    <div className="space-y-1 rounded-xl border border-stone-100 bg-stone-50 p-3 text-xs text-stone-600">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-stone-500">ما تعرّف عليه النظام:</span>
                        <span className="font-bold text-amber-800">"{lastMistake.recitedWord}"</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-stone-500">النص المقابل في المصحف:</span>
                        <span className="font-quran text-sm font-bold text-emerald-700">
                          "{lastMistake.expectedWord}"
                        </span>
                      </div>
                      <p className="pt-1 text-[11px] text-stone-500">
                        هذا اختلاف رصده النظام، وقد يكون من التعرّف الصوتي لا من التلاوة.
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-[11px] text-stone-500">
                      التكرار المتباعد: يحتاج جلسة تسميع
                    </span>
                    <Button
                      size="sm"
                      icon={<Play className="h-3.5 w-3.5" />}
                      onClick={() => onStartPracticingVerse(item.surahNumber, item.ayahNumber)}
                    >
                      تسميع وتثبيت
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="خطط المراجعة الدورية النشطة"
        description="برامج مجدولة لمراجعة السور والأجزاء وفق خطة زمنية ومعدل يومي."
        icon={<CalendarClock className="h-5 w-5" />}
        action={
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus className="h-4 w-4 text-emerald-600" />}
            onClick={() => setIsCreateModalOpen(true)}
          >
            خطة مراجعة جديدة
          </Button>
        }
      >
        {plans.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-5 w-5" />}
            title="لا توجد خطط مراجعة بعد"
            description="أنشئ خطة جديدة لتوزيع المراجعة على أيام محددة ومعدل يومي مناسب."
            action={
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setIsCreateModalOpen(true)}>
                إنشاء خطة
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {plans.map((plan) => {
              const progressPercent = Math.min(
                100,
                Math.round((plan.currentDay / plan.durationDays) * 100),
              );
              const isFinished = plan.currentDay >= plan.durationDays;
              const isExpanded = expandedPlanId === plan.id;

              return (
                <article
                  key={plan.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-xs transition-colors hover:border-emerald-300"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone="emerald">{getCategoryLabel(plan.category)}</Badge>
                      <span className="text-xs text-stone-500">
                        اليوم {plan.currentDay} من {plan.durationDays}
                      </span>
                    </div>

                    <h3 className="text-base font-bold leading-snug text-stone-900">{plan.title}</h3>
                    <p className="line-clamp-2 text-xs text-stone-500">{plan.description}</p>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs text-stone-600">
                      <span>نسبة الإنجاز</span>
                      <span className="font-bold text-emerald-700">{progressPercent}%</span>
                    </div>

                    <ProgressBar
                      value={progressPercent}
                      label={`نسبة إنجاز ${plan.title}`}
                      size="sm"
                    />

                    <div className="flex items-center justify-between pt-1 text-[11px] text-stone-500">
                      <span>الهدف: {plan.dailyTargetAyahs} آية / يوم</span>
                      <span>{plan.targetSurahs.length} سور مدرجة</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 border-t border-stone-100 pt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedPlanId((current) => (current === plan.id ? null : plan.id))
                      }
                    >
                      {isExpanded ? 'إخفاء السور' : 'اختر سورة للمراجعة'}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isFinished}
                      onClick={() => handleCompleteDay(plan.id)}
                      title="تأكيد إتمام ورد اليوم (+50 حسنة)"
                      aria-label="تأكيد إتمام ورد اليوم"
                      className="text-emerald-700 hover:bg-emerald-50"
                      icon={<CheckCircle className="h-5 w-5" />}
                    >
                      <span className="sr-only">إتمام اليوم</span>
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
                      <p className="text-xs font-semibold text-emerald-900">
                        سور هذه الخطة — اختر سورة لبدء المراجعة:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {plan.targetSurahs.map((surahNumber) => (
                          <button
                            key={surahNumber}
                            type="button"
                            onClick={() => onStartPracticingVerse(surahNumber, 1)}
                            className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 transition-colors hover:border-emerald-500 hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                          >
                            سورة {getSurahName(surahNumber)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="كيف يعمل التكرار المتباعد؟"
        icon={<Sparkles className="h-5 w-5" />}
      >
        <div className="grid gap-4 text-xs text-stone-600 sm:grid-cols-3">
          <div className="rounded-xl bg-stone-50 p-4">
            <Flame className="mb-2 h-4 w-4 text-amber-600" />
            <p className="font-bold text-stone-800">مراجعة قصيرة متكرّرة</p>
            <p className="mt-1 leading-relaxed">الآيات المتعثرة تعود إليك أسرع من الآيات المتقنة.</p>
          </div>
          <div className="rounded-xl bg-stone-50 p-4">
            <ShieldAlert className="mb-2 h-4 w-4 text-rose-600" />
            <p className="font-bold text-stone-800">إشارات دقيقة</p>
            <p className="mt-1 leading-relaxed">نسجّل الاختلافات بين التلاوة والنص لتوجيه المراجعة.</p>
          </div>
          <div className="rounded-xl bg-stone-50 p-4">
            <CheckCircle className="mb-2 h-4 w-4 text-emerald-600" />
            <p className="font-bold text-stone-800">تقدّم واضح</p>
            <p className="mt-1 leading-relaxed">تابع نسبة الإنجاز اليومية واحصل على الحسنات عند الإتمام.</p>
          </div>
        </div>
      </SectionCard>

      <Modal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="إنشاء خطة مراجعة دورية"
        description="اختر اسماً ومدة وهدفاً يومياً ثم حدّد السور المستهدفة."
        icon={<CalendarClock className="h-5 w-5" />}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" form="create-revision-plan" disabled={!newPlanTitle.trim()}>
              إنشاء الخطة والبدء
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
                الهدف اليومي (عدد الآيات)
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
                مدة الخطة (بالأيام)
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
