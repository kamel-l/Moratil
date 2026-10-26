import React, { useState } from 'react';
import { Plus, Play, Target, Trophy } from 'lucide-react';
import { ALL_SURAHS } from '../data/quranSurahsList';
import { QuranChallenge } from '../types/quran';

interface CompetitionLeaderboardProps {
  challenges: QuranChallenge[];
  onStartChallenge: (challenge: QuranChallenge) => void;
  onCreateChallenge: (challenge: QuranChallenge) => void;
}

export const CompetitionLeaderboard: React.FC<CompetitionLeaderboardProps> = ({
  challenges,
  onStartChallenge,
  onCreateChallenge,
}) => {
  const [surahNumber, setSurahNumber] = useState(1);
  const [ayahStart, setAyahStart] = useState(1);
  const [ayahEnd, setAyahEnd] = useState(5);
  const [difficulty, setDifficulty] = useState<QuranChallenge['difficulty']>('سهل');
  const [rewardPoints, setRewardPoints] = useState(10);
  const selectedSurah = ALL_SURAHS.find((surah) => surah.number === surahNumber) ?? ALL_SURAHS[0];

  const handleCreateChallenge = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onCreateChallenge({
      id: `challenge_${Date.now()}`,
      title: `تسميع سورة ${selectedSurah.name} من الآية ${ayahStart} إلى ${ayahEnd}`,
      surahNumber,
      ayahStart,
      ayahEnd,
      rewardPoints,
      difficulty,
      expiresInHours: 24,
      completed: false,
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
          اختر تحديًا لمراجعة آيات القرآن. ترتيب الأصدقاء غير متاح حاليًا؛ لن نعرض بيانات منافسة
          غير حقيقية.
        </p>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-lg font-bold text-stone-900">إنشاء تحدٍ</h2>
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
              const surah = ALL_SURAHS.find((item) => item.number === number) ?? ALL_SURAHS[0];
              setSurahNumber(number);
              setAyahStart(1);
              setAyahEnd(Math.min(5, surah.numberOfAyahs));
            }}
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900"
          >
            {ALL_SURAHS.map((surah) => (
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
              type="number"
              min={1}
              max={selectedSurah.numberOfAyahs}
              value={ayahStart}
              required
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
              type="number"
              min={ayahStart}
              max={selectedSurah.numberOfAyahs}
              value={ayahEnd}
              required
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
            type="number"
            min={1}
            value={rewardPoints}
            required
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
};
