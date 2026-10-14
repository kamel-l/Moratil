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
  Mic,
} from 'lucide-react';
import { UserStats, VerseMastery } from '../types/quran';
import { formatTime } from '../utils/arabicUtils';
import {
  getDailyRecitationActivity,
  getVersesNeedingReinforcement,
} from '../services/storageService';

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

  const dailyActivity = getDailyRecitationActivity(7).map((item) => ({
    day: new Date(`${item.date}T12:00:00`).toLocaleDateString('ar-EG', { weekday: 'short' }),
    verses: item.verses,
    sessions: item.sessions,
  }));
  const maxDaily = Math.max(...dailyActivity.map((day) => day.verses), 1);
  const weeklyVerses = dailyActivity.reduce((total, day) => total + day.verses, 0);
  const weeklySessions = dailyActivity.reduce((total, day) => total + day.sessions, 0);
  const dueReviewCount = getVersesNeedingReinforcement().length;
  const recurringMistakes = masteryValues
    .flatMap((mastery) => mastery.recentMistakes)
    .reduce<{ word: string; count: number }[]>((mistakes, mistake) => {
      const existing = mistakes.find((item) => item.word === mistake.expectedWord);
      if (existing) existing.count += 1;
      else mistakes.push({ word: mistake.expectedWord, count: 1 });
      return mistakes;
    }, [])
    .filter((mistake) => mistake.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Hero Header */}
      <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-100">
              تقرير الإتقان والمواظبة
            </span>
            <h1 className="text-2xl font-bold text-stone-900 font-serif">
              إحصائيات الأداء اليومي والتثبيت
            </h1>
            <p className="text-xs text-stone-500">
              مؤشرات تساعدك على متابعة المراجعة دون اختزال إتقان القرآن في رقم واحد
            </p>
          </div>

          <div className="bg-stone-50 border border-stone-200 rounded-2xl px-5 py-3 text-center">
            <span className="text-xs text-stone-500 block">المستوى الحالي</span>
            <span className="text-base font-bold text-emerald-800 font-serif">{stats.level}</span>
          </div>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {/* Total Verses */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-stone-500">إجمالي الآيات</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
              <BookMarked className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-stone-900">
            {stats.totalVersesRecited.toLocaleString('ar-EG')}
          </div>
          <p className="text-[11px] text-emerald-700 font-medium">آية تمت تلاوتها ومراجعتها</p>
        </div>

        {/* Recitation Accuracy */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-stone-500">تطابق الكلمات آليًا</span>
            <div className="p-2 rounded-lg bg-teal-50 text-teal-700">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-teal-800">
            {stats.totalVersesRecited > 0 ? `${stats.accuracyRate}%` : '—'}
          </div>
          <p className="text-[11px] leading-relaxed text-stone-500">
            تقدير آلي للنص المتعرّف عليه؛ لا يقيس النطق أو أحكام التجويد
          </p>
        </div>

        {/* Time Spent */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-stone-500">وقت التلاوة والمراجعة</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-stone-900">
            {Math.round(stats.totalRecitedSeconds / 60)} دقيقة
          </div>
          <p className="text-[11px] text-stone-500">جلسات تعاهد القرآن</p>
        </div>

        {/* Fixed Mistakes */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-stone-500">مواضع تثبيت مسجلة</span>
            <div className="p-2 rounded-lg bg-rose-50 text-rose-700">
              <BrainCircuit className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-stone-900">{stats.mistakesFixedCount}</div>
          <p className="text-[11px] text-stone-500">اختلافات نصية أُعيدت مراجعتها</p>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-stone-500">جلسات هذا الأسبوع</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
              <Mic className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-stone-900">
            {weeklySessions.toLocaleString('ar-EG')}
          </div>
          <p className="text-[11px] text-stone-500">جلسات تسميع بدأت خلال آخر 7 أيام</p>
        </div>
      </div>

      {/* 7-Day Activity Chart & Mastery Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Bar Chart (2 columns) */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-stone-200 p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="font-bold text-stone-900 text-base">
                نشاط التلاوة والمراجعة خلال الأسبوع
              </h2>
              <p className="text-xs text-stone-500">
                الآيات المسجلة في التسميع والمراجعة خلال آخر 7 أيام
              </p>
            </div>

            <span className="text-xs text-emerald-800 font-semibold bg-emerald-50 px-2 py-1 rounded-md">
              {weeklyVerses.toLocaleString('ar-EG')} آية هذا الأسبوع
            </span>
          </div>

          {/* Bar Chart Visualization */}
          <div className="pt-6 pb-2">
            <div className="flex items-end justify-between gap-2 h-44 border-b border-stone-200 px-2">
              {dailyActivity.map((item, idx) => {
                const heightPercent = Math.round((item.verses / maxDaily) * 100);
                const isToday = idx === dailyActivity.length - 1;

                return (
                  <div key={item.day} className="flex-1 flex flex-col items-center gap-2 group">
                    <span className="text-[11px] font-bold text-stone-600 group-hover:text-emerald-700 transition-colors">
                      {item.verses}
                    </span>
                    <div className="w-full max-w-[36px] bg-stone-100 rounded-t-lg h-36 flex items-end overflow-hidden">
                      <div
                        className={`w-full rounded-t-lg transition-all duration-500 ${
                          isToday
                            ? 'bg-gradient-to-t from-emerald-700 to-emerald-500 shadow-xs'
                            : 'bg-emerald-600/70 group-hover:bg-emerald-600'
                        }`}
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-stone-500 font-medium">{item.day}</span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Mastery Distribution Card (1 column) */}
        <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs space-y-5">
          <div className="space-y-0.5">
            <h2 className="font-bold text-stone-900 text-base">توزيع جودة الحفظ</h2>
            <p className="text-xs text-stone-500">وفق مقياس التكرار المتباعد</p>
          </div>

          <div className="space-y-4 pt-2">
            {/* Mastered */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-stone-700 font-medium flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                  آيات متقنة (3+ تسميع ناجح)
                </span>
                <span className="font-bold text-stone-900">{masteredCount} آيات</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-600 h-full rounded-full"
                  style={{ width: `${masteredPercent}%` }}
                />
              </div>
            </div>

            {/* In Progress / Good */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-stone-700 font-medium flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                  آيات في طور التثبيت
                </span>
                <span className="font-bold text-stone-900">{goodCount} آيات</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-teal-500 h-full rounded-full"
                  style={{ width: `${Math.round((goodCount / totalTracked) * 100)}%` }}
                />
              </div>
            </div>

            {/* Needs Review */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-stone-700 font-medium flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  تحتاج مراجعة وتكرار
                </span>
                <span className="font-bold text-stone-900">{reviewNeededCount} آيات</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-amber-500 h-full rounded-full"
                  style={{ width: `${reviewPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="p-3 bg-stone-50 rounded-xl text-[11px] text-stone-600 border border-stone-100">
            تعتمد درجة الإتقان هنا على تكرار مطابقة الكلمات آليًا، ولا تثبت صحة النطق أو التجويد.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-stone-900">مواضع تكرر فيها اختلاف النص</h2>
              <p className="mt-1 text-xs text-stone-500">
                إشارات آلية للمراجعة، وليست حكمًا مؤكدًا على التلاوة
              </p>
            </div>
            <BrainCircuit className="h-5 w-5 shrink-0 text-amber-700" />
          </div>
          {recurringMistakes.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {recurringMistakes.map((mistake) => (
                <li
                  key={mistake.word}
                  className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm"
                >
                  <span className="font-quran text-lg text-stone-800">{mistake.word}</span>
                  <span className="text-xs text-stone-600">
                    ظهر الاختلاف {mistake.count.toLocaleString('ar-EG')} مرات
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl bg-stone-50 px-3 py-3 text-sm text-stone-600">
              لا توجد مواضع متكررة مسجلة حتى الآن.
            </p>
          )}
        </section>

        <section className="flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div>
            <h2 className="font-bold text-stone-900">المراجعات المستحقة</h2>
            <p className="mt-1 text-sm text-stone-600">
              آيات حان موعد مراجعتها أو سُجل فيها موضع يحتاج إلى تثبيت
            </p>
          </div>
          <div className="shrink-0 text-center">
            <span className="block text-2xl font-bold text-amber-900">
              {dueReviewCount.toLocaleString('ar-EG')}
            </span>
            <span className="text-[11px] text-amber-800">آية</span>
          </div>
        </section>
      </div>
    </div>
  );
};
