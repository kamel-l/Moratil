import React, { useMemo, useState } from 'react';
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
  ChevronDown,
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
  const [expandedSurahs, setExpandedSurahs] = useState<number[]>([]);

  const getSurahName = (num: number) => {
    return ALL_SURAHS.find((s) => s.number === num)?.name || `سورة ${num}`;
  };

  const groupedForgottenVerses = useMemo(() => {
    const groups = new Map<number, VerseMastery[]>();
    forgottenVerses.forEach((item) => {
      const list = groups.get(item.surahNumber);
      if (list) list.push(item);
      else groups.set(item.surahNumber, [item]);
    });

    return Array.from(groups.entries())
      .map(([surahNumber, verses]) => ({
        surahNumber,
        verses: [...verses].sort((a, b) => a.ayahNumber - b.ayahNumber),
        totalMistakes: verses.reduce((sum, verse) => sum + verse.mistakeCount, 0),
      }))
      .sort((a, b) => a.surahNumber - b.surahNumber);
  }, [forgottenVerses]);

  const toggleSurahGroup = (surahNumber: number) => {
    setExpandedSurahs((prev) =>
      prev.includes(surahNumber) ? prev.filter((num) => num !== surahNumber) : [...prev, surahNumber],
    );
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
      <div className="bg-brand-gradient text-white rounded-3xl p-6 sm:p-8 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-gold-400/30 px-3 py-1 rounded-full text-xs text-gold-200 font-medium">
            <CalendarClock className="w-3.5 h-3.5" />
            <span>نظام التكرار المتباعد (Spaced Repetition)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-display text-white">
            خطط المراجعة وتنبيهات تثبيت الحفظ
          </h1>
          <p className="text-xs sm:text-sm text-jade-100/80 leading-relaxed">
            القرآن أشد تفلتاً من الإبل في عقلها. خطط المراجعة الدورية الذكية تتابع أدائك وتنبّهك
            للآيات التي قاربت على النسيان أو تعثرت بها سابقاً لضمان رسوخ الحفظ في صدرك.
          </p>
        </div>
      </div>

      {/* SECTION 1: Forgotten Verses / Verses Needing Reinforcement Alerts */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gold-400/15 text-gold-300">
              <AlertTriangle className="w-5 h-5 text-gold-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                تنبيه: آيات تحتاج لتثبيت وتكرار عاجل
              </h2>
              <p className="text-xs text-jade-100/60">
                آيات أظهرت خوارزمية التعرف الصوتي تعثراً في حفظها أو حان موعد مراجعتها المتباعدة
              </p>
            </div>
          </div>

          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gold-400/15 text-gold-200 border border-gold-400/30">
            {forgottenVerses.length} آيات
          </span>
        </div>

        {forgottenVerses.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 text-center space-y-2">
            <CheckCircle className="w-10 h-10 text-jade-300 mx-auto" />
            <h3 className="font-bold text-white text-base">ما شاء الله! جميع محفوظاتك متقنة</h3>
            <p className="text-xs text-jade-100/60 max-w-md mx-auto">
              لا توجد آيات متعثرة حالياً. واصل المراجعة اليومية المنتظمة لتحافظ على هذا المستوى
              الممتاز.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groupedForgottenVerses.map((group) => {
              const surahName = getSurahName(group.surahNumber);
              const isExpanded = expandedSurahs.includes(group.surahNumber);

              return (
                <div key={group.surahNumber} className="glass-panel rounded-2xl overflow-hidden">
                  {/* Surah Group Header */}
                  <button
                    type="button"
                    onClick={() => toggleSurahGroup(group.surahNumber)}
                    aria-expanded={isExpanded}
                    className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/5 transition-colors cursor-pointer text-right"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-xl bg-gold-400/15 border border-gold-400/30 text-gold-300 font-bold text-xs flex items-center justify-center font-display shrink-0">
                        {group.surahNumber}
                      </span>
                      <div className="text-right">
                        <div className="font-bold text-white text-sm">سورة {surahName}</div>
                        <div className="text-[11px] text-jade-100/60">
                          {group.verses.length} آية تحتاج تثبيتاً · {group.totalMistakes} خطأ سابق
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gold-400/15 text-gold-200 border border-gold-400/30">
                        {group.verses.length}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-jade-100/60 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-white/10 divide-y divide-white/10">
                      {group.verses.map((item) => {
                        const lastMistake = item.recentMistakes[0];

                        return (
                          <div
                            key={`${item.surahNumber}_${item.ayahNumber}`}
                            className="p-4 space-y-3 hover:bg-white/5 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-white">
                                الآية {item.ayahNumber}
                              </span>

                              <span className="text-[11px] font-medium text-gold-300 bg-gold-400/15 border border-gold-400/30 px-2 py-0.5 rounded-md">
                                أخطاء سابقة: {item.mistakeCount}
                              </span>
                            </div>

                            {/* Previous Mistake Details */}
                            {lastMistake && (
                              <div className="bg-white/5 rounded-xl p-3 text-xs text-jade-100/70 border border-white/10 space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-jade-100/60">موضع التعثر السابق:</span>
                                  <span className="text-rose-300 font-bold">
                                    "{lastMistake.recitedWord}"
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-jade-100/60">
                                    الكلمة الصحيحة في المصحف:
                                  </span>
                                  <span className="text-gold-300 font-bold font-quran text-sm">
                                    "{lastMistake.expectedWord}"
                                  </span>
                                </div>
                              </div>
                            )}

                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-jade-100/60">
                                التكرار المتباعد: يحتاج جلسة تسميع
                              </span>

                              <button
                                onClick={() =>
                                  onStartPracticingVerse(item.surahNumber, item.ayahNumber)
                                }
                                className="flex items-center gap-1.5 bg-gold-400 hover:bg-gold-300 text-jade-950 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-lg shadow-gold-500/20"
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
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: Active Periodic Revision Plans */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/5 text-gold-300">
              <CalendarClock className="w-5 h-5 text-gold-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">خطط المراجعة الدورية النشطة</h2>
              <p className="text-xs text-jade-100/60">
                برامج مجدولة لمراجعة السور والأجزاء وفق خطة زمنية ومعدل يومي
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 glass-panel text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-all hover:border-gold-400/30 hover:bg-white/10"
          >
            <Plus className="w-4 h-4 text-gold-300" />
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
                className="glass-panel rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-gold-400/30 transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gold-200 bg-white/5 px-2 py-0.5 rounded-md border border-gold-400/30">
                      {plan.category === 'spaced_repetition'
                        ? 'تكرار متباعد'
                        : plan.category === 'daily_wird'
                          ? 'ورد يومي'
                          : 'تثبيت سورة'}
                    </span>
                    <span className="text-xs text-jade-100/60">
                      اليوم {plan.currentDay} من {plan.durationDays}
                    </span>
                  </div>

                  <h3 className="font-bold text-white text-base leading-snug">{plan.title}</h3>
                  <p className="text-xs text-jade-100/60 line-clamp-2">{plan.description}</p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-jade-100/70">
                    <span>نسبة الإنجاز</span>
                    <span className="font-bold text-gold-300">{progressPercent}%</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gold-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  <div className="text-[11px] text-jade-100/60 flex items-center justify-between pt-1">
                    <span>الهدف: {plan.dailyTargetAyahs} آية / يوم</span>
                    <span>{plan.targetSurahs.length} سور مدرجة</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (plan.targetSurahs.length > 0) {
                        onStartPracticingVerse(plan.targetSurahs[0], 1);
                      }
                    }}
                    className="flex-1 glass-panel text-white text-xs font-semibold py-2 rounded-xl text-center transition-colors hover:bg-white/10"
                  >
                    ابدأ مراجعة اليوم
                  </button>

                  <button
                    onClick={() => handleCompleteDay(plan.id)}
                    disabled={isFinished}
                    className="p-2 bg-jade-500/15 hover:bg-jade-500/25 text-jade-300 rounded-xl transition-colors disabled:opacity-40"
                    title="تأكيد إتمام ورد اليوم (+50 حسنة)"
                  >
                    <CheckCircle className="w-5 h-5 text-jade-300" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: Create Custom Plan */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-jade-900 border border-white/10 text-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-white text-lg">إنشاء خطة مراجعة دورية مخصصة</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-jade-100/60 hover:text-white text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-jade-100/80">اسم الخطة أو الهدف:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: مراجعة سورة الكهف أسبوعياً، تثبيت جزء تبارك..."
                  value={newPlanTitle}
                  onChange={(e) => setNewPlanTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/15 rounded-xl p-3 text-white text-xs focus:outline-none focus:ring-2 focus:ring-gold-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-jade-100/80">الهدف اليومي (عدد الآيات):</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={dailyTarget}
                    onChange={(e) => setDailyTarget(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/15 rounded-xl p-3 text-white text-xs focus:outline-none focus:ring-2 focus:ring-gold-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-jade-100/80">مدة الخطة (بالأيام):</label>
                  <input
                    type="number"
                    min={3}
                    max={90}
                    value={durationDays}
                    onChange={(e) => setDurationDays(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/15 rounded-xl p-3 text-white text-xs focus:outline-none focus:ring-2 focus:ring-gold-400"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-jade-100/80">اختر السور المستهدفة:</label>
                <div className="max-h-40 overflow-y-auto border border-white/10 rounded-xl p-2.5 grid grid-cols-2 gap-2 bg-white/5">
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
                          className="accent-gold-400 rounded"
                        />
                        <span className="text-[11px] text-jade-100/80">
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
                  className="px-4 py-2 rounded-xl text-jade-100/70 hover:bg-white/5 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gold-400 hover:bg-gold-300 text-jade-950 font-bold shadow-lg shadow-gold-500/20 cursor-pointer"
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
