import React from 'react';
import { Play, Target, Trophy } from 'lucide-react';
import { QuranChallenge } from '../types/quran';
import { Badge, Button, EmptyState, PageHero, SectionCard } from './ui';

interface CompetitionLeaderboardProps {
  challenges: QuranChallenge[];
  onStartChallenge: (challenge: QuranChallenge) => void;
}

export const CompetitionLeaderboard: React.FC<CompetitionLeaderboardProps> = ({
  challenges,
  onStartChallenge,
}) => (
  <div className="mx-auto max-w-5xl space-y-6" dir="rtl">
    <PageHero
      eyebrow="وفي ذلك فليتنافس المتنافسون"
      icon={<Trophy className="h-4 w-4" />}
      title="تحديات التسميع اليومية"
      description="اختر تحديًا لمراجعة آيات القرآن. ترتيب الأصدقاء غير متاح حاليًا؛ لن نعرض بيانات منافسة غير حقيقية."
    />

    <SectionCard
      title="التحديات المتاحة"
      description="تحديات قصيرة تمنحك نقاطًا إضافية عند إتمامها."
      icon={<Target className="h-5 w-5" />}
      action={<Badge tone="emerald">{challenges.length} تحديات</Badge>}
    >
      {challenges.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-5 w-5" />}
          title="لا توجد تحديات حاليًا"
          description="ستظهر التحديات الجديدة هنا عند إضافتها."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {challenges.map((challenge) => (
            <article
              key={challenge.id}
              className="flex flex-col justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-xs transition-colors hover:border-emerald-300"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <Badge tone="amber">+{challenge.rewardPoints} نقطة</Badge>
                  <span className="text-stone-500">{challenge.difficulty}</span>
                </div>
                <h3 className="text-sm font-bold leading-snug text-stone-900">
                  {challenge.title}
                </h3>
              </div>

              <div className="flex items-center justify-between border-t border-stone-100 pt-2 text-xs">
                <span className="text-stone-500">ينتهي خلال {challenge.expiresInHours} ساعة</span>
                <Button
                  size="sm"
                  icon={<Play className="h-3.5 w-3.5" />}
                  onClick={() => onStartChallenge(challenge)}
                  aria-label={`بدء التحدي: ${challenge.title}`}
                >
                  بدء التحدي
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </SectionCard>
  </div>
);
