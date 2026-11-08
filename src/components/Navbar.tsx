import React from 'react';
import { motion, LayoutGroup } from 'motion/react';
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
    <header className="sticky top-0 z-40 border-b border-white/10 backdrop-blur-md bg-jade-950/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-2 sm:gap-4">
          {/* Brand Identity */}
          <div
            className="flex items-center gap-2 sm:gap-3 cursor-pointer"
            onClick={() => onSelectTab('recite')}
          >
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gold-400 text-jade-950 flex items-center justify-center shadow-lg shadow-gold-500/20 font-bold text-xl sm:text-2xl font-display">
              مُ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg sm:text-xl text-white tracking-tight font-display">
                  مُرتِّل
                </span>
                <span className="hidden sm:inline-flex text-xs bg-white/5 text-gold-200 font-medium px-2 py-0.5 rounded-md border border-gold-400/30">
                  القرآن الذكي
                </span>
              </div>
              <p className="text-[11px] text-jade-100/60 hidden sm:block">
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
                className="flex items-center gap-1 px-1.5 sm:gap-1.5 sm:px-2.5 py-1.5 rounded-lg bg-gold-400/15 hover:bg-gold-400/25 text-gold-200 border border-gold-400/30 text-xs font-medium transition-all group animate-pulse"
                title="تنبيه: آيات تحتاج لمراجعة وتثبيت"
              >
                <AlertTriangle className="w-4 h-4 text-gold-300 group-hover:scale-110 transition-transform" />
                <span className="hidden md:inline">آيات تحتاج تثبيت:</span>
                <span className="bg-gold-400 text-jade-950 text-[11px] font-bold px-1.5 py-0.2 rounded-full">
                  {forgottenVersesCount}
                </span>
              </button>
            )}

            {/* Streak Counter */}
            <div
              className="flex items-center gap-1 px-2 sm:gap-1.5 sm:px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-semibold"
              title="أيام الالتزام المتتالية بالحفظ والمراجعة"
            >
              <Flame className="w-4 h-4 text-gold-300 fill-gold-300" />
              <span>{stats.streakDays}</span>
              <span className="text-jade-100/60 font-normal hidden sm:inline">أيام</span>
            </div>

            {/* Points / Hasanat Counter */}
            <button
              onClick={onOpenRewards}
              className="flex items-center gap-1 px-2 sm:gap-1.5 sm:px-3 py-1.5 rounded-lg bg-gold-400/10 hover:bg-gold-400/20 text-gold-200 border border-gold-400/30 text-xs font-semibold transition-colors cursor-pointer"
              title="رصيد الحسنات ونقاط الإتقان - انقر لعرض الأوسمة"
            >
              <Sparkles className="w-4 h-4 text-gold-300" />
              <span>{stats.points.toLocaleString('ar-EG')}</span>
              <span className="text-gold-300 font-normal hidden sm:inline">حسنة</span>
            </button>

            {/* Audio Toggle Button */}
            <button
              onClick={onToggleAudioPlayer}
              className={`p-1.5 sm:p-2 rounded-lg border transition-all text-xs font-medium flex items-center gap-1 ${
                isAudioPlaying
                  ? 'bg-gold-400 text-jade-950 border-gold-400 shadow-lg shadow-gold-500/20 animate-pulse'
                  : 'bg-white/5 hover:bg-white/10 text-jade-100 border-white/10'
              }`}
              title="مشغل تلاوات القراء"
            >
              <Volume2 className="w-4 h-4" />
              <span className="hidden lg:inline">{isAudioPlaying ? 'قارئ نشط' : 'التلاوة'}</span>
            </button>
          </div>
        </div>

        {/* Navigation Bar / Tabs */}
        <LayoutGroup id="main-nav">
          <nav className="flex items-center gap-1 overflow-x-auto py-2 border-t border-white/10 no-scrollbar">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <motion.button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  className={`relative flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                    isActive
                      ? 'text-jade-950 font-bold'
                      : 'text-jade-100/70 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-active-pill"
                      className="absolute inset-0 bg-gold-400 rounded-lg shadow-lg shadow-gold-500/20"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon
                    className={`relative z-10 w-4 h-4 ${
                      isActive ? 'text-jade-900' : 'text-jade-100/50'
                    }`}
                  />
                  <span className="relative z-10">{item.label}</span>
                </motion.button>
              );
            })}
          </nav>
        </LayoutGroup>
      </div>
    </header>
  );
};
