import React from 'react';
import { Award, Check, Lock } from 'lucide-react';
import type { Badge as BadgeType, UserStats } from '../types/quran';
import { INITIAL_BADGES } from '../services/storageService';
import { Badge, Button, Modal } from './ui';
import { cn } from '../utils/cn';

interface RewardsModalProps {
  stats: UserStats;
  onClose: () => void;
}

export const RewardsModal: React.FC<RewardsModalProps> = ({ stats, onClose }) => {
  const allBadges: BadgeType[] = INITIAL_BADGES;

  return (
    <Modal
      open
      onClose={onClose}
      title="نظام المكافآت وأوسمة الإتقان"
      description="نقاط الحسنات والأوسمة التحفيزية لحفظة كتاب الله"
      icon={<Award className="h-5 w-5" />}
      footer={
        <Button onClick={onClose} size="md">
          إغلاق
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-emerald-800 to-teal-800 p-6 text-white shadow-sm sm:flex-row">
          <div className="space-y-1 text-center sm:text-right">
            <span className="text-xs font-medium text-amber-300">الرتبة القرآنية الحالية</span>
            <h3 className="font-serif text-2xl font-bold">{stats.level}</h3>
            <p className="text-xs text-emerald-100">
              واصل الحفظ والمراجعة للارتقاء إلى رتبة «فارس الحُفّاظ»
            </p>
          </div>

          <div className="rounded-2xl border border-white/20 bg-white/10 px-6 py-4 text-center backdrop-blur-md">
            <span className="block text-[11px] text-emerald-100">رصيد الحسنات والنقاط</span>
            <div className="mt-0.5 text-2xl font-bold text-amber-300">
              {stats.points.toLocaleString('ar-EG')}
            </div>
            <span className="text-[10px] text-emerald-200">10 حسنات لكل حرف تم تلاوته</span>
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-900">أوسمة الإنجاز والتثبيت</h3>
            <span className="text-xs text-stone-500">
              تم فتح {stats.unlockedBadgeIds.length} من {allBadges.length} أوسمة
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {allBadges.map((badge) => {
              const isUnlocked = stats.unlockedBadgeIds.includes(badge.id);

              return (
                <article
                  key={badge.id}
                  className={cn(
                    'flex items-start gap-3.5 rounded-2xl border p-4 transition-all',
                    isUnlocked
                      ? 'border-amber-300 bg-amber-50/50 shadow-xs'
                      : 'border-stone-200 bg-stone-50 opacity-60',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl',
                      isUnlocked ? 'bg-amber-100 shadow-inner' : 'bg-stone-200',
                    )}
                  >
                    {isUnlocked ? badge.icon : <Lock className="h-5 w-5 text-stone-400" />}
                  </div>

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-stone-900">{badge.title}</span>
                      <Badge tone="emerald">+{badge.pointsReward} حسنة</Badge>
                    </div>

                    <p className="text-xs leading-tight text-stone-600">{badge.description}</p>

                    <div className="flex items-center gap-1 pt-1 text-[10px] text-stone-500">
                      {isUnlocked ? (
                        <span className="flex items-center gap-0.5 font-bold text-emerald-700">
                          <Check className="h-3 w-3" /> تم الحصول عليه
                        </span>
                      ) : (
                        <span>الشرط: {badge.conditionDescription}</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <p className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-center font-serif text-xs leading-relaxed text-stone-700">
          «يُقَالُ لِصَاحِبِ الْقُرْآنِ: اقْرَأْ، وَارْتَقِ، وَرَتِّلْ كَمَا كُنْتَ تُرَتِّلُ فِي
          الدُّنْيَا، فَإِنَّ مَنْزِلَتَكَ عِنْدَ آخِرِ آيَةٍ تَقْرَؤُهَا»
        </p>
      </div>
    </Modal>
  );
};
