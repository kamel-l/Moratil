import React, { useMemo } from 'react';
import {
  BookMarked,
  BrainCircuit,
  Clock,
  Mic,
  ShieldCheck,
} from 'lucide-react';
import type { UserStats, VerseMastery } from '../types/quran';
import { getDailyRecitationActivity } from '../services/storageService';
import { ProgressBar, SectionCard, StatCard } from './ui';

interface StatsDashboardProps {
  stats: UserStats;
  verseMasteryMap: Record<string, VerseMastery>;
}

/**
 * Stable reference time for due-review counting. Reading the clock at module
 * scope keeps the render pure while still giving a sensible "now" per session.
 */
const REVIEW_REFERENCE_TIME = Date.now();

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ stats, verseMasteryMap }) => {
  const { masteredCount, goodCount, reviewNeededCount, totalTracked, dueReviewCount } =
    useMemo(() => {
      const values = Object.values(verseMasteryMap);
      return {
        masteredCount: values.filter((v) => v.level === 'mastered').length,
        goodCount: values.filter((v) => v.level === 'good').length,
        reviewNeededCount: values.filter((v) => v.level === 'review_needed').length,
        totalTracked: values.length || 1,
        dueReviewCount: values.filter(
          (v) =>
            v.level === 'review_needed' ||
            v.mistakeCount > 0 ||
            Date.parse(v.nextReviewAt) <= REVIEW_REFERENCE_TIME,
        ).length,
      };
    }, [verseMasteryMap]);

  const dailyActivity = getDailyRecitationActivity(7).map((item) => ({
    key: item.date,
    day: new Date(`${item.date}T12:00:00`).toLocaleDateString('ar-EG', { weekday: 'short' }),
    verses: item.verses,
    sessions: item.sessions,
  }));
  const maxDaily = Math.max(...dailyActivity.map((day) => day.verses), 1);
  const weeklyVerses = dailyActivity.reduce((total, day) => total + day.verses, 0);
  const weeklySessions = dailyActivity.reduce((total, day) => total + day.sessions, 0);

  const recurringMistakes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const mastery of Object.values(verseMasteryMap)) {
      for (const mistake of mastery.recentMistakes) {
        counts.set(mistake.expectedWord, (counts.get(mistake.expectedWord) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [verseMasteryMap]);

  const masteredPercent = Math.round((masteredCount / totalTracked) * 100);
  const goodPercent = Math.round((goodCount / totalTracked) * 100);
  const reviewPercent = Math.round((reviewNeededCount / totalTracked) * 100);

  return (
    <div className="mx-auto max-w-5xl space-y-6 sm:space-y-8">
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <span className="rounded-md border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
              تقرير الإتقان والمواظبة
            </span>
            <h1 className="font-serif text-2xl font-bold text-stone-900">
              إحصائيات الأداء اليومي والتثبيت
            </h1>
            <p className="text-xs text-stone-500">
              مؤشرات تساعدك على متابعة المراجعة دون اختزال إتقان القرآن في رقم واحد
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-3 text-center">
            <span className="block text-xs text-stone-500">المستوى الحالي</span>
            <span className="font-serif text-base font-bold text-emerald-800">{stats.level}</span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="إجمالي الآيات"
          value={stats.totalVersesRecited.toLocaleString('ar-EG')}
          hint="آية تمت تلاوتها ومراجعتها"
          icon={<BookMarked className="h-4 w-4" />}
          tone="emerald"
        />
        <StatCard
          label="تطابق الكلمات آليًا"
          value={stats.totalVersesRecited > 0 ? `${stats.accuracyRate}%` : '—'}
          hint="تقدير آلي للنص المتعرّف عليه؛ لا يقيس النطق أو أحكام التجويد"
          icon={<ShieldCheck className="h-4 w-4" />}
          tone="teal"
        />
        <StatCard
          label="وقت التلاوة والمراجعة"
          value={`${Math.round(stats.totalRecitedSeconds / 60)} دقيقة`}
          hint="جلسات تعاهد القرآن"
          icon={<Clock className="h-4 w-4" />}
          tone="amber"
        />
        <StatCard
          label="مواضع تثبيت مسجلة"
          value={stats.mistakesFixedCount.toLocaleString('ar-EG')}
          hint="اختلافات نصية أُعيدت مراجعتها"
          icon={<BrainCircuit className="h-4 w-4" />}
          tone="rose"
        />
        <StatCard
          label="جلسات هذا الأسبوع"
          value={weeklySessions.toLocaleString('ar-EG')}
          hint="جلسات تسميع بدأت خلال آخر 7 أيام"
          icon={<Mic className="h-4 w-4" />}
          tone="stone"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard
          title="نشاط التلاوة والمراجعة خلال الأسبوع"
          description="الآيات المسجلة في التسميع والمراجعة خلال آخر 7 أيام"
          className="lg:col-span-2"
          action={
            <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
              {weeklyVerses.toLocaleString('ar-EG')} آية
            </span>
          }
        >
          <div className="pb-2 pt-6">
            <div className="flex h-44 items-end justify-between gap-2 border-b border-stone-200 px-2">
              {dailyActivity.map((item, index) => {
                const heightPercent = Math.round((item.verses / maxDaily) * 100);
                const isToday = index === dailyActivity.length - 1;

                return (
                  <div
                    key={item.key}
                    className="group flex flex-1 flex-col items-center gap-2"
                    title={`${item.day}: ${item.verses} آية`}
                  >
                    <span className="text-[11px] font-bold text-stone-600 transition-colors group-hover:text-emerald-700">
                      {item.verses.toLocaleString('ar-EG')}
                    </span>
                    <div className="flex h-36 w-full max-w-9 items-end overflow-hidden rounded-t-lg bg-stone-100">
                      <div
                        className={
                          isToday
                            ? 'w-full rounded-t-lg bg-gradient-to-t from-emerald-700 to-emerald-500 shadow-xs transition-all duration-500'
                            : 'w-full rounded-t-lg bg-emerald-600/70 transition-all duration-500 group-hover:bg-emerald-600'
                        }
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-stone-500">{item.day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="توزيع جودة الحفظ"
          description="وفق مقياس التكرار المتباعد"
        >
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-stone-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                  آيات متقنة (3+ تسميع ناجح)
                </span>
                <span className="font-bold text-stone-900">{masteredCount} آيات</span>
              </div>
              <ProgressBar value={masteredPercent} label="نسبة الآيات المتقنة" tone="emerald" />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-stone-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-teal-500" />
                  آيات في طور التثبيت
                </span>
                <span className="font-bold text-stone-900">{goodCount} آيات</span>
              </div>
              <ProgressBar value={goodPercent} label="نسبة الآيات في طور التثبيت" tone="teal" />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-stone-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  تحتاج مراجعة وتكرار
                </span>
                <span className="font-bold text-stone-900">{reviewNeededCount} آيات</span>
              </div>
              <ProgressBar value={reviewPercent} label="نسبة الآيات التي تحتاج مراجعة" tone="amber" />
            </div>
          </div>

          <p className="mt-4 rounded-xl border border-stone-100 bg-stone-50 p-3 text-[11px] text-stone-600">
            تعتمد درجة الإتقان هنا على تكرار مطابقة الكلمات آليًا، ولا تثبت صحة النطق أو التجويد.
          </p>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SectionCard
          title="مواضع تكرر فيها اختلاف النص"
          description="إشارات آلية للمراجعة، وليست حكمًا مؤكدًا على التلاوة"
          action={<BrainCircuit className="h-5 w-5 shrink-0 text-amber-700" />}
        >
          {recurringMistakes.length > 0 ? (
            <ul className="space-y-2">
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
            <p className="rounded-xl bg-stone-50 px-3 py-3 text-sm text-stone-600">
              لا توجد مواضع متكررة مسجلة حتى الآن.
            </p>
          )}
        </SectionCard>

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
