import React from 'react';
import {
  Mic,
  CalendarClock,
  Trophy,
  BarChart3,
  BookOpen,
  Award,
  Flame,
  AlertTriangle,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { UserStats } from '../types/quran';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  stats: UserStats;
  forgottenVersesCount: number;
  onOpenForgottenVerses: () => void;
  onOpenRewards: () => void;
  onToggleAudioPlayer: () => void;
  isAudioPlaying: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  stats,
  forgottenVersesCount,
  onOpenForgottenVerses,
  onOpenRewards,
  onToggleAudioPlayer,
  isAudioPlaying,
}) => {
  const navItems = [
    { id: 'recite', label: 'التسميع والتصحيح', icon: Mic },
    { id: 'revision', label: 'خطط المراجعة والتثبيت', icon: CalendarClock },
    { id: 'explorer', label: 'المصحف والتفسير', icon: BookOpen },
    { id: 'competition', label: 'التنافس والأصدقاء', icon: Trophy },
    { id: 'stats', label: 'إحصائيات الأداء', icon: BarChart3 },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-2 sm:gap-4">
          {/* Brand Identity */}
          <div
            className="flex items-center gap-2 sm:gap-3 cursor-pointer"
            onClick={() => onSelectTab('recite')}
          >
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-emerald-700 text-amber-300 flex items-center justify-center shadow-inner font-bold text-xl sm:text-2xl font-serif">
              مُ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg sm:text-xl text-stone-900 tracking-tight font-serif">
                  مُرتِّل
                </span>
                <span className="hidden sm:inline-flex text-xs bg-emerald-50 text-emerald-800 font-medium px-2 py-0.5 rounded-sm border border-emerald-200">
                  القرآن الذكي
                </span>
              </div>
              <p className="text-[11px] text-stone-500 hidden sm:block">
                تحفيظ ومراجعة القرآن الكريم بالتصحيح الصوتي اللحظي
              </p>
            </div>
          </div>

          {/* Quick Stat Indicators */}
          <div className="flex items-center gap-1 sm:gap-3">
            {/* Forgotten Verses Alert (if any exist) */}
            {forgottenVersesCount > 0 && (
              <button
                onClick={onOpenForgottenVerses}
                className="flex items-center gap-1 px-1.5 sm:gap-1.5 sm:px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-medium transition-all group animate-pulse"
                title="تنبيه: آيات تحتاج لمراجعة وتثبيت"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 group-hover:scale-110 transition-transform" />
                <span className="hidden md:inline">آيات تحتاج تثبيت:</span>
                <span className="bg-amber-600 text-white text-[11px] font-bold px-1.5 py-0.2 rounded-full">
                  {forgottenVersesCount}
                </span>
              </button>
            )}

            {/* Streak Counter */}
            <div
              className="flex items-center gap-1 px-2 sm:gap-1.5 sm:px-3 py-1.5 rounded-lg bg-stone-100/90 text-stone-800 text-xs font-semibold"
              title="أيام الالتزام المتتالية بالحفظ والمراجعة"
            >
              <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span>{stats.streakDays}</span>
              <span className="text-stone-500 font-normal hidden sm:inline">أيام</span>
            </div>

            {/* Points / Hasanat Counter */}
            <button
              onClick={onOpenRewards}
              className="flex items-center gap-1 px-2 sm:gap-1.5 sm:px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100/80 text-emerald-900 border border-emerald-200 text-xs font-semibold transition-colors cursor-pointer"
              title="رصيد الحسنات ونقاط الإتقان - انقر لعرض الأوسمة"
            >
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>{stats.points.toLocaleString('ar-EG')}</span>
              <span className="text-emerald-700 font-normal hidden sm:inline">حسنة</span>
            </button>

            {/* Audio Toggle Button */}
            <button
              onClick={onToggleAudioPlayer}
              className={`p-1.5 sm:p-2 rounded-lg border transition-all text-xs font-medium flex items-center gap-1 ${
                isAudioPlaying
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm animate-pulse'
                  : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-200'
              }`}
              title="مشغل تلاوات القراء"
            >
              <Volume2 className="w-4 h-4" />
              <span className="hidden lg:inline">{isAudioPlaying ? 'قارئ نشط' : 'التلاوة'}</span>
            </button>
          </div>
        </div>

        {/* Navigation Bar / Tabs */}
        <nav className="flex items-center gap-1 overflow-x-auto py-2 border-t border-stone-100 no-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-amber-300' : 'text-stone-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
