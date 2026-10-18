import React from 'react';
import { Award, Sparkles, X, Check, Lock, Flame, Shield, Crown } from 'lucide-react';
import { UserStats, Badge } from '../types/quran';
import { INITIAL_BADGES } from '../services/storageService';

interface RewardsModalProps {
  stats: UserStats;
  onClose: () => void;
}

export const RewardsModal: React.FC<RewardsModalProps> = ({ stats, onClose }) => {
  const allBadges: Badge[] = INITIAL_BADGES;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
              <Award className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-stone-900 text-base">نظام المكافآت وأوسمة الإتقان</h3>
              <p className="text-xs text-stone-500">
                نقاط الحسنات والأوسمة التحفيزية لحفظة كتاب الله
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-2 rounded-xl hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Level & Points Banner */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-800 rounded-2xl p-6 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="space-y-1 text-center sm:text-right">
            <span className="text-xs text-amber-300 font-medium">الرتبة القرآنية الحالية</span>
            <h4 className="text-2xl font-bold font-serif">{stats.level}</h4>
            <p className="text-xs text-emerald-100">
              واصل الحفظ والمراجعة للارتقاء إلى رتبة «فارس الحُفّاظ»
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl px-6 py-4 text-center border border-white/20">
            <span className="text-[11px] text-emerald-100 block">رصيد الحسنات والنقاط</span>
            <div className="text-2xl font-bold text-amber-300 mt-0.5">
              {stats.points.toLocaleString('ar-EG')}
            </div>
            <span className="text-[10px] text-emerald-200">10 حسنات لكل حرف تم تلاوته</span>
          </div>
        </div>

        {/* Badges Collection Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-stone-900 text-sm">أوسمة الإنجاز والتثبيت</h4>
            <span className="text-xs text-stone-500">
              تم فتح {stats.unlockedBadgeIds.length} من {allBadges.length} أوسمة
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {allBadges.map((badge) => {
              const isUnlocked = stats.unlockedBadgeIds.includes(badge.id);

              return (
                <div
                  key={badge.id}
                  className={`p-4 rounded-2xl border transition-all flex items-start gap-3.5 ${
                    isUnlocked
                      ? 'bg-amber-50/50 border-amber-300 shadow-xs'
                      : 'bg-stone-50 border-stone-200 opacity-60'
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${
                      isUnlocked ? 'bg-amber-100 shadow-inner' : 'bg-stone-200'
                    }`}
                  >
                    {isUnlocked ? badge.icon : <Lock className="w-5 h-5 text-stone-400" />}
                  </div>

                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-stone-900 text-sm">{badge.title}</span>
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                        +{badge.pointsReward} حسنة
                      </span>
                    </div>

                    <p className="text-xs text-stone-600 leading-tight">{badge.description}</p>

                    <div className="text-[10px] text-stone-500 flex items-center gap-1 pt-1">
                      {isUnlocked ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> تم الحصول عليه
                        </span>
                      ) : (
                        <span>الشرط: {badge.conditionDescription}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hadith Quote */}
        <div className="bg-stone-50 rounded-2xl p-4 text-center border border-stone-200 text-xs text-stone-700 leading-relaxed font-serif">
          «يُقَالُ لِصَاحِبِ الْقُرْآنِ: اقْرَأْ، وَارْتَقِ، وَرَتِّلْ كَمَا كُنْتَ تُرَتِّلُ فِي
          الدُّنْيَا، فَإِنَّ مَنْزِلَتَكَ عِنْدَ آخِرِ آيَةٍ تَقْرَؤُهَا»
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-xs shadow-xs cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
