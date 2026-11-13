import React from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarClock,
  Cloud,
  CloudOff,
  Flame,
  GraduationCap,
  House,
  Loader2,
  LogOut,
  Mic,
  Sparkles,
  Trophy,
  Volume2,
} from 'lucide-react';
import type { AppTab, Riwaya, UserStats } from '../types/quran';
import type { ProgressSyncStatus } from '../services/storageService';
import { cn } from '../utils/cn';

const NAV_ITEMS: { id: AppTab; label: string; icon: typeof House }[] = [
  { id: 'home', label: 'الرئيسية', icon: House },
  { id: 'memorize', label: 'وضع الحفظ', icon: GraduationCap },
  { id: 'recite', label: 'التسميع والتصحيح', icon: Mic },
  { id: 'revision', label: 'خطط المراجعة والتثبيت', icon: CalendarClock },
  { id: 'explorer', label: 'المصحف والتفسير', icon: BookOpen },
  { id: 'competition', label: 'التحديات اليومية', icon: Trophy },
  { id: 'stats', label: 'إحصائيات الأداء', icon: BarChart3 },
];

interface NavbarProps {
  userEmail: string;
  onSignOut: () => void;
  currentTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  stats: UserStats;
  forgottenVersesCount: number;
  onOpenForgottenVerses: () => void;
  onOpenRewards: () => void;
  onToggleAudioPlayer: () => void;
  isAudioPlaying: boolean;
  syncStatus: ProgressSyncStatus;
  syncErrorMessage: string | null;
  onRetrySync: () => void;
  riwaya: Riwaya;
  onRiwayaChange: (riwaya: Riwaya) => void;
}

const SYNC_LABELS: Record<ProgressSyncStatus, string> = {
  syncing: 'جارٍ المزامنة',
  synced: 'محفوظ في السحابة',
  error: 'تعذرت المزامنة',
};

