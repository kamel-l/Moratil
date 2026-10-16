import React from 'react';
import { Play, Target, Trophy } from 'lucide-react';
import { QuranChallenge } from '../types/quran';

interface CompetitionLeaderboardProps {
  challenges: QuranChallenge[];
  onStartChallenge: (challenge: QuranChallenge) => void;
}

export const CompetitionLeaderboard: React.FC<CompetitionLeaderboardProps> = ({
  challenges,
  onStartChallenge,
}) => (
  <div className="mx-auto max-w-5xl space-y-6" dir="rtl">
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-950 p-6 text-white shadow-sm sm:p-8">
      <div className="relative z-10 max-w-2xl space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300">
          <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
          <span>وفي ذلك فليتنافس المتنافسون</span>
        </div>
        <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
          تحديات التسميع اليومية
        </h1>
        <p className="text-xs leading-relaxed text-emerald-100/90 sm:text-sm">
          اختر تحديًا لمراجعة آيات القرآن. ترتيب الأصدقاء غير متاح حاليًا؛ لن نعرض بيانات منافسة
          غير حقيقية.
        </p>
      </div>
    </section>

    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-emerald-700" aria-hidden="true" />
        <h2 className="text-lg font-bold text-stone-900">التحديات المتاحة</h2>
      </div>

      {challenges.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
          لا توجد تحديات حاليًا.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {challenges.map((challenge) => (
            <article
              key={challenge.id}
              className="flex flex-col justify-between space-y-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-xs transition-colors hover:border-emerald-300"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-900">
                    +{challenge.rewardPoints} نقطة
                  </span>
                  <span className="text-stone-500">{challenge.difficulty}</span>
                </div>
                <h3 className="text-sm font-bold leading-snug text-stone-900">
                  {challenge.title}
                </h3>
              </div>

              <div className="flex items-center justify-between border-t border-stone-100 pt-2 text-xs">
                <span className="text-stone-500">ينتهي خلال {challenge.expiresInHours} ساعة</span>
                <button
                  type="button"
                  onClick={() => onStartChallenge(challenge)}
                  className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-emerald-800"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>بدء التحدي</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  </div>
);
