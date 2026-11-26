import React, { useState } from 'react';
import { Plus, Play, Target, Trophy, CheckCircle2 } from 'lucide-react';
import { Riwaya, QuranChallenge } from '../types/quran';

interface CompetitionLeaderboardProps {
  challenges: QuranChallenge[];
  surahs: readonly { number: number; name: string; numberOfAyahs: number }[];
  riwaya: Riwaya;
  onStartChallenge: (challenge: QuranChallenge) => void;
  onCreateChallenge: (challenge: QuranChallenge) => void;
}

export const CompetitionLeaderboard: React.FC<CompetitionLeaderboardProps> = ({
  challenges,
  surahs,
  riwaya,
  onStartChallenge,
  onCreateChallenge,
}) => {
  const [surahNumber, setSurahNumber] = useState(1);
  const [ayahStart, setAyahStart] = useState(1);
  const [ayahEnd, setAyahEnd] = useState(5);
  const [difficulty, setDifficulty] = useState<QuranChallenge['difficulty']>('سهل');
  const [rewardPoints, setRewardPoints] = useState(10);
  const selectedSurah = surahs.find((surah) => surah.number === surahNumber) ?? surahs[0];

  const handleCreateChallenge = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onCreateChallenge({
      id: `challenge_${Date.now()}`,
      title: `تسميع سورة ${selectedSurah.name} من الآية ${ayahStart} إلى ${ayahEnd}`,
      surahNumber,
      ayahStart,
      ayahEnd,
      riwaya,
      rewardPoints,
      difficulty,
      expiresInHours: 24,
      completed: false,
      createdAt: Date.now(),
      attempts: 0,
      bestScore: null,
      bestAyahsPerfect: 0,
      completedAt: null,
    });
  };

  return (
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
            أنشئ تحديًا، سمّع الآيات بصوتك، وسجّل نتيجتك تلقائيًا. أفضل نتيجة لكل تحدي تظهر في البطاقة.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-white">إنشاء تحدٍ</h2>
        <form
          onSubmit={handleCreateChallenge}
          className="grid grid-cols-1 gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-2"
        >
          <label className="space-y-1 text-sm font-medium text-stone-700">
            <span>السورة</span>
            <select
              value={surahNumber}
              onChange={(event) => {
                const number = Number(event.target.value);
                const surah = surahs.find((item) => item.number === number) ?? surahs[0];
                setSurahNumber(number);
                setAyahStart(1);
                setAyahEnd(Math.min(5, surah.numberOfAyahs));
              }}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900"
            >
              {surahs.map((surah) => (
                <option key={surah.number} value={surah.number}>
                  {surah.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm font-medium text-stone-700">
              <span>من الآية</span>
              <input
                type="number" min={1} max={selectedSurah.numberOfAyahs}
                value={ayahStart} required
                onChange={(event) => {
                  const number = Number(event.target.value);
                  setAyahStart(number);
                  if (number > ayahEnd) setAyahEnd(number);
                }}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-stone-700">
              <span>إلى الآية</span>
              <input
                type="number" min={ayahStart} max={selectedSurah.numberOfAyahs}
                value={ayahEnd} required
                onChange={(event) => setAyahEnd(Number(event.target.value))}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900"
              />
            </label>
          </div>
          <label className="space-y-1 text-sm font-medium text-stone-700">
            <span>مستوى الصعوبة</span>
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as QuranChallenge['difficulty'])}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900"
            >
              <option value="سهل">سهل</option>
              <option value="متوسط">متوسط</option>
              <option value="تحدي قوي">تحدي قوي</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-stone-700">
            <span>النقاط</span>
            <input
              type="number" min={1} value={rewardPoints} required
              onChange={(event) => setRewardPoints(Number(event.target.value))}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white transition-colors hover:bg-emerald-800"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>إضافة التحدي</span>
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-emerald-700" aria-hidden="true" />
          <h2 className="text-lg font-bold text-white">التحديات المتاحة</h2>
        </div>

        {challenges.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
            لا توجد تحديات حاليًا.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {challenges.map((challenge) => {
              const hasResult = challenge.bestScore != null;
              const passed = challenge.completed;
              return (
                <article
                  key={challenge.id}
                  className={`flex flex-col justify-between space-y-3 rounded-2xl border p-5 shadow-xs transition-colors ${
                    passed
                      ? 'border-emerald-300 bg-emerald-50/40'
                      : 'border-stone-200 bg-white hover:border-emerald-300'
                  }`}
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

                    {hasResult && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${
                          challenge.bestScore! >= 80 ? 'bg-emerald-100 text-emerald-800'
                          : challenge.bestScore! >= 60 ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                        }`}>
                          <Trophy className="w-3 h-3" />
                          أفضل: {challenge.bestScore}%
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-stone-700 font-semibold">
                          <CheckCircle2 className="w-3 h-3" />
                          {challenge.bestAyahsPerfect ?? 0} آية كاملة
                        </span>
                        {(challenge.attempts ?? 0) > 1 && (
                          <span className="text-stone-400">· {challenge.attempts} محاولات</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-stone-100 pt-2 text-xs">
                    <span className={`font-semibold ${passed ? 'text-emerald-700' : 'text-stone-500'}`}>
                      {passed
                        ? `✓ مكتمل${challenge.completedAt ? ` — ${new Date(challenge.completedAt).toLocaleDateString('ar')}` : ''}`
                        : hasResult
                        ? 'لم تُكمل بعد — أعد المحاولة'
                        : `ينتهي خلال ${challenge.expiresInHours} ساعة`}
                    </span>
                    <button
                      type="button"
                      onClick={() => onStartChallenge(challenge)}
                      className="flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-emerald-800"
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{passed ? 'إعادة المحاولة' : hasResult ? 'حاول مجددًا' : 'بدء التحدي'}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};