import React, { useState } from 'react';
import {
  CalendarClock,
  AlertTriangle,
  CheckCircle,
  Plus,
  ArrowLeft,
  Play,
  Volume2,
  Clock,
  Flame,
  ShieldAlert,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { RevisionPlan, VerseMastery } from '../types/quran';
import { ALL_SURAHS } from '../data/quranSurahsList';
import { saveRevisionPlans, addPointsAndVerses } from '../services/storageService';

interface RevisionPlansProps {
  plans: RevisionPlan[];
  forgottenVerses: VerseMastery[];
  onStartPracticingVerse: (surahNumber: number, ayahNumber: number) => void;
  onRefreshPlans: () => void;
}

export const RevisionPlans: React.FC<RevisionPlansProps> = ({
  plans,
  forgottenVerses,
  onStartPracticingVerse,
  onRefreshPlans,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState('');
  const [selectedSurahNums, setSelectedSurahNums] = useState<number[]>([1, 112, 113, 114]);
  const [dailyTarget, setDailyTarget] = useState(15);
  const [durationDays, setDurationDays] = useState(14);

  const getSurahName = (num: number) => {
    return ALL_SURAHS.find((s) => s.number === num)?.name || `سورة ${num}`;
  };

  const handleCompleteDay = (planId: string) => {
    const updated = plans.map((p) => {
      if (p.id === planId) {
        const nextDay = p.currentDay + 1;
        const isDone = nextDay >= p.durationDays;
        return {
          ...p,
          currentDay: nextDay,
          isCompleted: isDone,
        };
      }
      return p;
    });

    saveRevisionPlans(updated);
    addPointsAndVerses(50, 15, 600, 98);
    onRefreshPlans();
  };

  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanTitle.trim()) return;

    const newPlan: RevisionPlan = {
      id: `plan_${Date.now()}`,
      title: newPlanTitle.trim(),
      description: `خطة مراجعة مخصصة تشمل ${selectedSurahNums.length} سور بمعدل ${dailyTarget} آية يومياً`,
      category: 'custom',
      targetSurahs: selectedSurahNums,
      dailyTargetAyahs: dailyTarget,
      durationDays: durationDays,
      currentDay: 1,
      isCompleted: false,
      startDate: new Date().toISOString(),
    };

    const updated = [newPlan, ...plans];
    saveRevisionPlans(updated);
    setShowCreateModal(false);
    setNewPlanTitle('');
    onRefreshPlans();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-white rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 bg-emerald-800/80 border border-emerald-700/60 px-3 py-1 rounded-full text-xs text-amber-300 font-medium">
            <CalendarClock className="w-3.5 h-3.5" />
            <span>نظام التكرار المتباعد (Spaced Repetition)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-serif">
            خطط المراجعة وتنبيهات تثبيت الحفظ
          </h1>
          <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed">
            القرآن أشد تفلتاً من الإبل في عقلها. خطط المراجعة الدورية الذكية تتابع أدائك وتنبّهك
            للآيات التي قاربت على النسيان أو تعثرت بها سابقاً لضمان رسوخ الحفظ في صدرك.
          </p>
        </div>
      </div>

      {/* SECTION 1: Forgotten Verses / Verses Needing Reinforcement Alerts */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900">
                تنبيه: آيات تحتاج لتثبيت وتكرار عاجل
              </h2>
              <p className="text-xs text-stone-500">
                آيات أظهرت خوارزمية التعرف الصوتي تعثراً في حفظها أو حان موعد مراجعتها المتباعدة
              </p>
            </div>
          </div>

          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
            {forgottenVerses.length} آيات
          </span>
        </div>

        {forgottenVerses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center space-y-2">
            <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto" />
            <h3 className="font-bold text-stone-900 text-base">ما شاء الله! جميع محفوظاتك متقنة</h3>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              لا توجد آيات متعثرة حالياً. واصل المراجعة اليومية المنتظمة لتحافظ على هذا المستوى
              الممتاز.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {forgottenVerses.map((item) => {
              const surahName = getSurahName(item.surahNumber);
              const lastMistake = item.recentMistakes[0];

              return (
                <div
                  key={`${item.surahNumber}_${item.ayahNumber}`}
                  className="bg-white rounded-2xl border border-amber-200/80 hover:border-amber-400 p-5 shadow-xs transition-all space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-stone-900">سورة {surahName}</span>
                      <span className="text-xs bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md font-semibold">
                        الآية {item.ayahNumber}
                      </span>
                    </div>

                    <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                      أخطاء سابقة: {item.mistakeCount}
                    </span>
                  </div>

                  {/* Previous Mistake Details */}
                  {lastMistake && (
                    <div className="bg-stone-50 rounded-xl p-3 text-xs text-stone-600 border border-stone-100 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-stone-500">موضع التعثر السابق:</span>
                        <span className="text-rose-600 font-bold">"{lastMistake.recitedWord}"</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-stone-500">الكلمة الصحيحة في المصحف:</span>
                        <span className="text-emerald-700 font-bold font-quran text-sm">
                          "{lastMistake.expectedWord}"
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-stone-500">
                      التكرار المتباعد: يحتاج جلسة تسميع
                    </span>

                    <button
                      onClick={() => onStartPracticingVerse(item.surahNumber, item.ayahNumber)}
                      className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-xs"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>تسميع وتثبيت</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: Active Periodic Revision Plans */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
              <CalendarClock className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900">خطط المراجعة الدورية النشطة</h2>
              <p className="text-xs text-stone-500">
                برامج مجدولة لمراجعة السور والأجزاء وفق خطة زمنية ومعدل يومي
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 bg-white border border-stone-300 hover:border-emerald-600 text-stone-800 text-xs font-semibold px-3.5 py-2 rounded-xl transition-all shadow-xs"
          >
            <Plus className="w-4 h-4 text-emerald-600" />
            <span>خطة مراجعة جديدة</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const progressPercent = Math.min(
              100,
              Math.round((plan.currentDay / plan.durationDays) * 100),
            );
            const isFinished = plan.currentDay >= plan.durationDays;

            return (
              <div
                key={plan.id}
                className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-emerald-300 transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                      {plan.category === 'spaced_repetition'
                        ? 'تكرار متباعد'
                        : plan.category === 'daily_wird'
                          ? 'ورد يومي'
                          : 'تثبيت سورة'}
                    </span>
                    <span className="text-xs text-stone-500">
                      اليوم {plan.currentDay} من {plan.durationDays}
                    </span>
                  </div>

                  <h3 className="font-bold text-stone-900 text-base leading-snug">{plan.title}</h3>
                  <p className="text-xs text-stone-500 line-clamp-2">{plan.description}</p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-stone-600">
                    <span>نسبة الإنجاز</span>
                    <span className="font-bold text-emerald-700">{progressPercent}%</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  <div className="text-[11px] text-stone-500 flex items-center justify-between pt-1">
                    <span>الهدف: {plan.dailyTargetAyahs} آية / يوم</span>
                    <span>{plan.targetSurahs.length} سور مدرجة</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (plan.targetSurahs.length > 0) {
                        onStartPracticingVerse(plan.targetSurahs[0], 1);
                      }
                    }}
                    className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold py-2 rounded-xl text-center transition-colors"
                  >
                    ابدأ مراجعة اليوم
                  </button>

                  <button
                    onClick={() => handleCompleteDay(plan.id)}
                    disabled={isFinished}
                    className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl transition-colors disabled:opacity-40"
                    title="تأكيد إتمام ورد اليوم (+50 حسنة)"
                  >
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: Create Custom Plan */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-bold text-stone-900 text-lg">إنشاء خطة مراجعة دورية مخصصة</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-stone-400 hover:text-stone-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-stone-800">اسم الخطة أو الهدف:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: مراجعة سورة الكهف أسبوعياً، تثبيت جزء تبارك..."
                  value={newPlanTitle}
                  onChange={(e) => setNewPlanTitle(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl p-3 text-stone-900 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-stone-800">الهدف اليومي (عدد الآيات):</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={dailyTarget}
                    onChange={(e) => setDailyTarget(Number(e.target.value))}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl p-3 text-stone-900 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-stone-800">مدة الخطة (بالأيام):</label>
                  <input
                    type="number"
                    min={3}
                    max={90}
                    value={durationDays}
                    onChange={(e) => setDurationDays(Number(e.target.value))}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl p-3 text-stone-900 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-stone-800">اختر السور المستهدفة:</label>
                <div className="max-h-40 overflow-y-auto border border-stone-200 rounded-xl p-2.5 grid grid-cols-2 gap-2 bg-stone-50">
                  {ALL_SURAHS.slice(0, 30).map((s) => {
                    const isChecked = selectedSurahNums.includes(s.number);
                    return (
                      <label
                        key={s.number}
                        className="flex items-center gap-2 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSurahNums([...selectedSurahNums, s.number]);
                            } else {
                              setSelectedSurahNums(selectedSurahNums.filter((n) => n !== s.number));
                            }
                          }}
                          className="accent-emerald-600 rounded"
                        />
                        <span className="text-[11px] text-stone-700">
                          {s.number}. {s.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-stone-600 hover:bg-stone-100 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold shadow-xs cursor-pointer"
                >
                  إنشاء الخطة والبدء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
