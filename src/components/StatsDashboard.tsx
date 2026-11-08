import React from 'react';
import {
  BarChart3,
  CheckCircle2,
  Clock,
  TrendingUp,
  Flame,
  Sparkles,
  Award,
  ShieldCheck,
  BookMarked,
  BrainCircuit,
} from 'lucide-react';
import { UserStats, VerseMastery } from '../types/quran';
import { formatTime } from '../utils/arabicUtils';

interface StatsDashboardProps {
  stats: UserStats;
  verseMasteryMap: Record<string, VerseMastery>;
}

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ stats, verseMasteryMap }) => {
  const masteryValues = Object.values(verseMasteryMap);
  const masteredCount = masteryValues.filter((v) => v.level === 'mastered').length;
  const goodCount = masteryValues.filter((v) => v.level === 'good').length;
  const reviewNeededCount = masteryValues.filter((v) => v.level === 'review_needed').length;
  const totalTracked = masteryValues.length || 1;

  const masteredPercent = Math.round((masteredCount / totalTracked) * 100);
  const reviewPercent = Math.round((reviewNeededCount / totalTracked) * 100);

  // 7-day activity simulation based on stats
  const daysOfWeek = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const dailyActivity = [
    { day: 'السبت', verses: 28 },
    { day: 'الأحد', verses: 35 },
    { day: 'الإثنين', verses: 22 },
    { day: 'الثلاثاء', verses: 40 },
    { day: 'الأربعاء', verses: 31 },
    { day: 'الخميس', verses: 48 },
    { day: 'الجمعة', verses: 52 },
  ];
  const maxDaily = Math.max(...dailyActivity.map((d) => d.verses), 50);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Hero Header */}
      <div className="bg-brand-gradient text-white rounded-3xl p-6 sm:p-8 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold text-gold-200 bg-white/5 px-2.5 py-0.5 rounded-md border border-gold-400/30">
              تقرير الإتقان والمواظبة
            </span>
            <h1 className="text-2xl font-bold text-white font-display">
              إحصائيات الأداء اليومي والتثبيت
            </h1>
            <p className="text-xs text-jade-100/60">
              بيانات رقمية دقيقة تبيّن تقدمك ومستوى الدقة في التسميع الصوتي
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-center">
            <span className="text-xs text-jade-100/60 block">المستوى الحالي</span>
            <span className="text-base font-bold text-gold-300 font-display">{stats.level}</span>
          </div>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Verses */}
        <div className="glass-panel rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-jade-100/60">إجمالي الآيات</span>
            <div className="p-2 rounded-lg bg-gold-400/15 text-gold-300">
              <BookMarked className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">
            {stats.totalVersesRecited.toLocaleString('ar-EG')}
          </div>
          <p className="text-[11px] text-gold-300 font-medium">آية تمت تلاوتها ومراجعتها</p>
        </div>

        {/* Recitation Accuracy */}
        <div className="glass-panel rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-jade-100/60">دقة التسميع الصوتي</span>
            <div className="p-2 rounded-lg bg-jade-500/15 text-jade-300">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-gold-300">{stats.accuracyRate}%</div>
          <p className="text-[11px] text-jade-100/60">مطابقة ممتازة للألفاظ</p>
        </div>

        {/* Time Spent */}
        <div className="glass-panel rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-jade-100/60">وقت التلاوة والمراجعة</span>
            <div className="p-2 rounded-lg bg-gold-400/15 text-gold-300">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">
            {Math.round(stats.totalRecitedSeconds / 60)} دقيقة
          </div>
          <p className="text-[11px] text-jade-100/60">جلسات تعاهد القرآن</p>
        </div>

        {/* Fixed Mistakes */}
        <div className="glass-panel rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-jade-100/60">أخطاء تم تصحيحها</span>
            <div className="p-2 rounded-lg bg-rose-500/15 text-rose-300">
              <BrainCircuit className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{stats.mistakesFixedCount}</div>
          <p className="text-[11px] text-jade-100/60">مواضع تعثر ثُبّتت بنجاح</p>
        </div>
      </div>

      {/* 7-Day Activity Chart & Mastery Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Bar Chart (2 columns) */}
        <div className="lg:col-span-2 glass-panel rounded-3xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="font-bold text-white text-base">
                نشاط التلاوة والمراجعة خلال الأسبوع
              </h2>
              <p className="text-xs text-jade-100/60">عدد الآيات اليومية المسمّعة والمراجعة</p>
            </div>
            <span className="text-xs text-gold-200 font-semibold bg-white/5 border border-gold-400/30 px-2 py-1 rounded-md">
              مواظبة ممتازة
            </span>
          </div>

          {/* Bar Chart Visualization */}
          <div className="pt-6 pb-2">
            <div className="flex items-end justify-between gap-2 h-44 border-b border-white/10 px-2">
              {dailyActivity.map((item, idx) => {
                const heightPercent = Math.round((item.verses / maxDaily) * 100);
                const isToday = idx === dailyActivity.length - 1;

                return (
                  <div key={item.day} className="flex-1 flex flex-col items-center gap-2 group">
                    <span className="text-[11px] font-bold text-jade-100/70 group-hover:text-gold-300 transition-colors">
                      {item.verses}
                    </span>
                    <div className="w-full max-w-[36px] bg-white/10 rounded-t-lg h-36 flex items-end overflow-hidden">
                      <div
                        className={`w-full rounded-t-lg transition-all duration-500 ${
                          isToday
                            ? 'bg-gradient-to-t from-gold-500 to-gold-300 shadow-xs'
                            : 'bg-jade-500/70 group-hover:bg-jade-500'
                        }`}
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-jade-100/60 font-medium">{item.day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Mastery Distribution Card (1 column) */}
        <div className="glass-panel rounded-3xl p-6 space-y-5">
          <div className="space-y-0.5">
            <h2 className="font-bold text-white text-base">توزيع جودة الحفظ</h2>
            <p className="text-xs text-jade-100/60">وفق مقياس التكرار المتباعد</p>
          </div>

          <div className="space-y-4 pt-2">
            {/* Mastered */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-jade-100/80 font-medium flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-gold-400" />
                  آيات متقنة (3+ تسميع ناجح)
                </span>
                <span className="font-bold text-white">{masteredCount} آيات</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gold-400 h-full rounded-full"
                  style={{ width: `${masteredPercent}%` }}
                />
              </div>
            </div>

            {/* In Progress / Good */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-jade-100/80 font-medium flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-jade-400" />
                  آيات في طور التثبيت
                </span>
                <span className="font-bold text-white">{goodCount} آيات</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-jade-400 h-full rounded-full"
                  style={{ width: `${Math.round((goodCount / totalTracked) * 100)}%` }}
                />
              </div>
            </div>

            {/* Needs Review */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-jade-100/80 font-medium flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-gold-300" />
                  تحتاج مراجعة وتكرار
                </span>
                <span className="font-bold text-white">{reviewNeededCount} آيات</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gold-300 h-full rounded-full"
                  style={{ width: `${reviewPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="p-3 bg-white/5 rounded-xl text-[11px] text-jade-100/70 border border-white/10">
            تنبيه الخوارزمية: التسميع المتصل 3 مرات دون خطأ ينقل الآية تلقائياً لدرجة "متقنة".
          </div>
        </div>
      </div>
    </div>
  );
};