export const Navbar: React.FC<NavbarProps> = ({
  userEmail,
  onSignOut,
  currentTab,
  onSelectTab,
  stats,
  forgottenVersesCount,
  onOpenForgottenVerses,
  onOpenRewards,
  onToggleAudioPlayer,
  isAudioPlaying,
  syncStatus,
  syncErrorMessage,
  onRetrySync,
  riwaya,
  onRiwayaChange,
}) => {
  const SyncIcon =
    syncStatus === 'syncing' ? Loader2 : syncStatus === 'error' ? CloudOff : Cloud;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-jade-950/85 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-2 sm:h-20 sm:gap-4">
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-400 sm:gap-3 cursor-pointer"
            onClick={() => onSelectTab('home')}
            aria-label="العودة إلى الرئيسية"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gold-400 font-display text-xl font-bold text-jade-950 shadow-lg shadow-gold-500/20 sm:h-11 sm:w-11 sm:text-2xl">
              مُ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-bold tracking-tight text-white sm:text-xl">
                  مُرتِّل
                </span>
                <span className="hidden rounded-full border border-gold-400/30 bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold text-gold-200 sm:inline-flex">
                  القرآن الذكي
                </span>
              </div>
              <p className="hidden text-[11px] text-jade-100/60 sm:block">
                تحفيظ ومراجعة القرآن الكريم بالتصحيح الصوتي اللحظي
              </p>
            </div>
          </button>

          <div className="flex items-center gap-1 sm:gap-3">
            <button
              type="button"
              onClick={syncStatus === 'error' ? onRetrySync : undefined}
              disabled={syncStatus !== 'error'}
              title={
                syncStatus === 'error'
                  ? `${syncErrorMessage ?? SYNC_LABELS.error} — انقر لإعادة المحاولة`
                  : SYNC_LABELS[syncStatus]
              }
              className={cn(
                'hidden items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 md:flex',
                syncStatus === 'error'
                  ? 'cursor-pointer border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                  : 'border-white/10 bg-white/5 text-jade-100/70',
              )}
            >
              <SyncIcon
                className={cn('h-3.5 w-3.5', syncStatus === 'syncing' && 'animate-spin')}
              />
              <span>{SYNC_LABELS[syncStatus]}</span>
            </button>

            {forgottenVersesCount > 0 && (
              <button
                type="button"
                onClick={onOpenForgottenVerses}
                className="group flex items-center gap-1 rounded-xl border border-amber-400/30 bg-amber-500/15 px-1.5 py-1.5 text-xs font-medium text-amber-200 transition-all hover:border-amber-400/60 hover:bg-amber-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 sm:gap-1.5 sm:px-2.5 cursor-pointer"
                title="تنبيه: آيات تحتاج لمراجعة وتثبيت"
              >
                <AlertTriangle className="h-4 w-4 text-amber-300 transition-transform group-hover:scale-110" />
                <span className="hidden md:inline">آيات تحتاج تثبيت:</span>
                <span className="rounded-full bg-amber-500/30 px-1.5 py-0.5 text-[11px] font-bold text-amber-100 border border-amber-400/40">
                  {forgottenVersesCount.toLocaleString('ar-EG')}
                </span>
              </button>
            )}

            <div
              className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-semibold text-white sm:gap-1.5 sm:px-3"
              title="أيام الالتزام المتتالية بالحفظ والمراجعة"
            >
              <Flame className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span>{stats.streakDays.toLocaleString('ar-EG')}</span>
              <span className="hidden font-normal text-jade-100/60 sm:inline">أيام</span>
            </div>

            <button
              type="button"
              onClick={onOpenRewards}
              className="flex cursor-pointer items-center gap-1 rounded-xl border border-gold-400/30 bg-gold-400/10 px-2 py-1.5 text-xs font-semibold text-gold-200 transition-colors hover:border-gold-400/60 hover:bg-gold-400/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 sm:gap-1.5 sm:px-3"
              title="رصيد الحسنات ونقاط الإتقان - انقر لعرض الأوسمة"
            >
              <Sparkles className="h-4 w-4 text-gold-300" />
              <span>{stats.points.toLocaleString('ar-EG')}</span>
              <span className="hidden font-normal text-gold-200/80 sm:inline">حسنة</span>
            </button>

            <div
              className="flex items-center rounded-xl border border-white/10 bg-white/5 p-0.5"
              title="اختيار الرواية: حفص عن عاصم أو ورش عن نافع"
              role="group"
              aria-label="اختيار الرواية"
            >
              <button
                type="button"
                onClick={() => onRiwayaChange('hafs')}
                aria-pressed={riwaya === 'hafs'}
                className={cn(
                  'rounded-lg px-2 py-1 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-400 cursor-pointer',
                  riwaya === 'hafs'
                    ? 'bg-gold-400 text-jade-950 shadow-xs'
                    : 'text-jade-100/60 hover:text-white',
                )}
              >
                حفص
              </button>
              <button
                type="button"
                onClick={() => onRiwayaChange('warsh')}
                aria-pressed={riwaya === 'warsh'}
                className={cn(
                  'rounded-lg px-2 py-1 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-400 cursor-pointer',
                  riwaya === 'warsh'
                    ? 'bg-gold-400 text-jade-950 shadow-xs'
                    : 'text-jade-100/60 hover:text-white',
                )}
              >
                ورش
              </button>
            </div>

            <button
              type="button"
              onClick={onToggleAudioPlayer}
              className={cn(
                'flex items-center gap-1 rounded-xl border p-1.5 text-xs font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 sm:p-2 cursor-pointer',
                isAudioPlaying
                  ? 'border-gold-400 bg-gold-400 text-jade-950 font-bold shadow-sm'
                  : 'border-white/10 bg-white/5 text-jade-100 hover:border-gold-400/40 hover:bg-white/10',
              )}
              title="مشغل تلاوات القراء"
              aria-pressed={isAudioPlaying}
            >
              <Volume2 className="h-4 w-4" />
              <span className="hidden lg:inline">{isAudioPlaying ? 'قارئ نشط' : 'التلاوة'}</span>
            </button>

            <button
              type="button"
              onClick={onSignOut}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-medium text-jade-100/70 transition hover:border-red-500/40 hover:bg-red-500/15 hover:text-red-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 cursor-pointer"
              title={`تسجيل الخروج من ${userEmail}`}
              aria-label="تسجيل الخروج"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </div>

        <nav
          aria-label="التنقل الرئيسي"
          className="no-scrollbar flex snap-x snap-mandatory items-center gap-1 overflow-x-auto border-t border-white/10 py-2"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex snap-start items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 sm:px-4 sm:text-sm cursor-pointer',
                  isActive
                    ? 'bg-gold-400 text-jade-950 font-bold shadow-sm shadow-gold-500/20 after:absolute after:bottom-1 after:left-1/2 after:h-0.5 after:w-5 after:-translate-x-1/2 after:rounded-full after:bg-jade-950'
                    : 'text-jade-100/75 hover:bg-white/10 hover:text-white',
                )}
              >
                <Icon className={cn('h-4 w-4', isActive ? 'text-jade-950' : 'text-jade-200/70')} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
